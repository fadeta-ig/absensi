import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
}));

vi.mock("fs/promises", () => fsMocks);

import {
    deleteAttendancePhotoFile,
    isJpegBytes,
    readAttendancePhotoFile,
    resolveAttendancePhotoPath,
    saveAttendancePhoto,
    toAttendanceRecord,
} from "@/lib/services/attendanceService";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x00, 0x01]);

describe("attendance selfie disk storage (Gel.2a)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fsMocks.mkdir.mockResolvedValue(undefined);
        fsMocks.writeFile.mockResolvedValue(undefined);
        fsMocks.unlink.mockResolvedValue(undefined);
    });

    it("mendeteksi magic bytes JPEG, bukan klaim MIME", () => {
        expect(isJpegBytes(JPEG_BYTES)).toBe(true);
        expect(isJpegBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
        expect(isJpegBytes(Buffer.alloc(0))).toBe(false);
        expect(isJpegBytes(Buffer.from([0xff, 0xd8]))).toBe(false);
    });

    it("menolak traversal dan ekstensi di luar izin", () => {
        expect(resolveAttendancePhotoPath("../rahasia.jpg")).toBeNull();
        expect(resolveAttendancePhotoPath("EMP001/../../etc.jpg")).toBeNull();
        expect(resolveAttendancePhotoPath("EMP001/foto.png")).toBeNull();
        expect(resolveAttendancePhotoPath("a/b/c.jpg")).toBeNull();
        expect(resolveAttendancePhotoPath("/absolut/x.jpg")).toBeNull();
    });

    it("menyelesaikan path valid di dalam root storage", () => {
        const resolved = resolveAttendancePhotoPath("EMP001/9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.jpg");
        expect(resolved).not.toBeNull();
        expect(resolved as string).toContain("attendance-photos");
    });

    it("menyimpan via mkdir recursive + writeFile wx dan mengembalikan relative path", async () => {
        const relative = await saveAttendancePhoto("EMP001", JPEG_BYTES, 2 * 1024 * 1024);

        expect(relative).toMatch(/^EMP001\/[A-Za-z0-9-]+\.jpg$/);
        expect(fsMocks.mkdir).toHaveBeenCalledWith(expect.anything(), { recursive: true });
        expect(fsMocks.writeFile).toHaveBeenCalledWith(
            expect.stringContaining("attendance-photos"),
            JPEG_BYTES,
            { flag: "wx" },
        );
    });

    it("menolak isi non-JPEG, file kosong, dan over-limit setting", async () => {
        await expect(saveAttendancePhoto("EMP001", Buffer.from("bukan-jpeg"), 1024)).rejects.toThrow("JPEG");
        await expect(saveAttendancePhoto("EMP001", Buffer.alloc(0), 1024)).rejects.toThrow("wajib");
        await expect(saveAttendancePhoto("EMP001", JPEG_BYTES, 4)).rejects.toThrow("terlalu besar");
        await expect(saveAttendancePhoto("../jahat", JPEG_BYTES, 1024)).rejects.toThrow();
    });

    it("membersihkan file bila writeFile gagal (atomik per file)", async () => {
        fsMocks.writeFile.mockRejectedValueOnce(new Error("EEXIST"));
        await expect(saveAttendancePhoto("EMP001", JPEG_BYTES, 1024)).rejects.toThrow("EEXIST");
        expect(fsMocks.unlink).toHaveBeenCalled();
    });

    it("membaca via path tervalidasi dan menolak traversal", async () => {
        fsMocks.readFile.mockResolvedValue(JPEG_BYTES);
        await expect(
            readAttendancePhotoFile("EMP001/9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.jpg"),
        ).resolves.toEqual(JPEG_BYTES);
        await expect(readAttendancePhotoFile("../rahasia.jpg")).rejects.toThrow();
        expect(fsMocks.readFile).toHaveBeenCalledTimes(1);
    });

    it("delete toleran terhadap traversal dan file hilang", async () => {
        await expect(deleteAttendancePhotoFile("../rahasia.jpg")).resolves.toBeUndefined();
        expect(fsMocks.unlink).not.toHaveBeenCalled();
        fsMocks.unlink.mockRejectedValueOnce(Object.assign(new Error("hilang"), { code: "ENOENT" }));
        await expect(
            deleteAttendancePhotoFile("EMP001/9a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.jpg"),
        ).resolves.toBeUndefined();
    });

    it("dual-read flag: path baru atau base64 lama sama-sama terbaca", () => {
        const base = {
            id: "r1", employeeId: "EMP001", date: "2026-09-30", clockIn: null, clockOut: null,
            status: "present", notes: null, isOffDay: false, offDayReason: null,
        };
        expect(toAttendanceRecord({ ...base, clockInPhoto: null, clockInPhotoPath: "EMP001/u.jpg" }).hasClockInPhoto).toBe(true);
        expect(toAttendanceRecord({ ...base, clockInPhoto: "data:image/jpeg;base64,xx", clockInPhotoPath: null }).hasClockInPhoto).toBe(true);
        expect(toAttendanceRecord({ ...base, clockInPhoto: null, clockInPhotoPath: null }).hasClockInPhoto).toBe(false);
    });
});
