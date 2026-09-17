export type GreenMeetingTargetScope = "DEPARTMENT" | "DIVISION" | "EMPLOYEE";

export interface GreenMeetingViewerScope {
    employeeId?: string | null;
    departmentId?: string | null;
    divisionId?: string | null;
}

export interface GreenMeetingTargetScopeValue {
    targetType: string;
    employeeId?: string | null;
    departmentId?: string | null;
    divisionId?: string | null;
    label?: string | null;
}

export interface GreenMeetingTargetedNote {
    isAllTarget: boolean;
    targets?: GreenMeetingTargetScopeValue[] | null;
}

export function isGreenMeetingTargetRelevant(
    target: GreenMeetingTargetScopeValue,
    viewer: GreenMeetingViewerScope
) {
    switch (target.targetType) {
        case "EMPLOYEE":
            return Boolean(viewer.employeeId && target.employeeId === viewer.employeeId);
        case "DEPARTMENT":
            return Boolean(viewer.departmentId && target.departmentId === viewer.departmentId);
        case "DIVISION":
            return Boolean(viewer.divisionId && target.divisionId === viewer.divisionId);
        default:
            return false;
    }
}

export function isGreenMeetingNoteRelevant(
    note: GreenMeetingTargetedNote,
    viewer: GreenMeetingViewerScope
) {
    return note.isAllTarget || Boolean(note.targets?.some((target) => isGreenMeetingTargetRelevant(target, viewer)));
}

export function normalizeGreenMeetingTarget<T extends GreenMeetingTargetScopeValue>(target: T) {
    return {
        targetType: target.targetType as GreenMeetingTargetScope,
        departmentId: target.targetType === "DEPARTMENT" ? target.departmentId ?? undefined : undefined,
        divisionId: target.targetType === "DIVISION" ? target.divisionId ?? undefined : undefined,
        employeeId: target.targetType === "EMPLOYEE" ? target.employeeId ?? undefined : undefined,
        label: target.label ?? undefined,
    };
}
