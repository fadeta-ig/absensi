import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        equipmentTemplate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
        equipmentUnit: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        equipmentProduct: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
        equipmentProductTool: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        equipmentAssignment: { findMany: vi.fn(), count: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

const requireAuthMock = vi.fn();

vi.mock("@/lib/middleware/apiGuard", async () => {
    const { NextResponse } = await import("next/server");
    return {
        requireAuth: (...args: unknown[]) => requireAuthMock(...args),
        unauthorizedResponse: () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        forbiddenResponse: () => NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        validateBody: async (req: Request, schema: { parse: (v: unknown) => unknown }) => {
            const raw = await req.json();
            return { data: schema.parse(raw) };
        },
        serverErrorResponse: (_ctx: string, err: unknown) =>
            NextResponse.json({ error: String(err) }, { status: 500 }),
    };
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    EQUIPMENT_SETTINGS_DELEGATES_KEY,
    EQUIPMENT_SETTINGS_SCOPES,
    type EquipmentSettingsScope,
} from "@/lib/services/equipmentAuth";
import {
    createEquipmentTemplate,
    createEquipmentUnit,
    getActiveEquipmentSettingsScopes,
    getEmployeeEquipmentCapabilities,
    getEquipmentApproversForAdmin,
    getEquipmentAssignments,
    getEquipmentQcMembersForAdmin,
    getEquipmentSettingsDelegatesForAdmin,
    getEquipmentTemplates,
    getEquipmentTopViewersForAdmin,
    getEquipmentUnits,
    invalidateEquipmentQcMembersCache,
    setEquipmentApprovers,
    setEquipmentQcMembers,
    setEquipmentSettingsDelegates,
    setEquipmentTopViewers,
    updateEquipmentUnit,
} from "@/lib/services/equipmentService";
import {
    createEquipmentProduct,
    getProductToolChecklist,
    listEquipmentProducts,
} from "@/lib/services/equipmentProductService";
import {
    GET as getDelegatesRoute,
    POST as postDelegatesRoute,
} from "@/app/api/ga/equipment/settings/delegates/route";

const mocked = vi.mocked(prisma, true);

function wigSession() {
    return {
        userId: "u-wig",
        username: "WIG002",
        name: "GA Admin",
        primaryRole: "GA_ADMIN",
        roles: ["GA_ADMIN"],
        permissions: ["ga.manage"],
        employeeId: null,
    } as never;
}

function picSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-pic",
        username: "PIC-001",
        name: "Budi PIC",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "PIC-001",
        ...over,
    } as never;
}

const actor = { userId: "u-pic", username: "PIC-001" };

function mockDelegatesConfig(
    entries: Array<{ employeeId: string; scopes: EquipmentSettingsScope[]; expiresOnWibDate?: string | null }>,
    extraSettings: Record<string, unknown> = {}
) {
    mocked.appSetting.findUnique.mockImplementation((async (args: { where: { key: string } }) => {
        if (args.where.key === EQUIPMENT_SETTINGS_DELEGATES_KEY) {
            return { value: JSON.stringify(entries) };
        }
        if (args.where.key in extraSettings) {
            return { value: JSON.stringify(extraSettings[args.where.key]) };
        }
        return null;
    }) as never);
}

function mockActiveEmployee(employeeId = "PIC-001", name = "Budi PIC") {
    mocked.employee.findFirst.mockResolvedValue({
        employeeId,
        name,
        isActive: true,
        userAccount: { id: `u-${employeeId}` },
    } as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateEquipmentQcMembersCache();
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.appSetting.upsert.mockResolvedValue({} as never);
    mocked.equipmentAssignment.findMany.mockResolvedValue([]);
});

