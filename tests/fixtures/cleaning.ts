import type { SessionPayload } from "@/lib/auth";
import { PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

export const CLEANING_IDS = {
    adminUser: "test-cleaning-admin",
    workerUser: "test-cleaning-worker",
    otherUser: "test-cleaning-other",
    room: "test-cleaning-room",
    inactiveRoom: "test-cleaning-room-inactive",
    template: "test-cleaning-template",
    templateItem: "test-cleaning-template-item",
    checklist: "test-cleaning-checklist",
    checklistItem: "test-cleaning-checklist-item",
    assignment: "test-cleaning-assignment",
} as const;

function baseSession(overrides: Partial<SessionPayload>): SessionPayload {
    return {
        userId: CLEANING_IDS.workerUser,
        username: "CLEANING_TEST_WORKER",
        name: "Cleaning Test Worker",
        email: "cleaning.worker@example.test",
        employeeId: null,
        employeeRecordId: null,
        departmentId: null,
        divisionId: null,
        roles: [SYSTEM_ROLES.CLEANING_WORKER],
        permissions: [PERMISSIONS.CLEANING_EXECUTE],
        primaryRole: SYSTEM_ROLES.CLEANING_WORKER,
        role: "employee",
        sessionVersion: 1,
        hasSubordinates: false,
        ...overrides,
    };
}

export function makeWorkerSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
    return baseSession(overrides);
}

export function makeWig002Session(overrides: Partial<SessionPayload> = {}): SessionPayload {
    return baseSession({
        userId: CLEANING_IDS.adminUser,
        username: "WIG002",
        name: "Cleaning Test Admin",
        roles: [SYSTEM_ROLES.GA_ADMIN],
        permissions: [PERMISSIONS.GA_MANAGE],
        primaryRole: SYSTEM_ROLES.GA_ADMIN,
        role: "ga",
        ...overrides,
    });
}

export function makeRoom(overrides: Record<string, unknown> = {}) {
    return {
        id: CLEANING_IDS.room,
        name: "Ruang Test Cleaning",
        nameNormalized: "ruang test cleaning",
        templateId: CLEANING_IDS.template,
        isActive: true,
        template: {
            id: CLEANING_IDS.template,
            name: "Template Test Cleaning",
            isActive: true,
            items: [makeTemplateItem()],
        },
        ...overrides,
    };
}

export function makeTemplateItem(overrides: Record<string, unknown> = {}) {
    return {
        id: CLEANING_IDS.templateItem,
        templateId: CLEANING_IDS.template,
        name: "Lantai",
        nameNormalized: "lantai",
        sortOrder: 1,
        isActive: true,
        ...overrides,
    };
}

export function makeChecklistItem(overrides: Record<string, unknown> = {}) {
    return {
        id: CLEANING_IDS.checklistItem,
        checklistId: CLEANING_IDS.checklist,
        templateItemId: CLEANING_IDS.templateItem,
        itemNameSnapshot: "Lantai",
        sortOrder: 1,
        isActive: true,
        isComplete: false,
        lastChangedByUserId: null,
        lastChangedAt: null,
        lastChangedBy: null,
        ...overrides,
    };
}

export function makeChecklist(overrides: Record<string, unknown> = {}) {
    return {
        id: CLEANING_IDS.checklist,
        roomId: CLEANING_IDS.room,
        wibDate: "2026-09-21",
        roomNameSnapshot: "Ruang Test Cleaning",
        items: [makeChecklistItem()],
        ...overrides,
    };
}

