import { UserCheck, Clock, UserX, ClipboardList } from "lucide-react";

interface Props {
    present: number;
    late: number;
    total: number;
    absent?: number;
    scopeLabel?: string;
    lateLabel?: string;
    onSelectAbsentTab?: () => void;
}

export function AttendanceSummary({ present, late, absent, total, scopeLabel, lateLabel, onSelectAbsentTab }: Props) {
    const hasAbsent = typeof absent === "number";

    return (
        <div>
            {scopeLabel && <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">{scopeLabel}</p>}
            <div className={`grid gap-4 ${hasAbsent ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
            <div className="card p-4 text-center">
                <UserCheck className="w-5 h-5 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-extrabold text-green-600">{present}</p>
                <p className="text-xs text-[var(--text-muted)]">Hadir Tepat Waktu</p>
            </div>
            <div className="card p-4 text-center">
                <Clock className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-extrabold text-orange-500">{late}</p>
                <p className="text-xs text-[var(--text-muted)]">{lateLabel ?? "Terlambat"}</p>
            </div>
            {hasAbsent && (
                <button
                    type="button"
                    onClick={onSelectAbsentTab}
                    className={`card p-4 text-center transition-all ${
                        onSelectAbsentTab
                            ? "cursor-pointer hover:border-red-300 dark:hover:border-red-800 hover:shadow-md active:scale-98"
                            : ""
                    }`}
                    title={onSelectAbsentTab ? "Buka tab daftar karyawan yang belum hadir" : undefined}
                >
                    <UserX className="w-5 h-5 text-red-500 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-red-600">{absent}</p>
                    <p className="text-xs text-[var(--text-muted)] flex items-center justify-center gap-1">
                        Belum Hadir
                        {onSelectAbsentTab && (
                            <span className="text-[10px] text-[var(--primary)] font-medium underline underline-offset-2">
                                (Lihat)
                            </span>
                        )}
                    </p>
                </button>
            )}
            <div className="card p-4 text-center">
                <ClipboardList className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-extrabold text-blue-600">{total}</p>
                <p className="text-xs text-[var(--text-muted)]">Total Record</p>
            </div>
            </div>
        </div>
    );
}

