"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmployeeSearchPicker, { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
    EquipmentCompanyFilter,
    QcMember,
    TopViewer,
} from "@/app/ga/equipment/settings/_components/useSettingsData";

interface AtasanTabProps {
    qcMembers: QcMember[];
    qcError: string | null;
    qcCompany: EquipmentCompanyFilter;
    setQcCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    fetchQcMembers: (company: EquipmentCompanyFilter) => Promise<void>;
    topViewers: TopViewer[];
    topViewerError: string | null;
    fetchTopViewers: () => Promise<void>;
    approvers: Array<{ employeeId: string; name: string | null; isActive: boolean }>;
    approverError: string | null;
    approverCompany: EquipmentCompanyFilter;
    setApproverCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    fetchApprovers: (company: EquipmentCompanyFilter) => Promise<void>;
}

export default function AtasanTab({
    qcMembers,
    qcError,
    qcCompany,
    setQcCompany,
    fetchQcMembers,
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

    // ─── Anggota QC ───
    const [newQc, setNewQc] = useState<EmployeePick | null>(null);
    const [savingQc, setSavingQc] = useState(false);
    const [qcQuery, setQcQuery] = useState("");

    // ─── Top reviewer (atasan global) ───
    const [newTopViewer, setNewTopViewer] = useState<EmployeePick | null>(null);
    const [savingTopViewers, setSavingTopViewers] = useState(false);

    // ─── Approver final (maks 5 per perusahaan, dinamis) ───
    const [newApprover, setNewApprover] = useState<EmployeePick | null>(null);
    const [savingApprover, setSavingApprover] = useState(false);

    useEffect(() => {
        void fetchQcMembers(qcCompany);
    }, [fetchQcMembers, qcCompany]);

    useEffect(() => {
        void fetchApprovers(approverCompany);
    }, [fetchApprovers, approverCompany]);

    const filteredQcMembers = useMemo(() => {
        const q = qcQuery.trim().toLowerCase();
        if (!q) return qcMembers;
        return qcMembers.filter((m) => `${m.name} ${m.employeeId}`.toLowerCase().includes(q));
    }, [qcMembers, qcQuery]);

    // ─── Anggota QC ───

    const persistQcMembers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingQc(true);
            try {
                const res = await fetch("/api/ga/equipment/qc-members", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ company: qcCompany, employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan anggota QC."));
                toast(successMessage, "success");
                setNewQc(null);
                await fetchQcMembers(qcCompany);
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
                reportClientError("EquipmentSettings", "Qc members save failed", err);
            } finally {
                setSavingQc(false);
            }
        },
        [toast, fetchQcMembers, qcCompany]
    );

    const addQcMember = useCallback(() => {
        if (!newQc) {
            toast("Cari dan pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        const id = newQc.employeeId;
        if (qcMembers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Karyawan tersebut sudah terdaftar sebagai anggota QC.", "warning");
            return;
        }
        if (qcMembers.length >= 20) {
            toast(`Anggota QC ${qcCompany} maksimal 20 orang.`, "warning");
            return;
        }
        setNewQc(null);
        void persistQcMembers([...qcMembers.map((v) => v.employeeId), id], `Anggota QC ${qcCompany} ditambahkan.`);
    }, [newQc, qcMembers, qcCompany, toast, persistQcMembers]);

    const removeQcMember = useCallback(
        (member: QcMember) => {
            confirm({
                title: `Hapus "${member.name}" dari QC ${qcCompany}?`,
                message: `Karyawan tersebut tidak lagi melihat antrean pemeriksaan QC ${qcCompany}.`,
                confirmLabel: "Ya, hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void persistQcMembers(
                        qcMembers.filter((v) => v.employeeId !== member.employeeId).map((v) => v.employeeId),
                        "Anggota QC dihapus."
                    );
                },
            });
        },
        [confirm, qcMembers, qcCompany, persistQcMembers]
    );

    // ─── Top reviewers ───

    const persistTopViewers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingTopViewers(true);
            try {
                const res = await fetch("/api/ga/equipment/settings/top-viewers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan top reviewer."));
                toast(successMessage, "success");
                setNewTopViewer(null);
                await fetchTopViewers();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
                reportClientError("EquipmentSettings", "Top viewers save failed", err);
            } finally {
                setSavingTopViewers(false);
            }
        },
        [toast, fetchTopViewers]
    );

    const addTopViewer = useCallback(() => {
        if (!newTopViewer) {
            toast("Cari dan pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        const id = newTopViewer.employeeId;
        if (topViewers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Karyawan tersebut sudah terdaftar sebagai top reviewer.", "warning");
            return;
        }
        if (topViewers.length >= 5) {
            toast("Top reviewer maksimal 5 orang.", "warning");
            return;
        }
        setNewTopViewer(null);
        void persistTopViewers([...topViewers.map((v) => v.employeeId), id], "Top reviewer ditambahkan.");
    }, [newTopViewer, topViewers, toast, persistTopViewers]);

    const removeTopViewer = useCallback(
        (viewer: TopViewer) => {
            confirm({
                title: `Hapus "${viewer.name}" dari top reviewer?`,
                message: "Karyawan tersebut tidak lagi bisa melihat rekap semua unit.",
                confirmLabel: "Ya, hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void persistTopViewers(
                        topViewers.filter((v) => v.employeeId !== viewer.employeeId).map((v) => v.employeeId),
                        "Top reviewer dihapus."
                    );
                },
            });
        },
        [confirm, topViewers, persistTopViewers]
    );

    // ─── Approver ───

    const persistApprovers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingApprover(true);
            try {
                const res = await fetch("/api/ga/equipment/settings/approver", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ company: approverCompany, employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan approver."));
                toast(successMessage, "success");
                setNewApprover(null);
                await fetchApprovers(approverCompany);
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
                reportClientError("EquipmentSettings", "Approvers save failed", err);
            } finally {
                setSavingApprover(false);
            }
        },
        [toast, fetchApprovers, approverCompany]
    );

    const addApprover = useCallback(() => {
        if (!newApprover) {
            toast("Cari dan pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        const id = newApprover.employeeId;
        if (approvers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Karyawan tersebut sudah terdaftar sebagai approver.", "warning");
            return;
        }
        if (approvers.length >= 5) {
            toast(`Approver ${approverCompany} maksimal 5 orang.`, "warning");
            return;
        }
        void persistApprovers([...approvers.map((v) => v.employeeId), id], `Approver ${approverCompany} ditambahkan.`);
    }, [newApprover, approvers, approverCompany, toast, persistApprovers]);

    const removeApprover = useCallback(
        (member: { employeeId: string; name: string | null }) => {
            confirm({
                title: `Hapus "${member.name ?? member.employeeId}" dari approver ${approverCompany}?`,
                message: `Karyawan tersebut tidak lagi bisa memberi approval final untuk ${approverCompany}.`,
                confirmLabel: "Ya, hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void persistApprovers(
                        approvers.filter((v) => v.employeeId !== member.employeeId).map((v) => v.employeeId),
                        "Approver dihapus."
                    );
                },
            });
        },
        [confirm, approvers, approverCompany, persistApprovers]
    );

    return (
        <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Top Reviewer</h2>
                <p className="text-xs text-muted-foreground mb-3">
                    Atasan global yang bisa melihat rekap semua unit. Maksimal 5 orang.
                </p>
                {topViewerError && (
                    <FeedbackMessage variant="error" className="mb-3">
                        {topViewerError}{" "}
                        <button onClick={() => void fetchTopViewers()} className="underline">
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}
                <div className="bg-card border border-border rounded-lg overflow-hidden mb-3">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Karyawan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {topViewers.map((viewer) => (
                                <TableRow key={viewer.employeeId}>
                                    <TableCell>
                                        <p className="font-medium text-foreground">{viewer.name}</p>
                                        <p className="text-xs text-muted-foreground">{viewer.employeeId}</p>
                                        {viewer.email ? (
                                            <p className="text-xs text-muted-foreground">{viewer.email}</p>
                                        ) : (
                                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                                Tanpa email — rekap harian tidak terkirim
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`text-xs px-1.5 py-0.5 rounded ${viewer.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
                                        >
                                            {viewer.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => removeTopViewer(viewer)}
                                            disabled={savingTopViewers}
                                            className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                                        >
                                            Hapus
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {topViewers.length === 0 && !topViewerError && (
                        <p className="text-center text-muted-foreground py-6 text-sm">
                            Belum ada top reviewer.
                        </p>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                        <EmployeeSearchPicker
                            label="Cari karyawan"
                            value={newTopViewer}
                            onChange={setNewTopViewer}
                        />
                    </div>
                    <button
                        onClick={addTopViewer}
                        disabled={savingTopViewers || topViewers.length >= 5}
                        className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 self-end min-h-10"
                    >
                        {savingTopViewers ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {topViewers.length >= 5 && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Batas 5 top reviewer tercapai. Hapus salah satu untuk menambah.
                    </p>
                )}
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Approver Final</h2>
                <p className="text-xs text-muted-foreground mb-2">
                    Atasan yang memberi approval final (DONE → Selesai) per perusahaan. Maksimal 5 orang
                    per perusahaan, dinamis dan bisa diganti kapan saja.
                </p>
                <div className="flex gap-1 mb-3 border-b border-border">
                    {(["WIG", "MKI"] as const).map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setApproverCompany(c)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                approverCompany === c
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                {approverError && (
                    <FeedbackMessage variant="error" className="mb-3">
                        {approverError}{" "}
                        <button onClick={() => void fetchApprovers(approverCompany)} className="underline">
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}
                {approvers.length === 0 && !approverError ? (
                    <p className="text-sm text-muted-foreground mb-3">
                        Belum ada approver — approval final terkunci sampai ditetapkan.
                    </p>
                ) : (
                    <ul className="space-y-2 mb-3">
                        {approvers.map((m) => (
                            <li
                                key={m.employeeId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium truncate">{m.name ?? m.employeeId}</span>
                                    <span className="block text-xs text-muted-foreground truncate">{m.employeeId}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeApprover(m)}
                                    disabled={savingApprover}
                                    className="shrink-0 text-xs text-destructive hover:text-destructive/80 disabled:opacity-50 min-h-[44px] px-2"
                                >
                                    Hapus
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                        <EmployeeSearchPicker
                            label="Cari karyawan"
                            value={newApprover}
                            onChange={setNewApprover}
                        />
                    </div>
                    <button
                        onClick={addApprover}
                        disabled={savingApprover || approvers.length >= 5}
                        className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 self-end min-h-10"
                    >
                        {savingApprover ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {approvers.length >= 5 && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Batas 5 approver {approverCompany} tercapai. Hapus salah satu untuk menambah.
                    </p>
                )}
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Anggota QC</h2>
                <p className="text-xs text-muted-foreground mb-2">
                    Karyawan QC yang memeriksa hasil inspeksi produksi per perusahaan. Semua anggota
                    melihat semua yang disubmit perusahaannya, terbaru di atas. Maksimal 20 orang
                    per perusahaan.
                </p>
                <div className="flex gap-1 mb-3 border-b border-border">
                    {(["WIG", "MKI"] as const).map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setQcCompany(c)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                qcCompany === c
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                {qcError && (
                    <FeedbackMessage variant="error" className="mb-3">
                        {qcError}{" "}
                        <button onClick={() => void fetchQcMembers(qcCompany)} className="underline">
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}
                <div className="mb-3">
                    <EquipmentSearchField
                        id="cari-qc"
                        label="Cari anggota QC"
                        value={qcQuery}
                        onChange={setQcQuery}
                        placeholder="Cari nama atau NIK…"
                    />
                </div>
                <div className="bg-card border border-border rounded-lg overflow-hidden mb-3">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Karyawan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredQcMembers.map((member) => (
                                <TableRow key={member.employeeId}>
                                    <TableCell>
                                        <p className="font-medium text-foreground">{member.name}</p>
                                        <p className="text-xs text-muted-foreground">{member.employeeId}</p>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`text-xs px-1.5 py-0.5 rounded ${member.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
                                        >
                                            {member.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => removeQcMember(member)}
                                            disabled={savingQc}
                                            className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                                        >
                                            Hapus
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {qcMembers.length === 0 && !qcError && (
                        <p className="text-center text-muted-foreground py-6 text-sm">
                            Belum ada anggota QC.
                        </p>
                    )}
                    {qcMembers.length > 0 && filteredQcMembers.length === 0 && !qcError && (
                        <p className="text-center text-muted-foreground py-6 text-sm">
                            Tidak ada anggota QC yang cocok dengan pencarian.
                        </p>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                        <EmployeeSearchPicker
                            label="Cari karyawan"
                            value={newQc}
                            onChange={setNewQc}
                        />
                    </div>
                    <button
                        onClick={addQcMember}
                        disabled={savingQc || qcMembers.length >= 20}
                        className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 self-end min-h-10"
                    >
                        {savingQc ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {qcMembers.length >= 20 && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Batas 20 anggota QC {qcCompany} tercapai. Hapus salah satu untuk menambah.
                    </p>
                )}
            </div>
        </div>
    );
}
