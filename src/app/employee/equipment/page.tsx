"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpDown, CheckCircle2, ChevronRight, Circle, Eye, Loader2, RefreshCw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { Skeleton } from "@/components/ui/Skeleton";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentStatusDot, equipmentStatusLabel } from "@/components/equipment/EquipmentStatusBadge";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";

interface LastCheck {
    id: string;
    status: string;
    createdAt: string;
    submittedAt: string | null;
    startedBy: { employeeId: string; name: string };
    checkedBy: { employeeId: string; name: string } | null;
}

interface MyUnit {
    unit: {
        id: string;
        name: string;
        brand: string | null;
        location: string | null;
        template: { name: string };
        inspections: LastCheck[];
    };
}

interface InspectionItem {
    id: string;
    itemNameSnapshot: string;
    requirePhoto: boolean;
    isActive: boolean;
    isPass: boolean | null;
    note: string | null;
}

interface InspectionDto {
    id: string;
    unit: { id: string; name: string; brand: string | null };
    status: string;
    createdAt: string;
    submittedAt: string | null;
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    approvedByNameSnapshot: string | null;
    approvedAt: string | null;
    items: InspectionItem[];
    evidence: Array<{ id: string }>;
    checkedBy: { employeeId: string; name: string } | null;
    progress: { total: number; decided: number; allDecided: boolean; photoOk: boolean };
}

interface UnitHistoryRow {
    id: string;
    status: string;
    createdAt: string;
    submittedAt: string | null;
    checkedAt: string | null;
    approvedAt: string | null;
    unit: { id: string; name: string; brand: string | null; location: string | null };
    startedBy: { employeeId: string; name: string };
    checkedByNameSnapshot: string | null;
    approvedByNameSnapshot: string | null;
}

function formatDateTime(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Tanggal WIB hari ini (YYYY-MM-DD) untuk chip "diperiksa hari ini". */
function wibToday(): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
    return parts;
}

function wibDateOf(value: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(value));
}

type StatusFilter = "ALL" | "NEVER" | "OPEN" | "SUBMITTED" | "DONE" | "APPROVED";
type SortMode = "NEVER_FIRST" | "AZ";

const STATUS_CHIPS: Array<{ key: StatusFilter; label: string }> = [
    { key: "ALL", label: "Semua" },
    { key: "NEVER", label: "Belum diperiksa" },
    { key: "OPEN", label: "Berjalan" },
    { key: "SUBMITTED", label: "Menunggu Verifikasi" },
    { key: "DONE", label: "Menunggu Approval" },
    { key: "APPROVED", label: "Selesai" },
];

