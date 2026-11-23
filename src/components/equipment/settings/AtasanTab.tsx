"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmployeeSearchPicker, { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import EquipmentActorPicker from "@/components/equipment/settings/EquipmentActorPicker";
import type {
    ApproverMember,
    EquipmentCompanyFilter,
    TopViewer,
} from "@/components/equipment/settings/useSettingsData";

interface AtasanTabProps {
    topViewers: TopViewer[];
    topViewerError: string | null;
    fetchTopViewers: () => Promise<void>;
    approvers: ApproverMember[];
    approverError: string | null;
    approverCompany: EquipmentCompanyFilter;
    setApproverCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    fetchApprovers: (company: EquipmentCompanyFilter) => Promise<void>;
}

export default function AtasanTab({
    topViewers,
    topViewerError,
    fetchTopViewers,
    approvers,
    approverError,
    approverCompany,
    setApproverCompany,
    fetchApprovers,
}: AtasanTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [newTopViewer, setNewTopViewer] = useState<EmployeePick | null>(null);
    const [savingTopViewers, setSavingTopViewers] = useState(false);

    const [newApprover, setNewApprover] = useState<EmployeePick | null>(null);
    const [savingApprover, setSavingApprover] = useState(false);

    useEffect(() => {
        void fetchApprovers(approverCompany);
    }, [fetchApprovers, approverCompany]);

    const persistTopViewers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingTopViewers(true);
            try {
                const res = await fetch("/api/ga/equipment/settings/top-viewers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan pemantau utama."));
                toast(successMessage, "success");
                setNewTopViewer(null);
                await fetchTopViewers();
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal menyimpan pemantau utama. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
                reportClientError("EquipmentSettings", "Top viewers save failed", err);
            } finally {
                setSavingTopViewers(false);
            }
        },
        [toast, fetchTopViewers]
    );

    const addTopViewer = useCallback(() => {
        if (!newTopViewer) {
            toast("Pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        const id = newTopViewer.employeeId;
        if (topViewers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Karyawan tersebut sudah terdaftar sebagai pemantau utama.", "warning");
            return;
        }
        if (topViewers.length >= 5) {
            toast("Pemantau utama maksimal 5 orang.", "warning");
            return;
        }
        setNewTopViewer(null);
        void persistTopViewers([...topViewers.map((v) => v.employeeId), id], "Pemantau utama ditambahkan.");
    }, [newTopViewer, topViewers, toast, persistTopViewers]);

    const removeTopViewer = useCallback(
        (viewer: TopViewer) => {
            confirm({
                title: `Hapus ${viewer.name} dari pemantau utama?`,
                message: "Karyawan tersebut tidak lagi dapat melihat rekap semua unit.",
                confirmLabel: "Hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void persistTopViewers(
                        topViewers.filter((v) => v.employeeId !== viewer.employeeId).map((v) => v.employeeId),
                        "Pemantau utama dihapus."
                    );
                },
            });
        },
        [confirm, topViewers, persistTopViewers]
    );

    const persistApprovers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingApprover(true);
            try {
                const res = await fetch("/api/ga/equipment/settings/approver", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ company: approverCompany, employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan pemberi persetujuan."));
                toast(successMessage, "success");
                setNewApprover(null);
                await fetchApprovers(approverCompany);
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal menyimpan pemberi persetujuan. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
                reportClientError("EquipmentSettings", "Approvers save failed", err);
            } finally {
                setSavingApprover(false);
            }
        },
        [toast, fetchApprovers, approverCompany]
    );

    const addApprover = useCallback(() => {
        if (!newApprover) {
            toast("Pilih petugas terlebih dahulu.", "warning");
            return;
        }
        const id = newApprover.employeeId;
        if (approvers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Petugas tersebut sudah terdaftar sebagai pemberi persetujuan.", "warning");
            return;
        }
        if (approvers.length >= 5) {
            toast(`Pemberi persetujuan ${approverCompany} maksimal 5 orang.`, "warning");
            return;
        }
        void persistApprovers(
            [...approvers.map((v) => v.employeeId), id],
            `Pemberi persetujuan ${approverCompany} ditambahkan.`
        );
    }, [newApprover, approvers, approverCompany, toast, persistApprovers]);

    const removeApprover = useCallback(
        (member: ApproverMember) => {
            const label =
                member.name ??
                (member.isOutsource
                    ? member.username
                        ? `@${member.username}`
                        : "Petugas Outsource"
                    : member.employeeId);
            confirm({
                title: `Hapus ${label} dari pemberi persetujuan ${approverCompany}?`,
                message: `Petugas tersebut tidak lagi dapat memberikan persetujuan akhir untuk ${approverCompany}.`,
                confirmLabel: "Hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void persistApprovers(
                        approvers.filter((v) => v.employeeId !== member.employeeId).map((v) => v.employeeId),
                        "Pemberi persetujuan dihapus."
                    );
                },
            });
        },
        [confirm, approvers, approverCompany, persistApprovers]
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* Kiri: Pemantau Utama */}
            <section className="bg-card border border-border rounded-xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Pemantau Utama</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Melihat rekap semua unit dan menerima email rekap harian. Maksimal 5 karyawan.
                        </p>
                    </div>
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-muted text-muted-foreground shrink-0">
                        {topViewers.length}/5
                    </span>
                </div>

                {topViewerError && (
                    <FeedbackMessage variant="error">
                        {topViewerError}{" "}
                        <button type="button" onClick={() => void fetchTopViewers()} className="underline ml-1">
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}

                {topViewers.length === 0 && !topViewerError ? (
                    <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                        Belum ada pemantau utama.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {topViewers.map((viewer) => (
                            <li
                                key={viewer.employeeId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {viewer.name}
                                        </span>
                                        <span
                                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                                viewer.isActive
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                    : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {viewer.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {viewer.employeeId}
                                        {viewer.email ? ` · ${viewer.email}` : ""}
                                    </p>
                                    {!viewer.email && (
                                        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-0.5">
                                            Belum ada email (rekap harian tidak terkirim)
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeTopViewer(viewer)}
                                    disabled={savingTopViewers}
                                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50 min-h-[36px]"
                                >
                                    Hapus
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="pt-2 border-t border-border flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1">
                        <EmployeeSearchPicker
                            label="Tambah karyawan pemantau"
                            value={newTopViewer}
                            onChange={setNewTopViewer}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={addTopViewer}
                        disabled={savingTopViewers || topViewers.length >= 5}
                        className="shrink-0 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                    >
                        {savingTopViewers ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {topViewers.length >= 5 && (
                    <p className="text-xs text-muted-foreground">
                        Batas 5 pemantau utama tercapai. Hapus salah satu untuk menambah.
                    </p>
                )}
            </section>

            {/* Kanan: Persetujuan Akhir */}
            <section className="bg-card border border-border rounded-xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">Persetujuan Akhir</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Memberikan persetujuan akhir setelah pemeriksaan QC selesai. Maksimal 5 orang per
                            perusahaan.
                        </p>
                    </div>
                    <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs shrink-0">
                        {(["WIG", "MKI"] as const).map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setApproverCompany(c)}
                                className={`px-3 py-1 rounded font-semibold min-h-[32px] transition-colors ${
                                    approverCompany === c
                                        ? "bg-background text-primary shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>

                {approverError && (
                    <FeedbackMessage variant="error">
                        {approverError}{" "}
                        <button
                            type="button"
                            onClick={() => void fetchApprovers(approverCompany)}
                            className="underline ml-1"
                        >
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}

                {approvers.length === 0 && !approverError ? (
                    <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                        Belum ada pemberi persetujuan untuk {approverCompany}.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {approvers.map((m) => (
                            <li
                                key={m.employeeId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {m.name ?? (m.isOutsource ? "Petugas Outsource" : m.employeeId)}
                                        </span>
                                        {m.isOutsource && (
                                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 shrink-0">
                                                OS
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {m.isOutsource
                                            ? m.username
                                                ? `@${m.username}`
                                                : "Akun outsource"
                                            : m.employeeId}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeApprover(m)}
                                    disabled={savingApprover}
                                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50 min-h-[36px]"
                                >
                                    Hapus
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="pt-2 border-t border-border flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="flex-1">
                        <EquipmentActorPicker
                            role="approver"
                            label={`Tambah pemberi persetujuan ${approverCompany}`}
                            value={newApprover}
                            onChange={setNewApprover}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={addApprover}
                        disabled={savingApprover || approvers.length >= 5}
                        className="shrink-0 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                    >
                        {savingApprover ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {approvers.length >= 5 && (
                    <p className="text-xs text-muted-foreground">
                        Batas 5 pemberi persetujuan {approverCompany} tercapai. Hapus salah satu untuk menambah.
                    </p>
                )}
            </section>
        </div>
    );
}
