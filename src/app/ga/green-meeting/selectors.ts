import type { GreenMeetingAttendance } from "./types";

/** Baris per-orang (memiliki employeeId); baris arsip legacy disisihkan. */
export function personRowsOf(attendances: GreenMeetingAttendance[]): GreenMeetingAttendance[] {
    return attendances.filter((a) => a.employeeId);
}

/** Baris arsip legacy (tanpa employeeId). */
export function legacyRowsOf(attendances: GreenMeetingAttendance[]): GreenMeetingAttendance[] {
    return attendances.filter((a) => !a.employeeId);
}

export interface AttendanceCounts {
    total: number;
    hadir: number;
    belumHadir: number;
    percent: number;
}

/** Hitung hadir vs belum hadir dari baris per-orang. */
export function countAttendance(rows: GreenMeetingAttendance[]): AttendanceCounts {
    const hadir = rows.filter((a) => a.status === "HADIR").length;
    const total = rows.length;
    return {
        total,
        hadir,
        belumHadir: total - hadir,
        percent: total > 0 ? Math.round((hadir / total) * 100) : 0,
    };
}

export interface DeptGroup {
    deptId: string | null;
    deptName: string;
    rows: GreenMeetingAttendance[];
}

/** Kelompokkan baris per departemen, urut nama. */
export function groupRowsByDept(rows: GreenMeetingAttendance[]): DeptGroup[] {
    const map = new Map<string, DeptGroup>();
    for (const row of rows) {
        const name = row.departmentName || "-";
        const key = row.departmentId ?? `__null__${name}`;
        let g = map.get(key);
        if (!g) {
            g = { deptId: row.departmentId, deptName: name, rows: [] };
            map.set(key, g);
        }
        g.rows.push(row);
    }
    return [...map.values()].sort((a, b) => a.deptName.localeCompare(b.deptName));
}

/** Representasi dept bersama (HUD + chip Tab): HADIR bila ≥1 HADIR, IZIN bila izin & 0 hadir, else ALPA. */
export function deptRepresentationOf(
    personRows: GreenMeetingAttendance[],
    deptIzins: Array<{ departmentId: string | null }>
): Map<string, "HADIR" | "IZIN" | "ALPA"> {
    const hadir = new Set<string>();
    for (const r of personRows) {
        if (r.status === "HADIR" && r.departmentId) hadir.add(r.departmentId);
    }
    const izin = new Set(
        deptIzins.map((i) => i.departmentId).filter(Boolean) as string[]
    );
    const deptIds = new Set<string>([
        ...personRows.map((r) => r.departmentId).filter(Boolean) as string[],
        ...izin,
    ]);
    const out = new Map<string, "HADIR" | "IZIN" | "ALPA">();
    for (const id of deptIds) {
        out.set(id, hadir.has(id) ? "HADIR" : izin.has(id) ? "IZIN" : "ALPA");
    }
    return out;
}
