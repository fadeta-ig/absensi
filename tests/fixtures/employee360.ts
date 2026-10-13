import type { ComponentProps } from "react";
import type { Employee360View } from "@/components/Employee360View";

export const employee360Fixture: ComponentProps<typeof Employee360View> = {
    employee: {
        id: "profile-test", employeeId: "TEST001", name: "Karyawan Contoh dengan Nama Panjang",
        email: "", phone: "", gender: "Laki-Laki", employmentType: "PERMANENT",
        departmentId: "department", positionId: "position", joinDate: "2026-01-01",
        totalLeave: 12, usedLeave: 2, isActive: true, bypassLocation: false, basicSalary: 0,
        departmentRel: { id: "department", name: "Operasional dan Administrasi" },
        positionRel: { id: "position", name: "Staf Operasional" },
    },
    stats: { attendanceRate: 95.5, lateCount: 1, visitCount: 1, leaveUsed: 2, leaveRemaining: 10 },
    backLink: "/dashboard/employees",
    effectiveShift: { name: "Shift Malam", source: "assignment" },
    recentAttendance: [
        { id: "day", employeeId: "TEST001", date: "2026-10-02", clockIn: "2026-10-02T01:06:18.922Z", clockOut: "2026-10-02T10:03:26.704Z", status: "late" },
        { id: "overnight", employeeId: "TEST001", date: "2026-10-01", clockIn: "2026-10-01T16:00:00Z", clockOut: "2026-10-02T00:00:00Z", status: "present" },
        { id: "open", employeeId: "TEST001", date: "2026-09-30", clockIn: "08:00", clockOut: null, status: "present" },
    ],
    recentVisits: [{
        id: "visit", employeeId: "TEST001", date: "2026-10-02", clientName: "Klien Contoh",
        clientAddress: "Alamat contoh", purpose: "Kunjungan operasional untuk koordinasi pekerjaan.",
        visitRadius: 300, status: "clocked_out", hrChecked: false, createdAt: "2026-10-02T01:00:00Z",
        clockInTime: "2026-10-02T01:00:00Z", clockOutTime: "2026-10-02T03:00:00Z",
    }],
    recentLeaves: [{
        id: "leave", employeeId: "TEST001", type: "annual", startDate: "2026-10-05T00:00:00Z",
        endDate: "2026-10-06T00:00:00Z", reason: "Keperluan pribadi", status: "approved", createdAt: "2026-10-01T03:00:00Z",
    }],
    recentPayslips: [],
    assignedAssets: [{
        id: "asset", assetCode: "LAPTOP-CONTOH-001", name: "Laptop operasional dengan nama perangkat panjang",
        categoryId: "laptop", category: { id: "laptop", name: "Laptop Operasional", prefix: "LAPTOP", createdAt: "2026-01-01T00:00:00Z" },
        kondisi: "KURANG_BAIK", status: "IN_USE", holderType: "EMPLOYEE", assignedToName: null,
        assignedToId: "TEST001", assignedAt: null, assignedEmployee: null, keterangan: null,
        serialNumber: null, imei: null, manufacturer: null, modelName: null, purchaseDate: null,
        purchasePrice: null, warrantyExpiry: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    }],
    statusHistory: [{
        id: "status", employeeId: "TEST001", wasActive: false, isActive: true, reason: "Aktivasi karyawan",
        effectiveDate: "2026-10-01T00:00:00Z", changedByIdentifier: "admin-test", createdAt: "2026-10-01T18:30:00Z",
    }],
};
