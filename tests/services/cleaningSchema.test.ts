import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RBAC_DEFINITIONS, ensureRbac } from "../../prisma/seedRbac";
import {
    getLandingPath,
    PERMISSIONS,
    SYSTEM_ROLES,
} from "@/lib/permissions";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

describe("Core cleaning schema and RBAC contract", () => {
    it("AC-1 and AC-3 define every daily cleaning table and both required unique constraints", () => {
        for (const model of [
            "CleaningRoom",
            "CleaningTemplate",
            "CleaningTemplateItem",
            "CleaningWorkerAssignment",
            "CleaningDailyChecklist",
            "CleaningDailyChecklistItem",
        ]) {
            expect(schema).toContain(`model ${model} {`);
        }

        expect(schema).toContain('@@unique([roomId, wibDate], map: "idx_cleaning_checklist_room_date")');
        expect(schema).toContain('@@unique([templateId, nameNormalized], map: "idx_cleaning_tpl_item_name")');
    });

    it("AC-5 preserves room history with restrictive room relations and cascades template items", () => {
        expect(schema).toMatch(/room CleaningRoom @relation\(fields: \[roomId\], references: \[id\], onDelete: Restrict/);
        expect(schema).toMatch(/room\s+CleaningRoom\s+@relation\(fields: \[roomId\], references: \[id\], onDelete: Restrict/);
        expect(schema).toMatch(/template\s+CleaningTemplate\s+@relation\(fields: \[templateId\], references: \[id\], onDelete: Cascade/);
    });

    it("AC-8 gives CLEANING_WORKER exactly cleaning.execute", () => {
        const role = RBAC_DEFINITIONS.roles.find(([code]) => code === SYSTEM_ROLES.CLEANING_WORKER);

        expect(role).toEqual([
            SYSTEM_ROLES.CLEANING_WORKER,
            "Petugas Kebersihan",
            [PERMISSIONS.CLEANING_EXECUTE],
        ]);
    });

    it("AC-8 seeds the role and permission idempotently", async () => {
        const permissionUpsert = vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `permission:${where.code}` }));
        const roleUpsert = vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `role:${where.code}` }));
        const permissionFind = vi.fn(async ({ where }: { where: { code: string } }) => ({ id: `permission:${where.code}` }));
        const rolePermissionUpsert = vi.fn(async () => ({}));
        const fakePrisma = {
            permission: { upsert: permissionUpsert, findUniqueOrThrow: permissionFind },
            role: { upsert: roleUpsert },
            rolePermission: { upsert: rolePermissionUpsert },
        };

        await ensureRbac(fakePrisma as never);
        await ensureRbac(fakePrisma as never);

        expect(permissionUpsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { code: PERMISSIONS.CLEANING_EXECUTE },
        }));
        expect(roleUpsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { code: SYSTEM_ROLES.CLEANING_WORKER },
        }));
        expect(rolePermissionUpsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                roleId_permissionId: {
                    roleId: `role:${SYSTEM_ROLES.CLEANING_WORKER}`,
                    permissionId: `permission:${PERMISSIONS.CLEANING_EXECUTE}`,
                },
            },
        }));
    });

    it("AC-8 routes a cleaning only principal to the dedicated portal", () => {
        expect(getLandingPath({
            roles: [SYSTEM_ROLES.CLEANING_WORKER],
            permissions: [PERMISSIONS.CLEANING_EXECUTE],
            employeeId: null,
        })).toBe("/cleaning");
    });
});