describe("meta-governance lock (delegates WIG002-only)", () => {
    it("PIC delegasi dengan semua 5 scope tetap ditolak 403 saat membaca atau mengubah daftar delegasi", async () => {
        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: [...EQUIPMENT_SETTINGS_SCOPES] }]);
        mockActiveEmployee("PIC-001");

        await expect(getEquipmentSettingsDelegatesForAdmin(picSession())).rejects.toMatchObject({ statusCode: 403 });
        await expect(
            setEquipmentSettingsDelegates(
                picSession(),
                [{ employeeId: "EMP-2", scopes: ["assignments"] }],
                actor
            )
        ).rejects.toMatchObject({ statusCode: 403 });

        requireAuthMock.mockResolvedValue(picSession());
        expect((await getDelegatesRoute()).status).toBe(403);
        expect(
            (
                await postDelegatesRoute(
                    new NextRequest("http://localhost/api/ga/equipment/settings/delegates", {
                        method: "POST",
                        body: JSON.stringify({ delegates: [{ employeeId: "EMP-2", scopes: ["assignments"] }] }),
                    })
                )
            ).status
        ).toBe(403);
    });

    it("WIG002 dapat menyimpan PIC delegasi valid dan menolak duplikat / >10 / tanggal tidak valid / outsource", async () => {
        mockActiveEmployee("PIC-001");
        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: ["products", "assignments"], expiresOnWibDate: "2099-12-31" }]);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "PIC-001", name: "Budi PIC", isActive: true }] as never);

        const saved = await setEquipmentSettingsDelegates(
            wigSession(),
            [{ employeeId: "PIC-001", scopes: ["products", "assignments"], expiresOnWibDate: "2099-12-31" }],
            { userId: "u-wig", username: "WIG002" }
        );
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({ employeeId: "PIC-001", scopes: ["products", "assignments"], isExpired: false });
        expect(mocked.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: "SET_EQUIPMENT_SETTINGS_DELEGATES" }),
            })
        );

        await expect(
            setEquipmentSettingsDelegates(
                wigSession(),
                [
                    { employeeId: "PIC-001", scopes: ["units"] },
                    { employeeId: "PIC-001", scopes: ["products"] },
                ],
                { userId: "u-wig", username: "WIG002" }
            )
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(
            setEquipmentSettingsDelegates(
                wigSession(),
                [{ employeeId: "PIC-001", scopes: ["units"], expiresOnWibDate: "2026-02-31" }],
                { userId: "u-wig", username: "WIG002" }
            )
        ).rejects.toMatchObject({ statusCode: 400 });

        const eleven = Array.from({ length: 11 }, (_, i) => ({ employeeId: `E-${i}`, scopes: ["units" as const] }));
        await expect(
            setEquipmentSettingsDelegates(wigSession(), eleven, { userId: "u-wig", username: "WIG002" })
        ).rejects.toMatchObject({ statusCode: 409 });

        mocked.employee.findFirst.mockResolvedValueOnce(null);
        await expect(
            setEquipmentSettingsDelegates(
                wigSession(),
                [{ employeeId: "OUT-1", scopes: ["units"] }],
                { userId: "u-wig", username: "WIG002" }
            )
        ).rejects.toMatchObject({ statusCode: 422 });
    });
});

