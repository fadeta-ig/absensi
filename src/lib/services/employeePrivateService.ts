import { Prisma } from "@prisma/client";
import type { AuditActor } from "@/lib/services/auditService";
import { decryptPii, encryptPii, hashPii } from "@/lib/security/pii";

export interface EmployeePrivateMutationInput {
    birthPlace?: string | null;
    birthDate?: string | null;
    maritalStatus?: string | null;
    bloodType?: string | null;
    religion?: string | null;
    lastEducation?: string | null;
    notes?: string | null;
    nationalId?: string | null;
    familyCardNumber?: string | null;
    bpjsEmploymentNumber?: string | null;
    bpjsHealthNumber?: string | null;
    idCardAddress?: string | null;
    domicileAddress?: string | null;
    emergencyContactName?: string | null;
    emergencyContactRelationship?: string | null;
    emergencyContactPhone?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    bankAccountHolderName?: string | null;
    ptkpStatus?: string | null;
    ptkpEffectiveDate?: string | null;
}

export const employeePrivateRelations = {
    privateProfile: true,
    identity: true,
    addresses: true,
    emergencyContacts: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
    bankAccounts: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
    taxProfile: true,
} satisfies Prisma.EmployeeInclude;

function hasOwn(input: object, key: keyof EmployeePrivateMutationInput): boolean {
    return Object.prototype.hasOwnProperty.call(input, key);
}

