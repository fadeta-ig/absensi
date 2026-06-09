import { UserCheck, UserX, ClipboardList } from "lucide-react";

interface Props {
    present: number;
    late: number;
    total: number;
}

export function AttendanceSummary({ present, late, total }: Props) {
    return (
        <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 text-center">
                <UserCheck className="w-5 h-5 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-extrabold text-green-600">{present}</p>
                <p className="text-xs text-[var(--text-muted)]">Hadir</p>
            </div>
            <div className="card p-4 text-center">
                <UserX className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-extrabold text-orange-500">{late}</p>
                <p className="text-xs text-[var(--text-muted)]">Terlambat</p>
            </div>
            <div className="card p-4 text-center">
                <ClipboardList className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-extrabold text-blue-600">{total}</p>
                <p className="text-xs text-[var(--text-muted)]">Total Record</p>
            </div>
        </div>
    );
}