describe("per-tab scoped delegation & read dependencies", () => {
    it("PIC scope assignments boleh baca units/products/checklist, kelola assignments & anggota QC, tapi ditolak tulis template/unit/produk/atasan", async () => {
        mockDelegatesConfig(
            [{ employeeId: "PIC-001", scopes: ["assignments"] }],
            { "equipment.qcMembers.WIG": ["QC-001"] }
        );
        mockActiveEmployee("PIC-001");
        mocked.equipmentAssignment.findMany.mockResolvedValue([] as never);
        mocked.equipmentUnit.findMany.mockResolvedValue([] as never);
        mocked.equipmentProduct.findMany.mockResolvedValue([] as never);
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "WIG", name: "P1" } as never);
        mocked.equipmentProductTool.findMany.mockResolvedValue([] as never);
        mocked.employee.findMany.mockResolvedValue([
            { employeeId: "QC-001", name: "Siti QC", isActive: true, email: null },
        ] as never);

        await expect(getEquipmentAssignments(picSession())).resolves.toEqual([]);
        await expect(getEquipmentUnits(picSession())).resolves.toEqual([]);
        await expect(listEquipmentProducts(picSession(), "WIG")).resolves.toEqual([]);
        await expect(getProductToolChecklist(picSession(), "p1")).resolves.toMatchObject({ totalCount: 0 });
        await expect(getEquipmentQcMembersForAdmin(picSession(), "WIG")).resolves.toHaveLength(1);
        await expect(setEquipmentQcMembers(picSession(), "WIG", ["QC-001", "QC-002"], actor)).resolves.toEqual([
            "QC-001",
            "QC-002",
        ]);

        // Deny-by-default pada scope di luar assignments (termasuk atasan: Top Reviewer & Approver Final)
        await expect(createEquipmentTemplate(picSession(), "T1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(createEquipmentUnit(picSession(), { name: "U1", templateId: "t1" })).rejects.toMatchObject({ statusCode: 403 });
        await expect(createEquipmentProduct(picSession(), { company: "WIG", name: "P2" })).rejects.toMatchObject({ statusCode: 403 });
        await expect(getEquipmentApproversForAdmin(picSession(), "WIG")).rejects.toMatchObject({ statusCode: 403 });
        await expect(getEquipmentTopViewersForAdmin(picSession())).rejects.toMatchObject({ statusCode: 403 });
    });

    it("PIC scope units boleh baca templates (read dependency) dan tulis units, tapi ditolak tulis template atau assignments", async () => {
        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: ["units"] }]);
        mockActiveEmployee("PIC-001");
        mocked.equipmentTemplate.findMany.mockResolvedValue([] as never);
        mocked.equipmentTemplate.findUnique.mockResolvedValue({ id: "t1", isActive: true } as never);
        mocked.equipmentUnit.create.mockResolvedValue({ id: "u1", name: "Mixer", company: "WIG", isSharedBoth: false } as never);

        await expect(getEquipmentTemplates(picSession())).resolves.toEqual([]);
        await expect(createEquipmentUnit(picSession(), { name: "Mixer", templateId: "t1", companies: ["WIG"] })).resolves.toMatchObject({ id: "u1" });

        await expect(createEquipmentTemplate(picSession(), "Baru")).rejects.toMatchObject({ statusCode: 403 });
        await expect(getEquipmentAssignments(picSession())).rejects.toMatchObject({ statusCode: 403 });
    });

    it("PIC scope products boleh baca units tapi ditolak mutasi unit (PATCH /units)", async () => {
        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: ["products"] }]);
        mockActiveEmployee("PIC-001");
        mocked.equipmentUnit.findMany.mockResolvedValue([] as never);

        await expect(getEquipmentUnits(picSession())).resolves.toEqual([]);
        await expect(updateEquipmentUnit(picSession(), "u1", { companies: ["WIG"] })).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("SoD anti self-elevation pada Anggota QC (assignments) dan Atasan (atasan)", () => {
    it("PIC delegasi scope assignments diblokir 403 bila menambahkan dirinya sendiri ke Anggota QC, tapi boleh menambahkan orang lain", async () => {
        mockDelegatesConfig(
            [{ employeeId: "PIC-001", scopes: ["assignments"] }],
            { "equipment.qcMembers.WIG": ["QC-001"] }
        );
        mockActiveEmployee("PIC-001");

        await expect(setEquipmentQcMembers(picSession(), "WIG", ["QC-001", "PIC-001"], actor)).rejects.toMatchObject({ statusCode: 403 });
        await expect(setEquipmentQcMembers(picSession(), "WIG", ["QC-001", "QC-002"], actor)).resolves.toEqual(["QC-001", "QC-002"]);
    });

    it("PIC delegasi scope atasan diblokir 403 mengelola Anggota QC dan diblokir 403 menambahkan dirinya sendiri ke Approver/Top Viewer", async () => {
        mockDelegatesConfig(
            [{ employeeId: "PIC-001", scopes: ["atasan"] }],
            {
                "equipment.qcMembers.WIG": ["QC-001"],
                "equipment.approvers.WIG": ["AP-001"],
                "equipment.topViewers": ["TOP-001"],
            }
        );
        mockActiveEmployee("PIC-001");

        // Anggota QC sudah masuk ranah assignments — scope atasan saja tidak boleh baca/tulis QC
        await expect(getEquipmentQcMembersForAdmin(picSession(), "WIG")).rejects.toMatchObject({ statusCode: 403 });
        await expect(setEquipmentQcMembers(picSession(), "WIG", ["QC-001", "QC-002"], actor)).rejects.toMatchObject({ statusCode: 403 });

        // SoD anti self-elevation pada Approver Final & Top Reviewer
        await expect(setEquipmentApprovers(picSession(), "WIG", ["AP-001", "PIC-001"], actor)).rejects.toMatchObject({ statusCode: 403 });
        await expect(setEquipmentTopViewers(picSession(), ["TOP-001", "PIC-001"], actor)).rejects.toMatchObject({ statusCode: 403 });

        // Boleh menambahkan orang lain (bukan diri sendiri) pada Top Reviewer & Approver Final
        await expect(setEquipmentApprovers(picSession(), "WIG", ["AP-001", "AP-002"], actor)).resolves.toEqual(["AP-001", "AP-002"]);
        await expect(setEquipmentTopViewers(picSession(), ["TOP-001", "TOP-002"], actor)).resolves.toEqual(["TOP-001", "TOP-002"]);
    });

    it("PIC scope assignments yang sebelumnya sudah ditetapkan WIG002 sebagai QC tetap dapat memperbarui anggota QC lain tanpa harus menghapus dirinya sendiri", async () => {
        mockDelegatesConfig(
            [{ employeeId: "PIC-001", scopes: ["assignments"] }],
            { "equipment.qcMembers.WIG": ["PIC-001"] }
        );
        mockActiveEmployee("PIC-001");

        await expect(setEquipmentQcMembers(picSession(), "WIG", ["PIC-001", "QC-002"], actor)).resolves.toEqual(["PIC-001", "QC-002"]);
    });
});

describe("live revocation, expiry & capabilities", () => {
    it("delegasi kedaluwarsa, karyawan nonaktif, atau tanpa employee.self langsung kehilangan akses", async () => {
        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: ["templates"], expiresOnWibDate: "2020-01-01" }]);
        mockActiveEmployee("PIC-001");
        await expect(getActiveEquipmentSettingsScopes(picSession())).resolves.toEqual([]);

        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: ["templates"], expiresOnWibDate: null }]);
        mocked.employee.findFirst.mockResolvedValue(null);
        await expect(getActiveEquipmentSettingsScopes(picSession())).resolves.toEqual([]);

        mockActiveEmployee("PIC-001");
        await expect(getActiveEquipmentSettingsScopes(picSession({ permissions: [] }))).resolves.toEqual([]);
    });

    it("getEmployeeEquipmentCapabilities melaporkan canManageSettings dan manageScopes bagi PIC aktif", async () => {
        mockDelegatesConfig([{ employeeId: "PIC-001", scopes: ["products", "assignments"], expiresOnWibDate: null }]);
        mockActiveEmployee("PIC-001");
        mocked.equipmentAssignment.count.mockResolvedValue(0);

        const caps = await getEmployeeEquipmentCapabilities(picSession());
        expect(caps.canManageSettings).toBe(true);
        expect(caps.manageScopes).toEqual(["products", "assignments"]);
    });
});
