import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { makeWig002Session, makeWorkerSession } from "../fixtures/cleaning";

vi.mock("@/lib/middleware/apiGuard", () => ({
    requireAuth: vi.fn(),
    unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "unauthorized" }, { status: 401 })),
    forbiddenResponse: vi.fn(() => NextResponse.json({ error: "forbidden" }, { status: 403 })),
    serverErrorResponse: vi.fn(() => NextResponse.json({ error: "internal" }, { status: 500 })),
    validateBody: vi.fn(async (request: NextRequest, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
        const parsed = schema.safeParse(await request.json());
        if (!parsed.success) {
            return { error: NextResponse.json({ error: "validation" }, { status: 400 }) };
        }
        return { data: parsed.data };
    }),
}));

vi.mock("@/lib/services/cleaningService", () => {
    class CleaningError extends Error {
        constructor(message: string, public statusCode = 400) {
            super(message);
        }
    }

    return {
        CleaningError,
        isWig002: (session: { username: string; permissions: string[] }) => (
            session.username === "WIG002" && session.permissions.includes("ga.manage")
        ),
        getWorkerRooms: vi.fn(),
        getOrCreateDailyChecklist: vi.fn(),
        getChecklist: vi.fn(),
        updateChecklistItem: vi.fn(),
        getRooms: vi.fn(),
        createRoom: vi.fn(),
        updateRoom: vi.fn(),
        getTemplates: vi.fn(),
        createTemplate: vi.fn(),
        updateTemplate: vi.fn(),
        getTemplateItems: vi.fn(),
        createTemplateItem: vi.fn(),
        updateTemplateItem: vi.fn(),
        getAssignments: vi.fn(),
        createAssignment: vi.fn(),
        endAssignment: vi.fn(),
        replaceAssignment: vi.fn(),
        getAvailableUsersForAssignment: vi.fn(),
        getRecap: vi.fn(),
        getChecklistDetail: vi.fn(),
        createOutsourceUser: vi.fn(),
        listOutsourceUsers: vi.fn(),
    };
});

import { requireAuth } from "@/lib/middleware/apiGuard";
import {
    CleaningError,
    createAssignment,
    endAssignment,
    getAvailableUsersForAssignment,
    replaceAssignment,
    getChecklist,
    getChecklistDetail,
    getOrCreateDailyChecklist,
    getRecap,
    getRooms,
    getWorkerRooms,
    updateChecklistItem,
    createOutsourceUser,
    listOutsourceUsers,
} from "@/lib/services/cleaningService";
import { GET as getWorkerRoomsRoute } from "@/app/api/cleaning/rooms/route";
import { GET as getChecklistRoute, POST as createChecklistRoute } from "@/app/api/cleaning/checklists/route";
import { PATCH as patchChecklistItemRoute } from "@/app/api/cleaning/checklist-items/[id]/route";
import { GET as getGaRoomsRoute } from "@/app/api/ga/cleaning/rooms/route";
import { GET as getAvailableUsersRoute } from "@/app/api/ga/cleaning/assignments/available-users/route";
import { GET as getRecapRoute } from "@/app/api/ga/cleaning/recap/route";
import { GET as getDetailRoute } from "@/app/api/ga/cleaning/checklists/route";
import * as assignmentsRoute from "@/app/api/ga/cleaning/assignments/route";
import { GET as getOutsourceUsersRoute, POST as createOutsourceUserRoute } from "@/app/api/ga/cleaning/outsource-users/route";

function asMock(value: unknown): Mock {
    return value as Mock;
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
    return new NextRequest(`http://localhost${path}`, init);
}