function dateOrNull(value: string | null | undefined): Date | null {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function nonEmpty(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

export async function applyEmployeePrivateData(
    tx: Prisma.TransactionClient,
    employeeId: string,
    input: EmployeePrivateMutationInput,
    actor: AuditActor,
): Promise<void> {
    const profileUpdate: Prisma.EmployeePrivateProfileUncheckedUpdateInput = {};
    if (hasOwn(input, "birthPlace")) profileUpdate.birthPlace = nonEmpty(input.birthPlace);
    if (hasOwn(input, "birthDate")) profileUpdate.birthDate = dateOrNull(input.birthDate);
    if (hasOwn(input, "maritalStatus")) profileUpdate.maritalStatus = nonEmpty(input.maritalStatus);
    if (hasOwn(input, "bloodType")) profileUpdate.bloodType = nonEmpty(input.bloodType)?.toUpperCase() ?? null;
    if (hasOwn(input, "religion")) profileUpdate.religion = nonEmpty(input.religion);
    if (hasOwn(input, "lastEducation")) profileUpdate.lastEducation = nonEmpty(input.lastEducation);
    if (hasOwn(input, "notes")) profileUpdate.notes = nonEmpty(input.notes);
    if (Object.keys(profileUpdate).length > 0) {
        await tx.employeePrivateProfile.upsert({
            where: { employeeId },
            create: { employeeId, ...profileUpdate } as Prisma.EmployeePrivateProfileUncheckedCreateInput,
            update: profileUpdate,
        });
    }

    const identityUpdate: Prisma.EmployeeIdentityUncheckedUpdateInput = {};
    if (hasOwn(input, "nationalId")) {
        identityUpdate.nationalId = encryptPii(input.nationalId);
        identityUpdate.nationalIdHash = hashPii(input.nationalId);
    }
    if (hasOwn(input, "familyCardNumber")) {
        identityUpdate.familyCardNumber = encryptPii(input.familyCardNumber);
        identityUpdate.familyCardNumberHash = hashPii(input.familyCardNumber);
    }
    if (hasOwn(input, "bpjsEmploymentNumber")) {
        identityUpdate.bpjsEmploymentNumber = encryptPii(input.bpjsEmploymentNumber);
        identityUpdate.bpjsEmploymentHash = hashPii(input.bpjsEmploymentNumber);
    }
    if (hasOwn(input, "bpjsHealthNumber")) {
        identityUpdate.bpjsHealthNumber = encryptPii(input.bpjsHealthNumber);
        identityUpdate.bpjsHealthHash = hashPii(input.bpjsHealthNumber);
    }
    if (Object.keys(identityUpdate).length > 0) {
        await tx.employeeIdentity.upsert({
            where: { employeeId },
            create: { employeeId, ...identityUpdate } as Prisma.EmployeeIdentityUncheckedCreateInput,
            update: identityUpdate,
        });
    }

    for (const [field, type] of [["idCardAddress", "ID_CARD"], ["domicileAddress", "DOMICILE"]] as const) {
        if (!hasOwn(input, field)) continue;
        const address = nonEmpty(input[field]);
        if (!address) {
            await tx.employeeAddress.deleteMany({ where: { employeeId, type } });
        } else {
            await tx.employeeAddress.upsert({
                where: { employeeId_type: { employeeId, type } },
                create: { employeeId, type, address },
                update: { address },
            });
        }
    }

    const emergencyTouched = ["emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone"]
        .some((key) => hasOwn(input, key as keyof EmployeePrivateMutationInput));
    if (emergencyTouched) {
        const name = nonEmpty(input.emergencyContactName);
        const relationship = nonEmpty(input.emergencyContactRelationship);
        const phone = nonEmpty(input.emergencyContactPhone);
        if ([name, relationship, phone].some(Boolean) && !(name && relationship && phone)) {
            throw new Error("Nama, hubungan, dan nomor telepon kontak darurat harus diisi lengkap.");
        }
        await tx.employeeEmergencyContact.deleteMany({ where: { employeeId, isPrimary: true } });
        if (name && relationship && phone) {
            await tx.employeeEmergencyContact.create({ data: { employeeId, name, relationship, phone, isPrimary: true } });
        }
    }

    const bankTouched = ["bankName", "bankAccountNumber", "bankAccountHolderName"]
        .some((key) => hasOwn(input, key as keyof EmployeePrivateMutationInput));
    if (bankTouched) {
        const bankName = nonEmpty(input.bankName);
        const accountNumber = nonEmpty(input.bankAccountNumber);
        const accountHolderName = nonEmpty(input.bankAccountHolderName);
        if ([bankName, accountNumber, accountHolderName].some(Boolean) && !(bankName && accountNumber && accountHolderName)) {
            throw new Error("Nama bank, nomor rekening, dan nama pemilik rekening harus diisi lengkap.");
        }
        await tx.employeeBankAccount.deleteMany({ where: { employeeId, isPrimary: true } });
        if (bankName && accountNumber && accountHolderName) {
            await tx.employeeBankAccount.create({
                data: {
                    employeeId,
                    bankName,
                    accountNumber: encryptPii(accountNumber)!,
                    accountNumberHash: hashPii(accountNumber)!,
                    accountHolderName,
                    isPrimary: true,
                },
            });
        }
    }

    if (hasOwn(input, "ptkpStatus") || hasOwn(input, "ptkpEffectiveDate")) {
        const status = nonEmpty(input.ptkpStatus);
        if (!status) {
            await tx.employeeTaxProfile.deleteMany({ where: { employeeId } });
        } else {
            const effectiveDate = dateOrNull(input.ptkpEffectiveDate);
            if (!effectiveDate) throw new Error("Tanggal berlaku PTKP wajib diisi.");
            const current = await tx.employeeTaxProfile.findUnique({ where: { employeeId } });
            const changed = !current || current.ptkpStatus !== status || current.effectiveDate.getTime() !== effectiveDate.getTime();
            await tx.employeeTaxProfile.upsert({
                where: { employeeId },
                create: { employeeId, ptkpStatus: status, effectiveDate },
                update: { ptkpStatus: status, effectiveDate },
            });
            if (changed) {
                await tx.employeeTaxHistory.create({
                    data: {
                        employeeId,
                        previousPtkpStatus: current?.ptkpStatus ?? null,
                        ptkpStatus: status,
                        effectiveDate,
                        changedByUserId: actor.userId ?? null,
                        changedByIdentifier: actor.identifier,
                        changedByName: actor.name ?? null,
                        changedByRole: actor.role ?? null,
                    },
                });
            }
        }
    }
}

export function serializeEmployeePrivateData(employee: Prisma.EmployeeGetPayload<{ include: typeof employeePrivateRelations }>) {
    const primaryEmergency = employee.emergencyContacts[0] ?? null;
    const primaryBank = employee.bankAccounts[0] ?? null;
    const addressByType = new Map(employee.addresses.map((address) => [address.type, address.address]));

    return {
        birthPlace: employee.privateProfile?.birthPlace ?? null,
        birthDate: employee.privateProfile?.birthDate?.toISOString().slice(0, 10) ?? null,
        maritalStatus: employee.privateProfile?.maritalStatus ?? null,
        bloodType: employee.privateProfile?.bloodType ?? null,
        religion: employee.privateProfile?.religion ?? null,
        lastEducation: employee.privateProfile?.lastEducation ?? null,
        notes: employee.privateProfile?.notes ?? null,
        nationalId: decryptPii(employee.identity?.nationalId),
        familyCardNumber: decryptPii(employee.identity?.familyCardNumber),
        bpjsEmploymentNumber: decryptPii(employee.identity?.bpjsEmploymentNumber),
        bpjsHealthNumber: decryptPii(employee.identity?.bpjsHealthNumber),
        idCardAddress: addressByType.get("ID_CARD") ?? null,
        domicileAddress: addressByType.get("DOMICILE") ?? null,
        emergencyContactName: primaryEmergency?.name ?? null,
        emergencyContactRelationship: primaryEmergency?.relationship ?? null,
        emergencyContactPhone: primaryEmergency?.phone ?? null,
        bankName: primaryBank?.bankName ?? null,
        bankAccountNumber: decryptPii(primaryBank?.accountNumber),
        bankAccountHolderName: primaryBank?.accountHolderName ?? null,
        ptkpStatus: employee.taxProfile?.ptkpStatus ?? null,
        ptkpEffectiveDate: employee.taxProfile?.effectiveDate.toISOString().slice(0, 10) ?? null,
    };
}
