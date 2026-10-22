"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, ListChecks, Loader2 } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { stripGelar } from "@/lib/utils/formatters";
import { formatWIBDateTime } from "@/lib/timezone";
import { useConfirm } from "@/components/ConfirmModal";

interface MyTaskAssignee {
    employeeId: string;
    name: string;
    status: string;
    isOverdue: boolean;
}

interface MyTask {
    id: string;
    appointmentId: string;
    title: string;
    detail: string | null;
    isCancelled: boolean;
    assigner: { employeeId: string; name: string | null };
    appointment: { id: string; title: string; startAt: string; status: string; room: { name: string } | null };
    activeDeadline: { date: string; deadlineAt: string; sequence: number } | null;
    extensionsCount: number;
    assignees: MyTaskAssignee[];
    allDone: boolean;
    anyOverdue: boolean;
}

const STATUS_LABEL: Record<string, string> = {
    BELUM_DIKERJAKAN: "Belum Dikerjakan",
    ON_PROGRESS: "On Progress",
    SELESAI: "Selesai",
    DIBATALKAN: "Dibatalkan",
};

type Filter = "open" | "overdue" | "done" | "all";

export default function EmployeeMeetingTasksPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const highlight = searchParams.get("highlight");
    const [tasks, setTasks] = useState<MyTask[]>([]);
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("open");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const confirm = useConfirm();

    const load = useCallback(async (f: Filter) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (f === "overdue") params.set("overdue", "1");
            if (f === "done") params.set("status", "SELESAI");
            const qs = params.toString();
            const [meRes, res] = await Promise.all([
                fetch("/api/auth/me", { credentials: "same-origin" }),
                fetch(`/api/employee/meeting-tasks${qs ? `?${qs}` : ""}`, { credentials: "same-origin" }),
            ]);
            let currentEmpId: string | null = null;
            if (meRes.ok) {
                const me = await meRes.json();
                currentEmpId = me.employeeId ?? null;
                setMyEmployeeId(currentEmpId);
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat task."));
            const json = await res.json();
            let list: MyTask[] = json.data ?? [];
            if (f === "open") {
                list = list.filter((t) =>
                    !t.isCancelled &&
                    t.assignees.some((a) =>
                        currentEmpId !== null &&
                        a.employeeId === currentEmpId &&
                        (a.status === "BELUM_DIKERJAKAN" || a.status === "ON_PROGRESS")
                    )
                );
            }
            setTasks(list);
        } catch (err) {
            reportClientError("EmployeeMeetingTasksPage", "Gagal memuat task", err);
            setError(err instanceof Error ? err.message : "Gagal memuat task.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(filter);
    }, [load, filter]);

    useEffect(() => {
        if (!highlight || loading) return;
        if (!/^[A-Za-z0-9-]{1,120}$/.test(highlight)) return;
        const el = document.getElementById(`task-${highlight}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [highlight, loading, tasks]);

    useEffect(() => {
        if (loading) return;
        const timer = setInterval(() => { void load(filter); }, 300000);
        const onVisible = () => { if (document.visibilityState === "visible") void load(filter); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [load, filter, loading]);

    async function handleStatus(task: MyTask, status: string) {
        setBusyId(task.id);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${task.appointmentId}/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "status", status }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status."));
            await load(filter);
        } catch (err) {
            reportClientError("EmployeeMeetingTasksPage", "Gagal mengubah status task", err, { taskId: task.id });
            setError(err instanceof Error ? err.message : "Gagal mengubah status.");
        } finally {
            setBusyId(null);
        }
    }

    const filters: Array<{ key: Filter; label: string }> = [
        { key: "open", label: "Perlu Tindakan" },
        { key: "overdue", label: "Overdue" },
        { key: "done", label: "Selesai" },
        { key: "all", label: "Semua" },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary btn-sm" aria-label="Kembali ke E Meeting">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                    <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <ListChecks className="w-5 h-5 text-[var(--primary)]" /> Task Meeting Saya
                    </h1>
                    <p className="text-xs text-[var(--text-muted)]">Kumpulan semua task dari hasil meeting untuk Anda</p>
                </div>
            </div>

            <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Filter task" onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const order = ["open", "overdue", "done", "all"] as const;
                const idx = order.indexOf(filter);
                const next = e.key === "ArrowRight" ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length;
                setFilter(order[next]);
            }}>
                {filters.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        role="tab"
                        id={`tab-task-${f.key}`}
                        aria-selected={filter === f.key}
                        aria-controls="panel-tasks"
                        tabIndex={filter === f.key ? 0 : -1}
                        onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-9 ${
                            filter === f.key
                                ? "bg-[var(--primary)] text-white"
                                : "bg-[var(--secondary)] text-[var(--text-secondary)]"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

            {loading ? (
                <p className="text-sm text-[var(--text-muted)] flex items-center gap-2" aria-label="Memuat task">
                    <Loader2 className="w-4 h-4 animate-spin" /> Memuat task…
                </p>
            ) : tasks.length === 0 ? (
                <div className="card p-6 text-center" role="tabpanel" id="panel-tasks" aria-labelledby={`tab-task-${filter}`}>
                    <ListChecks className="w-8 h-8 mx-auto text-[var(--text-muted)] mb-2" />
                    <p className="text-sm font-medium text-[var(--text-primary)]">Tidak ada task</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Task dari hasil meeting yang ditugaskan kepada Anda akan muncul di sini.</p>
                </div>
            ) : (
                <div className="space-y-2.5" role="tabpanel" id="panel-tasks" aria-labelledby={`tab-task-${filter}`}>
                    {tasks.map((task) => {
                        const mine = myEmployeeId ? task.assignees.find((a) => a.employeeId === myEmployeeId && a.status !== "DIBATALKAN") ?? null : null;
                        const canAct = !task.isCancelled && mine && (mine.status === "BELUM_DIKERJAKAN" || mine.status === "ON_PROGRESS");
                        return (
                            <article
                                key={task.id}
                                id={`task-${task.id}`}
                                className={`card p-4 ${highlight === task.id ? "ring-2 ring-[var(--primary)]" : ""}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                                    {task.isCancelled ? (
                                        <span className="badge-error shrink-0">Dibatalkan</span>
                                    ) : mine?.status === "SELESAI" ? (
                                        <span className="badge-success shrink-0">Selesai</span>
                                    ) : mine?.isOverdue ? (
                                        <span className="badge-error shrink-0" title="Overdue untuk Anda">Overdue</span>
                                    ) : (
                                        <span className="badge-info shrink-0" title={task.anyOverdue ? "Ada penerima lain yang overdue" : undefined}>{mine ? STATUS_LABEL[mine.status] : "Berjalan"}</span>
                                    )}
                                </div>
                                {task.detail && <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{task.detail}</p>}
                                <dl className="mt-2 space-y-1 text-xs">
                                    <div className="flex gap-1.5">
                                        <dt className="text-[var(--text-muted)] w-20 shrink-0">Meeting</dt>
                                        <dd className="text-[var(--text-secondary)]">
                                            <Link href={`/employee/appointments/detail/${task.appointmentId}`} className="text-[var(--primary)] font-semibold hover:underline">
                                                {task.appointment.title}
                                            </Link>{" "}
                                            · {formatWIBDateTime(new Date(task.appointment.startAt), { day: "numeric", month: "short" })}
                                            {task.appointment.room ? ` · ${task.appointment.room.name}` : ""}
                                        </dd>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <dt className="text-[var(--text-muted)] w-20 shrink-0">Dari</dt>
                                        <dd className="text-[var(--text-secondary)]">{task.assigner.name ? stripGelar(task.assigner.name) : task.assigner.employeeId}</dd>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <dt className="text-[var(--text-muted)] w-20 shrink-0">Deadline</dt>
                                        <dd className={`font-semibold ${mine?.isOverdue ? "text-red-600" : "text-[var(--text-secondary)]"}`}>
                                            {task.activeDeadline?.date ?? "-"}
                                            {task.extensionsCount > 0 ? ` (diperpanjang ${task.extensionsCount}x)` : ""}
                                        </dd>
                                    </div>
                                    {task.assignees.length > 1 && (
                                        <div className="flex gap-1.5">
                                            <dt className="text-[var(--text-muted)] w-20 shrink-0">Penerima</dt>
                                            <dd className="text-[var(--text-secondary)]">
                                                {task.assignees.map((a) => `${stripGelar(a.name)}${a.employeeId === myEmployeeId ? " (Anda)" : ""} (${STATUS_LABEL[a.status] ?? a.status})`).join(", ")}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                                <div className="flex gap-1.5 mt-2.5">
                                    <Link
                                        href={`/employee/appointments/detail/${task.appointmentId}/history?highlight=${encodeURIComponent(`task-created-${task.id}`)}`}
                                        className="px-3 py-2 rounded-lg text-xs font-semibold min-h-10 bg-[var(--secondary)] text-[var(--text-secondary)] flex items-center justify-center gap-1"
                                        aria-label={`Lihat riwayat ${task.title}`}
                                    >
                                        Riwayat
                                    </Link>
                                    {canAct && mine?.status === "BELUM_DIKERJAKAN" && (
                                        <button
                                            type="button"
                                            disabled={busyId === task.id}
                                            onClick={() => { void handleStatus(task, "ON_PROGRESS"); }}
                                            className="px-3 py-2 rounded-lg text-xs font-semibold min-h-10 bg-[var(--secondary)] text-[var(--text-secondary)] flex-1 flex items-center justify-center gap-1"
                                        >
                                            {busyId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5" />}
                                            Mulai Kerjakan
                                        </button>
                                    )}
                                    {canAct && (
                                        <button
                                            type="button"
                                            disabled={busyId === task.id}
                                            onClick={() =>
                                                confirm({
                                                    title: "Tandai Selesai?",
                                                    message: `Status Anda pada task "${task.title}" akan ditandai selesai. Status penerima lain tidak berubah. Pastikan pekerjaan sudah benar-benar tuntas.`,
                                                    confirmLabel: "Ya, Selesai",
                                                    variant: "info",
                                                    onConfirm: () => { void handleStatus(task, "SELESAI"); },
                                                })
                                            }
                                            className="px-3 py-2 rounded-lg text-xs font-semibold min-h-10 bg-emerald-600 text-white flex-1 flex items-center justify-center gap-1"
                                        >
                                            {busyId === task.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            Tandai Selesai
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