describe("Cleaning API route contract", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("AC-8 returns 401 for worker rooms without a session", async () => {
        asMock(requireAuth).mockResolvedValue(null);

        const response = await getWorkerRoomsRoute();

        expect(response.status).toBe(401);
        expect(getWorkerRooms).not.toHaveBeenCalled();
    });

    it("AC-8 returns 403 without cleaning.execute", async () => {
        asMock(requireAuth).mockResolvedValue(makeWorkerSession({ permissions: [] }));

        const response = await getWorkerRoomsRoute();

        expect(response.status).toBe(403);
        expect(getWorkerRooms).not.toHaveBeenCalled();
    });

    it("AC-1 returns assigned rooms for a cleaning worker", async () => {
        asMock(requireAuth).mockResolvedValue(makeWorkerSession());
        asMock(getWorkerRooms).mockResolvedValue([{ id: "room-1", name: "Ruang 1" }]);

        const response = await getWorkerRoomsRoute();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, data: [{ id: "room-1", name: "Ruang 1" }] });
    });

    it("AC-1 rejects an empty checklist creation body", async () => {
        asMock(requireAuth).mockResolvedValue(makeWorkerSession());

        const response = await createChecklistRoute(request("/api/cleaning/checklists", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(400);
        expect(getOrCreateDailyChecklist).not.toHaveBeenCalled();
    });

    it("AC-1 exposes ROOM_NOT_READY as a retryable configuration error", async () => {
        asMock(requireAuth).mockResolvedValue(makeWorkerSession());
        asMock(getOrCreateDailyChecklist).mockRejectedValue(new CleaningError("ROOM_NOT_READY", 422));

        const response = await createChecklistRoute(request("/api/cleaning/checklists", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId: "room-1" }),
        }));

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "ROOM_NOT_READY" });
    });

    it("AC-2 returns 422 when the service rejects a non current WIB item", async () => {
        asMock(requireAuth).mockResolvedValue(makeWorkerSession());
        asMock(updateChecklistItem).mockRejectedValue(new CleaningError(
            "Hanya item hari ini (WIB) yang dapat diubah.",
            422,
        ));

        const response = await patchChecklistItemRoute(
            request("/api/cleaning/checklist-items/item-1", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ isComplete: true }),
            }),
            { params: Promise.resolve({ id: "item-1" }) },
        );

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "Hanya item hari ini (WIB) yang dapat diubah." });
    });

    it("AC-1 rejects impossible calendar dates rather than reading arbitrary strings", async () => {
        asMock(requireAuth).mockResolvedValue(makeWorkerSession());
        asMock(getChecklist).mockResolvedValue(null);

        const response = await getChecklistRoute(request(
            "/api/cleaning/checklists?roomId=room-1&date=2026-02-30",
        ));

        expect(response.status).toBe(400);
        expect(getChecklist).not.toHaveBeenCalled();
    });

    it.each([
        ["another GA account", makeWig002Session({ username: "WIG003" })],
        ["WIG002 without ga.manage", makeWig002Session({ permissions: [] })],
    ])("AC-8 denies cleaning administration for %s", async (_label, session) => {
        asMock(requireAuth).mockResolvedValue(session);

        const response = await getGaRoomsRoute();

        expect(response.status).toBe(403);
        expect(getRooms).not.toHaveBeenCalled();
    });

    it("AC-5 allows exact WIG002 with ga.manage to read administration data", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(getRooms).mockResolvedValue([{ id: "room-1" }]);

        const response = await getGaRoomsRoute();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, data: [{ id: "room-1" }] });
    });

    it("AC-2 returns eligible users for a valid worker type", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(getAvailableUsersForAssignment).mockResolvedValue([{ id: "user-1", employeeId: "EMP001" }]);

        const response = await getAvailableUsersRoute(request("/api/ga/cleaning/assignments/available-users?workerType=INTERNAL"));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, data: [{ id: "user-1", employeeId: "EMP001" }] });
        expect(getAvailableUsersForAssignment).toHaveBeenCalledWith(expect.anything(), "INTERNAL");
    });

    it("AC-2 rejects a missing or unknown worker type before reading eligible users", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());

        const response = await getAvailableUsersRoute(request("/api/ga/cleaning/assignments/available-users"));

        expect(response.status).toBe(422);
        expect(getAvailableUsersForAssignment).not.toHaveBeenCalled();
    });

    it("AC-1 denies eligible user lookup to a non administrator", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session({ username: "WIG003" }));

        const response = await getAvailableUsersRoute(request("/api/ga/cleaning/assignments/available-users?workerType=OUTSOURCE"));

        expect(response.status).toBe(403);
        expect(getAvailableUsersForAssignment).not.toHaveBeenCalled();
    });

    it("AC-7 returns 400 when recap month is missing", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());

        const response = await getRecapRoute(request("/api/ga/cleaning/recap"));

        expect(response.status).toBe(400);
        expect(getRecap).not.toHaveBeenCalled();
    });

    it("AC-7 propagates a future month rejection from the service", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(getRecap).mockRejectedValue(new CleaningError("Tidak dapat melihat rekap bulan mendatang.", 422));

        const response = await getRecapRoute(request("/api/ga/cleaning/recap?month=2026-10"));

        expect(response.status).toBe(422);
    });

    it("AC-7 rejects impossible detail dates before calling the service", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(getChecklistDetail).mockResolvedValue({ type: "no_record" });

        const response = await getDetailRoute(request(
            "/api/ga/cleaning/checklists?roomId=room-1&date=2026-02-30",
        ));

        expect(response.status).toBe(400);
        expect(getChecklistDetail).not.toHaveBeenCalled();
    });

    it("AC-6 exposes PATCH for assignment changes declared by the spec", () => {
        expect((assignmentsRoute as unknown as { PATCH?: unknown }).PATCH).toBeTypeOf("function");
    });

    it("AC-6 creates a new assignment via POST", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(createAssignment).mockResolvedValue({ id: "assignment-1", workerType: "INTERNAL" });

        const response = await assignmentsRoute.POST(request("/api/ga/cleaning/assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId: "room-1", userId: "user-1", workerType: "INTERNAL" }),
        }));

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({
            success: true,
            data: { id: "assignment-1", workerType: "INTERNAL" },
        });
        expect(createAssignment).toHaveBeenCalledWith(
            expect.anything(),
            { roomId: "room-1", userId: "user-1", workerType: "INTERNAL", applyToToday: false },
        );
    });

    it("AC-6 ends an assignment via PATCH action=END", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(endAssignment).mockResolvedValue({ id: "assignment-1", endsOnWibDate: "2026-09-22" });

        const response = await assignmentsRoute.PATCH(request("/api/ga/cleaning/assignments", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                assignmentId: "assignment-1",
                action: "END",
                reason: "Pindah tugas",
            }),
        }));

        expect(response.status).toBe(200);
        expect(endAssignment).toHaveBeenCalledWith(
            expect.anything(),
            { assignmentId: "assignment-1", applyToToday: false, reason: "Pindah tugas" },
        );
    });

    it("AC-6 replaces an assignment via PATCH action=REPLACE", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(replaceAssignment).mockResolvedValue({
            ended: { id: "assignment-1" },
            created: { id: "assignment-2" },
        });

        const response = await assignmentsRoute.PATCH(request("/api/ga/cleaning/assignments", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                assignmentId: "assignment-1",
                action: "REPLACE",
                newUserId: "user-2",
                newWorkerType: "OUTSOURCE",
                reason: "Rotasi pekerja",
            }),
        }));

        expect(response.status).toBe(200);
        expect(replaceAssignment).toHaveBeenCalledWith(
            expect.anything(),
            {
                assignmentId: "assignment-1",
                newUserId: "user-2",
                newWorkerType: "OUTSOURCE",
                applyToToday: false,
                reason: "Rotasi pekerja",
            },
        );
    });

    it("AC-2 passes INTERNAL worker type to the assignment service", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(createAssignment).mockResolvedValue({ id: "assignment-1", workerType: "INTERNAL" });

        const response = await assignmentsRoute.POST(request("/api/ga/cleaning/assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId: "room-1", userId: "user-1", workerType: "INTERNAL" }),
        }));

        expect(response.status).toBe(201);
        expect(createAssignment).toHaveBeenCalledWith(
            expect.anything(),
            { roomId: "room-1", userId: "user-1", workerType: "INTERNAL", applyToToday: false },
        );
    });

    it("AC-2 passes OUTSOURCE worker type to the assignment service", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());
        asMock(createAssignment).mockResolvedValue({ id: "assignment-1", workerType: "OUTSOURCE" });

        const response = await assignmentsRoute.POST(request("/api/ga/cleaning/assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId: "room-1", userId: "user-2", workerType: "OUTSOURCE" }),
        }));

        expect(response.status).toBe(201);
        expect(createAssignment).toHaveBeenCalledWith(
            expect.anything(),
            { roomId: "room-1", userId: "user-2", workerType: "OUTSOURCE", applyToToday: false },
        );
    });

    it("AC-10 rejects an unknown worker type at the API boundary", async () => {
        asMock(requireAuth).mockResolvedValue(makeWig002Session());

        const response = await assignmentsRoute.POST(request("/api/ga/cleaning/assignments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId: "room-1", userId: "user-1", workerType: "VENDOR" }),
        }));

        expect(response.status).toBe(400);
        expect(createAssignment).not.toHaveBeenCalled();
    });

    describe("GA Outsource Users Route (/api/ga/cleaning/outsource-users)", () => {
        it("returns outsource users list for WIG002", async () => {
            asMock(requireAuth).mockResolvedValue(makeWig002Session());
            asMock(listOutsourceUsers).mockResolvedValue([
                { id: "u-1", username: "outsource_budi", displayName: "Budi" },
            ]);

            const res = await getOutsourceUsersRoute();
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.data).toHaveLength(1);
        });

        it("creates an outsource user via POST", async () => {
            asMock(requireAuth).mockResolvedValue(makeWig002Session());
            asMock(createOutsourceUser).mockResolvedValue({
                id: "u-2",
                username: "outsource_slamet",
                displayName: "Slamet (Outsource)",
            });

            const res = await createOutsourceUserRoute(request("/api/ga/cleaning/outsource-users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    username: "outsource_slamet",
                    displayName: "Slamet (Outsource)",
                    password: "Secure123!",
                }),
            }));

            expect(res.status).toBe(201);
            const json = await res.json();
            expect(json.success).toBe(true);
            expect(json.data.username).toBe("outsource_slamet");
        });

        it("rejects a weak outsource password before calling the service", async () => {
            asMock(requireAuth).mockResolvedValue(makeWig002Session());

            const res = await createOutsourceUserRoute(request("/api/ga/cleaning/outsource-users", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    username: "outsource_slamet",
                    displayName: "Slamet (Outsource)",
                    password: "123",
                }),
            }));

            expect(res.status).toBe(400);
            expect(createOutsourceUser).not.toHaveBeenCalled();
        });

        it("rejects non-WIG002 session from accessing outsource users route", async () => {
            asMock(requireAuth).mockResolvedValue(makeWorkerSession());
            const res = await getOutsourceUsersRoute();
            expect(res.status).toBe(403);
        });
    });
});
