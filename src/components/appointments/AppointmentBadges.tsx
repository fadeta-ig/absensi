import { CheckCircle2, XCircle, Ban, CalendarCheck2, HelpCircle, MailQuestion, Clock3, PlayCircle } from "lucide-react";

const STATUS_STYLE: Record<string, { icon: typeof CheckCircle2; cls: string; label: string }> = {
    SCHEDULED: { icon: Clock3, cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900", label: "Terjadwal" },
    IN_PROGRESS: { icon: PlayCircle, cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900", label: "Sedang Berlangsung" },
    COMPLETED: { icon: CalendarCheck2, cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700", label: "Selesai" },
    CANCELLED: { icon: Ban, cls: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900", label: "Dibatalkan" },
};

export function AppointmentStatusBadge({ status, lifecycle }: { status: string; lifecycle?: string }) {
    const key = lifecycle ?? status;
    const s = STATUS_STYLE[key] ?? STATUS_STYLE.SCHEDULED;
    const Icon = s.icon;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
            <Icon className="w-3 h-3" aria-hidden="true" />
            {s.label}
        </span>
    );
}

export function AttendanceMarkBadge({ mark }: { mark: string }) {    if (mark === "HADIR") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Hadir
            </span>
        );
    }
    if (mark === "TIDAK_HADIR") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900">
                <XCircle className="w-3 h-3" aria-hidden="true" /> Tidak Hadir
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-muted)] border-[var(--border)]">
            Belum Ditandai
        </span>
    );
}

const INVITE_STYLE: Record<string, { icon: typeof CheckCircle2; cls: string; label: string }> = {
    ACCEPTED: { icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900", label: "Diterima" },
    DECLINED: { icon: XCircle, cls: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900", label: "Ditolak" },
    TENTATIVE: { icon: HelpCircle, cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900", label: "Mungkin Hadir" },
    PENDING: { icon: MailQuestion, cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900", label: "Menunggu Respons" },
};

export function InviteResponseBadge({ status }: { status: string }) {
    const s = INVITE_STYLE[status] ?? INVITE_STYLE.PENDING;
    const Icon = s.icon;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
            <Icon className="w-3 h-3" aria-hidden="true" />
            {s.label}
        </span>
    );
}