export default function EmployeeEquipmentPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [units, setUnits] = useState<MyUnit[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<MyUnit | null>(null);
    const [inspection, setInspection] = useState<InspectionDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [updatingItem, setUpdatingItem] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [isTopOnly, setIsTopOnly] = useState(false);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
    const [sortMode, setSortMode] = useState<SortMode>("NEVER_FIRST");

    // Tab Alat vs Riwayat Saya + mode lihat read-only (anti klik-diam-diam-jalan).
    const [mainTab, setMainTab] = useState<"alat" | "riwayat">("alat");
    const [history, setHistory] = useState<InspectionDto[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyFilter, setHistoryFilter] = useState<"ALL" | "OPEN" | "SUBMITTED" | "DONE" | "APPROVED" | "CANCELLED">("ALL");
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [readOnly, setReadOnly] = useState(false);
    // Unit dipilih tanpa draf OPEN: tampilkan pilihan eksplisit (lihat riwayat / mulai baru).
    const [unitChoice, setUnitChoice] = useState<MyUnit | null>(null);
    const [unitHistory, setUnitHistory] = useState<UnitHistoryRow[]>([]);
    const [unitHistoryLoading, setUnitHistoryLoading] = useState(false);

    const fetchUnits = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/employee/equipment/units");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat unit alat."));
            const json = await res.json();
            setUnits(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat unit.";
            setError(msg);
            reportClientError("EmployeeEquipment", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUnits();
        // Atasan murni (topViewer tanpa peran QC) tidak checklist — arahkan ke Pantau.
        void fetch("/api/employee/equipment/capabilities")
            .then((res) => (res.ok ? res.json() : null))
            .then((json: unknown) => {
                if (!json || typeof json !== "object") return;
                const data = (json as { data?: { canReview?: boolean; canTopView?: boolean } }).data;
                if (data?.canTopView === true && data?.canReview !== true) setIsTopOnly(true);
            })
            .catch(() => undefined);
    }, [fetchUnits]);

    const checkedTodayCount = useMemo(() => {
        const today = wibToday();
        return units.filter((u) => {
            const last = u.unit.inspections[0];
            return last && wibDateOf(last.createdAt) === today;
        }).length;
    }, [units]);

    const visibleUnits = useMemo(() => {
        const q = query.trim().toLowerCase();
        const today = wibToday();
        const filtered = units.filter((entry) => {
            const u = entry.unit;
            const last = u.inspections[0];
            if (q) {
                const hay = [u.name, u.brand ?? "", u.location ?? "", u.template.name].join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            switch (statusFilter) {
                case "NEVER":
                    return !last;
                case "OPEN":
                case "SUBMITTED":
                case "DONE":
                case "APPROVED":
                    return last?.status === statusFilter;
                default:
                    return true;
            }
        });
        const checkedToday = (entry: MyUnit) => {
            const last = entry.unit.inspections[0];
            return !!last && wibDateOf(last.createdAt) === today;
        };
        return [...filtered].sort((a, b) => {
            if (sortMode === "AZ") return a.unit.name.localeCompare(b.unit.name, "id");
            const ac = checkedToday(a) ? 1 : 0;
            const bc = checkedToday(b) ? 1 : 0;
            if (ac !== bc) return ac - bc;
            const an = a.unit.inspections.length === 0 ? 0 : 1;
            const bn = b.unit.inspections.length === 0 ? 0 : 1;
            if (an !== bn) return an - bn;
            return a.unit.name.localeCompare(b.unit.name, "id");
        });
    }, [units, query, statusFilter, sortMode]);

    const fetchInspectionDetail = useCallback(
        async (id: string) => {
            setDetailLoading(true);
            try {
                const res = await fetch(`/api/employee/equipment/inspections/${id}`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat inspeksi."));
                const json = await res.json();
                const dto = json.data as InspectionDto;
                setInspection(dto);
                setNotes((prev) => {
                    const next = { ...prev };
                    for (const item of dto.items) {
                        if (next[item.id] === undefined) next[item.id] = item.note ?? "";
                    }
                    return next;
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat inspeksi.";
                toast(msg, "error");
                reportClientError("EmployeeEquipment", msg, err);
            } finally {
                setDetailLoading(false);
            }
        },
        [toast]
    );

    const startInspection = useCallback(
        async (unitId: string) => {
            setStarting(true);
            setStartError(null);
            try {
                const res = await fetch("/api/employee/equipment/inspections", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ unitId }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memulai pemeriksaan."));
                const json = await res.json();
                setInspection(json.data as InspectionDto);
                await fetchUnits();
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memulai pemeriksaan.";
                setStartError(msg);
                reportClientError("EmployeeEquipment", "Start inspection failed", err);
            } finally {
                setStarting(false);
            }
        },
        [fetchUnits]
    );

    const openUnit = useCallback(
        async (entry: MyUnit) => {
            // Lihat dulu, aksi kemudian: tidak ada auto-mulai checklist.
            // Bila ada draf OPEN milik saya → lanjutkan; bila tidak → pilihan eksplisit.
            setSelectedUnit(entry);
            setInspection(null);
            setStartError(null);
            setReadOnly(false);
            setUnitChoice(null);
            setUnitHistory([]);
            setDetailLoading(true);
            try {
                const res = await fetch("/api/employee/equipment/inspections?status=OPEN");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat inspeksi."));
                const json = await res.json();
                const list = (json.data ?? []) as InspectionDto[];
                const open = list.find((i) => i.unit.id === entry.unit.id && i.status === "OPEN");
                if (open) {
                    await fetchInspectionDetail(open.id);
                } else {
                    setDetailLoading(false);
                    setUnitChoice(entry);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat inspeksi.";
                toast(msg, "error");
                setDetailLoading(false);
            }
        },
        [toast, fetchInspectionDetail]
    );

    // Nilai Baik/Rusak: optimistic, tanpa konfirmasi untuk penilaian pertama.
    const doGradeItem = useCallback(
        async (item: InspectionItem, isPass: boolean) => {
            if (updatingItem || !inspection) return;
            setUpdatingItem(item.id);
            const previous = item.isPass;
            setInspection((prev) => {
                if (!prev) return prev;
                const items = prev.items.map((i) => (i.id === item.id ? { ...i, isPass } : i));
                const active = items.filter((i) => i.isActive);
                const decided = active.filter((i) => i.isPass !== null).length;
                return { ...prev, items, progress: { ...prev.progress, decided, allDecided: active.length > 0 && decided === active.length } };
            });
            try {
                const res = await fetch(`/api/employee/equipment/items/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ isPass, note: notes[item.id]?.trim() ? notes[item.id].trim() : null }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan penilaian."));
                const json = await res.json();
                setInspection(json.data as InspectionDto);
            } catch (err) {
                setInspection((prev) => {
                    if (!prev) return prev;
                    const items = prev.items.map((i) => (i.id === item.id ? { ...i, isPass: previous } : i));
                    const active = items.filter((i) => i.isActive);
                    const decided = active.filter((i) => i.isPass !== null).length;
                    return { ...prev, items, progress: { ...prev.progress, decided, allDecided: active.length > 0 && decided === active.length } };
                });
                const msg = err instanceof Error ? err.message : "Gagal menyimpan.";
                toast(msg, "error");
                reportClientError("EmployeeEquipment", msg, err);
            } finally {
                setUpdatingItem(null);
            }
        },
        [updatingItem, inspection, notes, toast]
    );

    // Item yang sudah dinilai: perubahan nilai harus dikonfirmasi (anti salah-klik).
    // Catatan yang diubah tetap bisa disimpan tanpa mengubah nilai.
    const gradeItem = useCallback(
        (item: InspectionItem, isPass: boolean) => {
            if (updatingItem || readOnly) return;
            const noteDirty = (notes[item.id] ?? "") !== (item.note ?? "");
            if (item.isPass !== null && item.isPass !== isPass) {
                confirm({
                    title: "Ubah penilaian ini?",
                    message: `"${item.itemNameSnapshot}" sudah dinilai ${item.isPass ? "Baik" : "Rusak"}. Ubah menjadi ${isPass ? "Baik" : "Rusak"}?`,
                    confirmLabel: "Ya, ubah",
                    cancelLabel: "Batal",
                    variant: "warning",
                    onConfirm: () => {
                        void doGradeItem(item, isPass);
                    },
                });
                return;
            }
            if (item.isPass === isPass && !noteDirty) return;
            void doGradeItem(item, isPass);
        },
        [updatingItem, readOnly, confirm, doGradeItem, notes]
    );

    const backToUnits = useCallback(() => {
        setSelectedUnit(null);
        setInspection(null);
        setStartError(null);
        setReadOnly(false);
        setUnitChoice(null);
        setUnitHistory([]);
    }, []);

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch("/api/employee/equipment/inspections");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat riwayat."));
            const json = await res.json();
            setHistory((json.data ?? []) as InspectionDto[]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat riwayat.";
            toast(msg, "error");
            reportClientError("EmployeeEquipment", msg, err);
        } finally {
            setHistoryLoading(false);
        }
    }, [toast]);

    const handleCancel = useCallback(
        (row: InspectionDto) => {
            if (cancellingId) return;
            const decided = row.progress?.decided ?? 0;
            const total = row.progress?.total ?? 0;
            confirm({
                title: "Batalkan pemeriksaan ini?",
                message: `${row.unit.name} — ${decided}/${total} item sudah dinilai. Pemeriksaan yang dibatalkan hilang dari daftar kerja dan tercatat sebagai Dibatalkan.`,
                confirmLabel: "Ya, batalkan",
                cancelLabel: "Jangan batalkan",
                variant: "danger",
                onConfirm: () => {
                    void (async () => {
                        setCancellingId(row.id);
                        try {
                            const res = await fetch(`/api/employee/equipment/inspections/${row.id}/cancel`, { method: "POST" });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan pemeriksaan."));
                            toast("Pemeriksaan dibatalkan.", "success");
                            await fetchHistory();
                            await fetchUnits();
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : "Gagal membatalkan pemeriksaan.";
                            toast(msg, "error");
                            reportClientError("EmployeeEquipment", msg, err, { inspectionId: row.id });
                        } finally {
                            setCancellingId(null);
                        }
                    })();
                },
            });
        },
        [cancellingId, confirm, toast, fetchHistory, fetchUnits]
    );

    const openHistoryDetail = useCallback(
        async (row: InspectionDto | UnitHistoryRow, opts?: { edit?: boolean }) => {
            setSelectedUnit({
                unit: {
                    id: row.unit.id,
                    name: row.unit.name,
                    brand: row.unit.brand ?? null,
                    location: (row.unit as { location?: string | null }).location ?? null,
                    template: { name: "" },
                    inspections: [],
                },
            });
            setInspection(null);
            setUnitChoice(null);
            setReadOnly(!opts?.edit);
            setDetailLoading(true);
            try {
                const res = await fetch(`/api/employee/equipment/inspections/${row.id}`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail."));
                const json = await res.json();
                setInspection(json.data as InspectionDto);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat detail.";
                toast(msg, "error");
                reportClientError("EmployeeEquipment", msg, err);
            } finally {
                setDetailLoading(false);
            }
        },
        [toast]
    );

    const fetchUnitHistory = useCallback(
        async (unitId: string) => {
            setUnitHistoryLoading(true);
            setUnitHistory([]);
            try {
                const res = await fetch(`/api/employee/equipment/units/${unitId}/history`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat riwayat unit."));
                const json = await res.json();
                setUnitHistory((json.data ?? []) as UnitHistoryRow[]);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat riwayat unit.";
                toast(msg, "error");
                reportClientError("EmployeeEquipment", msg, err);
            } finally {
                setUnitHistoryLoading(false);
            }
        },
        [toast]
    );

    const submitInspection = useCallback(() => {
        if (!inspection || submitting || readOnly) return;
        const active = inspection.items.filter((i) => i.isActive);
        const baik = active.filter((i) => i.isPass === true).length;
        const rusak = active.filter((i) => i.isPass === false).length;
        const belum = active.filter((i) => i.isPass === null).length;
        const fotoCount = inspection.evidence.length;
        const needsPhoto = active.some((i) => i.requirePhoto);
        confirm({
            title: "Kirim inspeksi?",
            message: `Ringkasan: ${active.length} item — ${baik} baik, ${rusak} rusak, ${belum} belum dinilai, ${fotoCount}/5 foto.${needsPhoto && fotoCount === 0 ? " Minimal 1 foto wajib." : ""} Inspeksi yang dikirim tidak dapat diubah lagi.`,
            confirmLabel: "Ya, kirim",
            cancelLabel: "Periksa lagi",
            variant: "info",
            onConfirm: () => {
                void (async () => {
                    setSubmitting(true);
                    try {
                        const res = await fetch(`/api/employee/equipment/inspections/${inspection.id}/submit`, {
                            method: "POST",
                        });
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengirim inspeksi."));
                        const json = await res.json();
                        setInspection(json.data as InspectionDto);
                        toast("Inspeksi terkirim. Menunggu pemeriksaan QC.", "success");
                        await fetchUnits();
                    } catch (err) {
                        toast(err instanceof Error ? err.message : "Gagal mengirim.", "error");
                    } finally {
                        setSubmitting(false);
                    }
                })();
            },
        });
    }, [inspection, submitting, readOnly, confirm, toast, fetchUnits]);

    if (loading) {
        return (
            <div className="mx-auto px-4 py-6" role="status" aria-live="polite" aria-label="Memuat daftar alat">
                <Skeleton className="h-7 w-48 mb-2" />
                <Skeleton className="h-4 w-72 mb-6" />
                <Skeleton className="h-12 mb-3" />
                <div className="flex gap-2 mb-4">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-24" />
                </div>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="bg-card border border-border rounded-lg p-4 mb-3">
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2 mb-1" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                ))}
            </div>
        );
    }

    if (isTopOnly) {
        return (
            <div className="mx-auto px-4 py-6">
                <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-foreground font-medium">Halaman ini untuk pelaksana pemeriksaan.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Peran Anda sebagai atasan. Silakan pantau hasil pemeriksaan melalui tombol di bawah.
                    </p>
                    <Link
                        href="/employee/equipment/overview"
                        className="inline-block mt-4 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                    >
                        Buka Pantau Inspeksi Alat
                    </Link>
                </div>
            </div>
        );
    }

    if (selectedUnit) {
        const activeItems = inspection?.items.filter((i) => i.isActive) ?? [];
        const fotoCount = inspection?.evidence.length ?? 0;
        const needsPhoto = activeItems.some((i) => i.requirePhoto);
        const canSubmit = !!inspection && inspection.status === "OPEN" && inspection.progress.allDecided && inspection.progress.photoOk;

        return (
            <div className="mx-auto px-4 py-6">
                <button
                    onClick={backToUnits}
                    disabled={detailLoading || starting || submitting}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2 disabled:opacity-50"
                >
                    ← Kembali ke daftar alat
                </button>

                <div className="bg-card border border-border rounded-lg p-4 mb-4">
                    <h1 className="text-xl font-semibold text-foreground">{selectedUnit.unit.name}</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {selectedUnit.unit.template.name}
                        {[selectedUnit.unit.brand, selectedUnit.unit.location].filter(Boolean).length > 0 &&
                            ` · ${[selectedUnit.unit.brand, selectedUnit.unit.location].filter(Boolean).join(" · ")}`}
                    </p>
                    {inspection && (
                        <span
                            className={`mt-2 inline-flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded-full ${
                                inspection.status === "OPEN"
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                    : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            }`}
                        >
                            {inspection.status === "OPEN" ? <Circle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {inspection.status === "OPEN" ? "Berjalan" : equipmentStatusLabel(inspection.status)}
                        </span>
                    )}
                    {readOnly && inspection && (
                        <p className="mt-2 text-xs font-medium text-muted-foreground bg-muted rounded-md px-2 py-1.5">
                            Tampilan baca — data tidak dapat diubah di sini.
                        </p>
                    )}
                    {readOnly && inspection && inspection.status === "OPEN" && (
                        <button
                            type="button"
                            onClick={() => setReadOnly(false)}
                            className="mt-2 px-4 min-h-[44px] inline-flex items-center text-sm font-semibold text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                        >
                            Lanjutkan mengerjakan
                        </button>
                    )}
                </div>

                {(detailLoading || starting) && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                )}

                {!detailLoading && !starting && startError && !inspection && (
                    <div className="text-center py-8 bg-card border border-border rounded-lg">
                        <p className="text-sm text-destructive mb-4">{startError}</p>
                        <button
                            onClick={() => void startInspection(selectedUnit.unit.id)}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                        >
                            Coba lagi
                        </button>
                    </div>
                )}

                {!detailLoading && !starting && !inspection && unitChoice && (
                    <div className="bg-card border border-border rounded-lg p-4">
                        <p className="text-sm text-foreground font-medium">
                            Tidak ada pemeriksaan yang sedang berjalan untuk alat ini.
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 mb-3">
                            Melihat riwayat tidak akan membuat pemeriksaan baru. Pemeriksaan baru hanya dibuat setelah Anda menekan tombol mulai.
                        </p>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => void fetchUnitHistory(unitChoice.unit.id)}
                                className="w-full px-4 min-h-[48px] inline-flex items-center justify-center gap-2 text-sm font-semibold border border-border rounded-md hover:bg-accent"
                            >
                                <Eye aria-hidden="true" className="h-4 w-4" /> Lihat riwayat unit ini
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setUnitChoice(null);
                                    void startInspection(unitChoice.unit.id);
                                }}
                                className="w-full px-4 min-h-[48px] inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                            >
                                Mulai pemeriksaan baru
                            </button>
                        </div>

                        {unitHistoryLoading && (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {!unitHistoryLoading && unitHistory.length > 0 && (
                            <div className="mt-3 space-y-2">
                                {unitHistory.map((row) => (
                                    <button
                                        key={row.id}
                                        type="button"
                                        onClick={() => void openHistoryDetail(row)}
                                        className="w-full flex items-start gap-2.5 p-3 bg-background border border-border rounded-lg hover:bg-accent/50 text-left"
                                    >
                                        <EquipmentStatusDot status={row.status} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-foreground truncate">
                                                {stripGelar(row.startedBy.name)} · {equipmentStatusLabel(row.status)}
                                            </span>
                                            <span className="block text-xs text-muted-foreground truncate">
                                                Mulai {formatDateTime(row.createdAt)}
                                                {row.checkedByNameSnapshot ? ` · QC: ${stripGelar(row.checkedByNameSnapshot)}` : ""}
                                                {row.approvedByNameSnapshot ? ` · Approval: ${stripGelar(row.approvedByNameSnapshot)}` : ""}
                                            </span>
                                        </span>
                                        <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {inspection && !detailLoading && (
                    <div className="space-y-3">
                        <div className="sticky top-2 z-10">
                            <FeedbackMessage variant={inspection.progress.photoOk ? "success" : "warning"}>
                                <span className="text-sm font-medium">
                                    {inspection.progress.allDecided && inspection.progress.photoOk
                                        ? "Siap dikirim."
                                        : `Sisa ${inspection.progress.total - inspection.progress.decided} belum dinilai${needsPhoto && fotoCount === 0 ? " · Tambahkan minimal 1 foto" : ""}`}
                                </span>
                                <span className="block text-xs mt-0.5">
                                    Penilaian {inspection.progress.decided}/{inspection.progress.total} · Foto {fotoCount}/5
                                    {needsPhoto && fotoCount === 0 ? " (minimal 1)" : ""}
                                </span>
                                <span className="block mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                                    <span
                                        className="block h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${inspection.progress.total === 0 ? 0 : Math.round((inspection.progress.decided / inspection.progress.total) * 100)}%` }}
                                    />
                                </span>
                            </FeedbackMessage>
                        </div>

                        {activeItems.map((item) => {
                            const noteDirty = (notes[item.id] ?? "") !== (item.note ?? "");
                            return (
                            <div
                                key={item.id}
                                className={`rounded-lg border-2 p-3 transition-colors ${
                                    item.isPass === true
                                        ? "bg-green-50 border-green-300 dark:bg-green-900/10 dark:border-green-700"
                                        : item.isPass === false
                                          ? "bg-red-50 border-red-300 dark:bg-red-900/10 dark:border-red-700"
                                          : "bg-card border-border"
                                } ${updatingItem === item.id ? "opacity-60" : ""}`}
                            >
                                <p className="text-sm font-medium text-foreground">
                                    {item.isPass === true ? "Baik ✓ " : item.isPass === false ? "Rusak ! " : ""}
                                    {item.itemNameSnapshot}
                                </p>
                                <div className="flex gap-3 mt-2">
                                    <button
                                        type="button"
                                        onClick={() => gradeItem(item, true)}
                                        disabled={updatingItem !== null || inspection.status !== "OPEN" || readOnly}
                                        aria-pressed={item.isPass === true}
                                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-md text-base font-semibold border transition-colors disabled:opacity-50 min-h-[52px] ${
                                            item.isPass === true
                                                ? "bg-green-600 text-white border-green-600"
                                                : "border-border hover:bg-green-50 dark:hover:bg-green-900/20"
                                        }`}
                                    >
                                        {updatingItem === item.id ? (
                                            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <ThumbsUp aria-hidden="true" className="h-5 w-5" />
                                        )}{" "}
                                        Baik
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => gradeItem(item, false)}
                                        disabled={updatingItem !== null || inspection.status !== "OPEN" || readOnly}
                                        aria-pressed={item.isPass === false}
                                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-md text-base font-semibold border transition-colors disabled:opacity-50 min-h-[52px] ${
                                            item.isPass === false
                                                ? "bg-red-600 text-white border-red-600"
                                                : "border-border hover:bg-red-50 dark:hover:bg-red-900/20"
                                        }`}
                                    >
                                        {updatingItem === item.id ? (
                                            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <ThumbsDown aria-hidden="true" className="h-5 w-5" />
                                        )}{" "}
                                        Rusak
                                    </button>
                                </div>
                                {inspection.status === "OPEN" && !readOnly && (
                                    <div className="mt-2">
                                        <label htmlFor={`note-${item.id}`} className="sr-only">
                                            Catatan {item.itemNameSnapshot}
                                        </label>
                                        <input
                                            id={`note-${item.id}`}
                                            type="text"
                                            value={notes[item.id] ?? ""}
                                            onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                            placeholder="Catatan (opsional)"
                                            maxLength={2000}
                                            className="w-full px-3 py-2.5 border border-border rounded-md text-sm bg-background min-h-[44px]"
                                        />
                                        {noteDirty && (
                                            <button
                                                type="button"
                                                onClick={() => gradeItem(item, item.isPass ?? true)}
                                                disabled={updatingItem !== null || readOnly}
                                                className="mt-1.5 px-3 min-h-[44px] inline-flex items-center text-xs font-semibold text-primary border border-primary/40 rounded-md hover:bg-primary/10 disabled:opacity-50"
                                            >
                                                {updatingItem === item.id ? "Menyimpan..." : item.isPass === null ? "Simpan dan nilai Baik" : "Simpan catatan"}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {item.note && (inspection.status !== "OPEN" || readOnly) && (
                                    <p className="mt-1.5 text-xs text-muted-foreground">Catatan: {item.note}</p>
                                )}
                            </div>
                            );
                        })}

                        <div className="rounded-lg border border-border bg-card p-3">
                            <p className="text-sm font-medium text-foreground mb-1">
                                Foto dokumentasi {needsPhoto ? <span className="font-normal text-muted-foreground">(minimal 1, maksimal 5)</span> : <span className="font-normal text-muted-foreground">(opsional, maksimal 5)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground mb-2">
                                Satu tempat pengunggahan ini mewakili semua parameter di atas.
                            </p>
                            <EquipmentEvidencePanel
                                inspectionId={inspection.id}
                                canUpload={inspection.status === "OPEN" && !readOnly}
                                onChanged={() => void fetchInspectionDetail(inspection.id)}
                            />
                        </div>

                        {inspection.status === "OPEN" && !readOnly && (
                            <div className="sticky bottom-4 z-10 pt-1">
                                <div className="bg-card/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg">
                                    {!canSubmit && (
                                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">
                                            {!inspection.progress.allDecided
                                                ? `Nilai semua item terlebih dahulu (sisa ${inspection.progress.total - inspection.progress.decided}).`
                                                : "Tambahkan minimal 1 foto dokumentasi terlebih dahulu."}
                                        </p>
                                    )}
                                    <button
                                        onClick={submitInspection}
                                        disabled={!canSubmit || submitting}
                                        aria-describedby="kirim-hint"
                                        className="w-full px-4 py-3 text-base font-semibold text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[52px] inline-flex items-center justify-center gap-2"
                                    >
                                        {submitting && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />}
                                        {submitting ? "Mengirim..." : `Kirim Inspeksi (${inspection.progress.decided}/${inspection.progress.total})`}
                                    </button>
                                    <p id="kirim-hint" className="sr-only">
                                        Inspeksi yang dikirim tidak dapat diubah lagi.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Inspeksi Alat</h1>
            <p className="text-sm text-muted-foreground mb-4">
                {units.length === 0
                    ? "Pilih alat yang ditugaskan kepada Anda untuk diperiksa."
                    : `${checkedTodayCount}/${units.length} alat diperiksa hari ini. Pilih alat untuk diperiksa.`}
            </p>

            <div className="flex gap-2 mb-4" role="tablist" aria-label="Alat dan riwayat">
                {(
                    [
                        { key: "alat", label: "Alat" },
                        { key: "riwayat", label: "Riwayat Saya" },
                    ] as const
                ).map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={mainTab === tab.key}
                        onClick={() => {
                            setMainTab(tab.key);
                            if (tab.key === "riwayat" && history.length === 0 && !historyLoading) void fetchHistory();
                        }}
                        className={`flex-1 px-3 min-h-[44px] inline-flex items-center justify-center text-sm font-semibold rounded-md border transition-colors ${
                            mainTab === tab.key
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {mainTab === "riwayat" && (
                <div className="space-y-3" aria-live="polite">
                    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter status riwayat">
                        {(
                            [
                                { key: "ALL", label: "Semua" },
                                { key: "OPEN", label: "Sedang dikerjakan" },
                                { key: "SUBMITTED", label: "Menunggu Verifikasi" },
                                { key: "DONE", label: "Menunggu Approval" },
                                { key: "APPROVED", label: "Selesai" },
                                { key: "CANCELLED", label: "Dibatalkan" },
                            ] as const
                        ).map((chip) => (
                            <button
                                key={chip.key}
                                type="button"
                                onClick={() => setHistoryFilter(chip.key)}
                                aria-pressed={historyFilter === chip.key}
                                className={`shrink-0 px-3 min-h-[44px] inline-flex items-center text-sm font-medium rounded-full border transition-colors ${
                                    historyFilter === chip.key
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                                }`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    {historyLoading && (
                        <div className="flex items-center justify-center py-12" role="status" aria-label="Memuat riwayat">
                            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!historyLoading &&
                        history
                            .filter((h) => (historyFilter === "ALL" ? h.status !== "CANCELLED" : h.status === historyFilter))
                            .map((h) => (
                                <div
                                    key={h.id}
                                    className="bg-card border border-border rounded-lg p-4"
                                >
                                    <button
                                        type="button"
                                        onClick={() => void openHistoryDetail(h)}
                                        className="w-full flex items-start gap-2.5 text-left"
                                    >
                                        <EquipmentStatusDot status={h.status} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium text-foreground truncate">{h.unit.name}</span>
                                            <span className="block text-xs text-muted-foreground truncate">
                                                Mulai {formatDateTime(h.createdAt)} · {equipmentStatusLabel(h.status)}
                                            </span>
                                            {h.checkedByNameSnapshot && (
                                                <span className="block text-xs text-muted-foreground truncate">
                                                    QC: {stripGelar(h.checkedByNameSnapshot)}
                                                    {h.approvedByNameSnapshot ? ` · Approval: ${stripGelar(h.approvedByNameSnapshot)}` : ""}
                                                </span>
                                            )}
                                        </span>
                                        <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                                    </button>
                                    {h.status === "OPEN" && (
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => void openHistoryDetail(h, { edit: true })}
                                                className="flex-1 px-3 min-h-[44px] inline-flex items-center justify-center text-sm font-semibold text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                                            >
                                                Lanjutkan
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleCancel(h)}
                                                disabled={cancellingId === h.id}
                                                aria-label={`Batalkan pemeriksaan ${h.unit.name}`}
                                                className="flex-1 px-3 min-h-[44px] inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 disabled:opacity-50"
                                            >
                                                {cancellingId === h.id ? (
                                                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <X aria-hidden="true" className="h-4 w-4" />
                                                )}
                                                {cancellingId === h.id ? "Membatalkan..." : "Batalkan"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}

                    {!historyLoading && history.filter((h) => (historyFilter === "ALL" ? h.status !== "CANCELLED" : h.status === historyFilter)).length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                            <p className="text-sm font-medium text-foreground">Belum ada riwayat.</p>
                            <p className="text-sm text-muted-foreground mt-1">Pemeriksaan yang Anda mulai akan tercatat di sini.</p>
                        </div>
                    )}
                </div>
            )}

            {mainTab === "alat" && error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center mb-4">
                    <AlertTriangle aria-hidden="true" className="h-5 w-5 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{error}</p>
                    <button
                        onClick={() => void fetchUnits()}
                        className="mt-3 text-sm font-medium text-primary hover:underline inline-flex items-center gap-1 min-h-[44px] px-3"
                    >
                        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Coba lagi
                    </button>
                </div>
            )}

            {mainTab === "alat" && units.length > 0 && (
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pb-2 -mx-4 px-4 pt-1">
                    <EquipmentSearchField
                        id="cari-alat"
                        label="Cari alat"
                        value={query}
                        onChange={setQuery}
                        placeholder="Cari nama, merek, lokasi, template..."
                    />
                    <div className="flex gap-2 mt-2 overflow-x-auto pb-1" role="group" aria-label="Filter status cek">
                        {STATUS_CHIPS.map((chip) => {
                            const active = statusFilter === chip.key;
                            return (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onClick={() => setStatusFilter(chip.key)}
                                    aria-pressed={active}
                                    className={`shrink-0 px-3 min-h-[44px] inline-flex items-center text-sm font-medium rounded-full border transition-colors ${
                                        active
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setSortMode((m) => (m === "NEVER_FIRST" ? "AZ" : "NEVER_FIRST"))}
                            title={sortMode === "NEVER_FIRST" ? "Urut: belum diperiksa dulu" : "Urut: A-Z"}
                            aria-label={sortMode === "NEVER_FIRST" ? "Urut: belum diperiksa dulu. Ketuk untuk urut A-Z." : "Urut: A-Z. Ketuk untuk belum diperiksa dulu."}
                            className="shrink-0 px-3 min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                            <ArrowUpDown aria-hidden="true" className="h-4 w-4" />
                            {sortMode === "NEVER_FIRST" ? "Belum diperiksa" : "A-Z"}
                        </button>
                    </div>
                </div>
            )}

            {mainTab === "alat" && units.length === 0 && !error && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">Anda belum ditugaskan ke alat mana pun.</p>
                </div>
            )}

            {mainTab === "alat" && visibleUnits.length === 0 && units.length > 0 && !error && (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                    <p className="text-sm font-medium text-foreground">Tidak ditemukan.</p>
                    <p className="text-sm text-muted-foreground mt-1">Coba kata kunci atau filter lain.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setQuery("");
                            setStatusFilter("ALL");
                        }}
                        className="mt-3 px-4 min-h-[44px] inline-flex items-center text-sm font-medium text-primary border border-primary/40 rounded-md hover:bg-primary/10"
                    >
                        Atur ulang pencarian
                    </button>
                </div>
            )}

            {mainTab === "alat" && (
            <div className="space-y-3" aria-live="polite">
                {visibleUnits.map((entry) => {
                    const last = entry.unit.inspections[0];
                    const meta = [entry.unit.brand, entry.unit.location, entry.unit.template.name].filter(Boolean).join(" · ");
                    return (
                        <button
                            key={`unit-${entry.unit.id}`}
                            onClick={() => void openUnit(entry)}
                            className="w-full flex items-start gap-2.5 p-4 bg-card border border-border rounded-lg hover:bg-accent/50 active:bg-accent transition-colors text-left min-h-[64px]"
                        >
                            <EquipmentStatusDot status={last?.status ?? null} />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground truncate">{entry.unit.name}</p>
                                {meta && <p className="text-sm text-muted-foreground truncate">{meta}</p>}
                                <p className={`text-xs mt-0.5 truncate ${last ? "text-muted-foreground" : "font-semibold text-amber-700 dark:text-amber-300"}`}>
                                    {last
                                        ? `Terakhir diperiksa ${formatDateTime(last.createdAt)} oleh ${stripGelar(last.startedBy.name)} · ${equipmentStatusLabel(last.status)}`
                                        : "Belum pernah diperiksa — ketuk untuk melihat"}
                                </p>
                            </div>
                            <ChevronRight aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                        </button>
                    );
                })}
            </div>
            )}
        </div>
    );
}
