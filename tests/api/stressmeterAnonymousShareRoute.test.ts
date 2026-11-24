import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => ({
    requireAuth: vi.fn(),
}));

const serviceMock = vi.hoisted(() => ({
    getEmployeeFullNameForShare: vi.fn(),
    submitAnonymousShare: vi.fn(),
}));

vi.mock("@/lib/middleware/apiGuard", async () => {
    const actual = await vi.importActual<typeof import("@/lib/middleware/apiGuard")>(
        "@/lib/middleware/apiGuard"
    );
    return {
        ...actual,
        requireAuth: authMock.requireAuth,
    };
});

vi.mock("@/lib/services/stressmeterService", () => ({
    getEmployeeFullNameForShare: serviceMock.getEmployeeFullNameForShare,
    submitAnonymousShare: serviceMock.submitAnonymousShare,
}));

import { POST } from "@/app/api/employee/stressmeter/anonymous-share/route";

function makeRequest(body: Record<string, unknown>) {
    return new NextRequest("http://localhost:3000/api/employee/stressmeter/anonymous-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/employee/stressmeter/anonymous-share", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authMock.requireAuth.mockResolvedValue({
            userId: "user-1",
            username: "wig001",
            name: "Display Name Akun",
            email: "wig001@example.com",
            employeeId: "WIG001",
            employeeRecordId: "emp-rec-1",
            departmentId: "dept-1",
            divisionId: "div-1",
            roles: ["EMPLOYEE_USER"],
            permissions: ["employee.self"],
            primaryRole: "EMPLOYEE_USER",
            role: "employee",
            sessionVersion: 1,
            hasSubordinates: false,
        });
    });

    it("tidak mengambil nama karyawan dan mengabaikan spoofing senderName dari klien saat anonim", async () => {
        serviceMock.submitAnonymousShare.mockResolvedValueOnce({
            id: "s-anon",
            submittedWibDate: "2026-11-24",
            topic: "WORKLOAD",
            senderName: null,
        });

        const res = await POST(
            makeRequest({
                topic: "WORKLOAD",
                message: "Beban kerja minggu ini terasa lebih tinggi dari biasanya.",
                includeSenderName: false,
                senderName: "Nama Palsu Spoofing",
            })
        );

        expect(res.status).toBe(201);
        expect(serviceMock.getEmployeeFullNameForShare).not.toHaveBeenCalled();
        expect(serviceMock.submitAnonymousShare).toHaveBeenCalledWith({
            topic: "WORKLOAD",
            message: "Beban kerja minggu ini terasa lebih tinggi dari biasanya.",
            senderName: null,
        });
    });

    it("mengambil nama lengkap otoritatif dari server (bukan dari payload klien) saat includeSenderName=true", async () => {
        serviceMock.getEmployeeFullNameForShare.mockResolvedValueOnce("Daffa Pratama");
        serviceMock.submitAnonymousShare.mockResolvedValueOnce({
            id: "s-named",
            submittedWibDate: "2026-11-24",
            topic: "FACILITIES",
            senderName: "Daffa Pratama",
        });

        const res = await POST(
            makeRequest({
                topic: "FACILITIES",
                message: "Lampu koridor gudang bagian barat sering berkedip.",
                includeSenderName: true,
                senderName: "Nama Palsu Spoofing",
            })
        );

        expect(res.status).toBe(201);
        expect(serviceMock.getEmployeeFullNameForShare).toHaveBeenCalledWith(
            "WIG001",
            "Display Name Akun"
        );
        expect(serviceMock.submitAnonymousShare).toHaveBeenCalledWith({
            topic: "FACILITIES",
            message: "Lampu koridor gudang bagian barat sering berkedip.",
            senderName: "Daffa Pratama",
        });
    });
});
