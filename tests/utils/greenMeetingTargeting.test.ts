import { describe, expect, it } from "vitest";
import {
    isGreenMeetingNoteRelevant,
    isGreenMeetingTargetRelevant,
    normalizeGreenMeetingTarget,
} from "@/lib/greenMeetingTargeting";

const viewer = {
    employeeId: "WIG-B",
    departmentId: "DEPT-B",
    divisionId: "DIV-B",
};

describe("Green Meeting smart targeting", () => {
    it("does not expand an employee target through stored department or division metadata", () => {
        expect(isGreenMeetingTargetRelevant({
            targetType: "EMPLOYEE",
            employeeId: "WIG-A",
            departmentId: "DEPT-B",
            divisionId: "DIV-B",
        }, viewer)).toBe(false);
    });

    it("matches each target only through its declared scope", () => {
        expect(isGreenMeetingTargetRelevant({ targetType: "EMPLOYEE", employeeId: "WIG-B" }, viewer)).toBe(true);
        expect(isGreenMeetingTargetRelevant({ targetType: "DEPARTMENT", departmentId: "DEPT-B" }, viewer)).toBe(true);
        expect(isGreenMeetingTargetRelevant({ targetType: "DIVISION", divisionId: "DIV-B" }, viewer)).toBe(true);
        expect(isGreenMeetingTargetRelevant({ targetType: "DEPARTMENT", departmentId: "DEPT-A" }, viewer)).toBe(false);
        expect(isGreenMeetingTargetRelevant({ targetType: "DIVISION", divisionId: "DIV-A" }, viewer)).toBe(false);
    });

    it("treats company-wide notes as relevant to every viewer", () => {
        expect(isGreenMeetingNoteRelevant({ isAllTarget: true, targets: [] }, viewer)).toBe(true);
    });

    it("normalizes persisted target foreign keys to the declared scope", () => {
        expect(normalizeGreenMeetingTarget({
            targetType: "EMPLOYEE",
            employeeId: "WIG-A",
            departmentId: "DEPT-A",
            divisionId: "DIV-A",
            label: "Employee A",
        })).toEqual({
            targetType: "EMPLOYEE",
            employeeId: "WIG-A",
            departmentId: undefined,
            divisionId: undefined,
            label: "Employee A",
        });
    });
});
