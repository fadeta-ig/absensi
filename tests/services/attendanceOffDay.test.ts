import { describe, it, expect, vi } from "vitest";
import { attendanceSchema } from "@/lib/validations/validationSchemas";

// Mock prisma for attendanceService unit testing
vi.mock("@/lib/prisma", () => ({
    prisma: {
        attendanceRecord: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

describe("Off-Day Attendance Validation & Schema", () => {
    it("should allow valid attendance payload with offDayReason", () => {
        const payload = {
            photo: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
            location: {
                lat: -6.2,
                lng: 106.8,
                accuracyMeters: 10,
            },
            offDayReason: "Piket darurat pemeliharaan server pusat data",
        };

        const result = attendanceSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.offDayReason).toBe("Piket darurat pemeliharaan server pusat data");
        }
    });

    it("should allow normal attendance payload without offDayReason", () => {
        const payload = {
            photo: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
            location: {
                lat: -6.2,
                lng: 106.8,
            },
        };

        const result = attendanceSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.offDayReason).toBeUndefined();
        }
    });

    it("should reject offDayReason exceeding 500 characters", () => {
        const payload = {
            photo: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
            offDayReason: "a".repeat(501),
        };

        const result = attendanceSchema.safeParse(payload);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain("maksimal 500 karakter");
        }
    });
});

describe("Attendance Service - Off-Day Record Mapping", () => {
    it("should properly persist and return isOffDay and offDayReason", async () => {
        const { createAttendance } = await import("@/lib/services/attendanceService");
        const { prisma } = await import("@/lib/prisma");

        const mockPrismaRow = {
            id: "att-123",
            employeeId: "EMP001",
            date: new Date("2026-09-19T00:00:00.000Z"),
            clockIn: new Date("2026-09-19T08:30:00.000Z"),
            clockOut: null,
            clockInLocation: JSON.stringify({ lat: -6.2, lng: 106.8 }),
            clockOutLocation: null,
            clockInPhoto: "photo-base64",
            clockOutPhoto: null,
            status: "present",
            notes: null,
            isOffDay: true,
            offDayReason: "Piket darurat pemeliharaan server",
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma.attendanceRecord.create as any).mockResolvedValue(mockPrismaRow);

        const record = await createAttendance({
            employeeId: "EMP001",
            date: "2026-09-19",
            clockIn: "2026-09-19T08:30:00.000Z",
            clockInLocation: { lat: -6.2, lng: 106.8 },
            clockInPhoto: "photo-base64",
            status: "present",
            isOffDay: true,
            offDayReason: "Piket darurat pemeliharaan server",
        });

        expect(record.id).toBe("att-123");
        expect(record.isOffDay).toBe(true);
        expect(record.offDayReason).toBe("Piket darurat pemeliharaan server");
        expect(record.status).toBe("present");
    });
});
