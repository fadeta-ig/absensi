"use client";

import { useCallback, useState } from "react";
import { Pencil, Plus, ShieldAlert, Trash2, UserPlus, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmployeeSearchPicker, { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    EQUIPMENT_SETTINGS_DEFAULT_DELEGATE_SCOPES,
    EQUIPMENT_SETTINGS_DELEGATES_MAX,
    EQUIPMENT_SETTINGS_SCOPES,
    type EquipmentSettingsScope,
} from "@/lib/services/equipmentAuth";
import {
    formatShortWibDate,
    inputClass,
    type SettingsDelegateRow,
} from "@/components/equipment/settings/useSettingsData";

const SCOPE_META: Record<
    EquipmentSettingsScope,
    { label: string; shortLabel: string; description: string; sensitive?: boolean }
> = {
    templates: {
        label: "Template & Item",
        shortLabel: "Template",
        description: "Mengelola template checklist dan item pemeriksaan.",
    },
    units: {
        label: "Unit Alat",
        shortLabel: "Unit Alat",
        description: "Mengelola master alat, merek, lokasi, dan perusahaan.",
    },
    products: {
        label: "Produk",
        shortLabel: "Produk",
        description: "Mengelola daftar produk WIG atau MKI dan pemetaan alatnya.",
    },
    assignments: {
        label: "Penugasan & Anggota QC",
        shortLabel: "Penugasan",
        description: "Mengelola penugasan operator alat dan daftar anggota QC (tidak dapat menunjuk diri sendiri).",
    },
    atasan: {
        label: "Atasan (Pemantau & Persetujuan Akhir)",
        shortLabel: "Atasan",
        description: "Mengelola daftar pemantau utama dan pemberi persetujuan akhir (tidak dapat menunjuk diri sendiri).",
        sensitive: true,
    },
};

interface DelegatesTabProps {
    delegates: SettingsDelegateRow[];
    delegatesError: string | null;
    fetchDelegates: () => Promise<void>;
}

export default function DelegatesTab({
    delegates,
    delegatesError,
    fetchDelegates,
}: DelegatesTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedEmp, setSelectedEmp] = useState<EmployeePick | null>(null);
    const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
    const [selectedScopes, setSelectedScopes] = useState<EquipmentSettingsScope[]>([
        ...EQUIPMENT_SETTINGS_DEFAULT_DELEGATE_SCOPES,
    ]);
    const [expiresOn, setExpiresOn] = useState("");
    const [saving, setSaving] = useState(false);

    const openCreateModal = useCallback(() => {
        setSelectedEmp(null);
        setEditingEmployeeId(null);
        setSelectedScopes([...EQUIPMENT_SETTINGS_DEFAULT_DELEGATE_SCOPES]);
        setExpiresOn("");
        setModalOpen(true);
    }, []);

    const openEditModal = useCallback((row: SettingsDelegateRow) => {
        setEditingEmployeeId(row.employeeId);
        setSelectedEmp({ employeeId: row.employeeId, name: row.name ?? row.employeeId });
        setSelectedScopes([...row.scopes]);
        setExpiresOn(row.expiresOnWibDate ?? "");
        setModalOpen(true);
    }, []);

    const toggleScope = useCallback((scope: EquipmentSettingsScope) => {
        setSelectedScopes((prev) =>
            prev.includes(scope)
                ? prev.filter((s) => s !== scope)
                : EQUIPMENT_SETTINGS_SCOPES.filter((s) => s === scope || prev.includes(s))
        );
    }, []);

    const persistDelegates = useCallback(
        async (
            nextList: Array<{
                employeeId: string;
                scopes: EquipmentSettingsScope[];
                expiresOnWibDate: string | null;
            }>,
            successMessage: string
        ) => {
            setSaving(true);
            try {
                const res = await fetch("/api/ga/equipment/settings/delegates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ delegates: nextList }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan PIC delegasi."));
                toast(successMessage, "success");
                setModalOpen(false);
                await fetchDelegates();
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal menyimpan PIC delegasi. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
                reportClientError("EquipmentSettings", "Delegates save failed", err);
            } finally {
                setSaving(false);
            }
        },
        [toast, fetchDelegates]
    );

    const handleSubmit = useCallback(() => {
        const targetId = editingEmployeeId ?? selectedEmp?.employeeId ?? "";
        if (!targetId) {
            toast("Pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        if (selectedScopes.length === 0) {
            toast("Pilih minimal satu area pengaturan untuk PIC.", "warning");
            return;
        }
        const cleanExp = expiresOn.trim() || null;

        if (editingEmployeeId) {
            const nextList = delegates.map((d) =>
                d.employeeId === editingEmployeeId
                    ? { employeeId: d.employeeId, scopes: selectedScopes, expiresOnWibDate: cleanExp }
                    : { employeeId: d.employeeId, scopes: d.scopes, expiresOnWibDate: d.expiresOnWibDate }
            );
            void persistDelegates(nextList, `Hak akses PIC ${selectedEmp?.name ?? editingEmployeeId} diperbarui.`);
            return;
        }

        if (delegates.some((d) => d.employeeId.toLowerCase() === targetId.toLowerCase())) {
            toast("Karyawan tersebut sudah ada di daftar PIC. Gunakan tombol Ubah untuk menyesuaikan aksesnya.", "warning");
            return;
        }
        if (delegates.length >= EQUIPMENT_SETTINGS_DELEGATES_MAX) {
            toast(`PIC delegasi maksimal ${EQUIPMENT_SETTINGS_DELEGATES_MAX} orang.`, "warning");
            return;
        }

        const nextList = [
            ...delegates.map((d) => ({
                employeeId: d.employeeId,
                scopes: d.scopes,
                expiresOnWibDate: d.expiresOnWibDate,
            })),
            { employeeId: targetId, scopes: selectedScopes, expiresOnWibDate: cleanExp },
        ];
        void persistDelegates(nextList, `${selectedEmp?.name ?? targetId} ditunjuk sebagai PIC.`);
    }, [editingEmployeeId, selectedEmp, selectedScopes, expiresOn, delegates, toast, persistDelegates]);

    const removeDelegate = useCallback(
        (row: SettingsDelegateRow) => {
            confirm({
                title: `Cabut akses PIC ${row.name ?? row.employeeId}?`,
                message: `${row.name ?? row.employeeId} (${row.employeeId}) akan langsung kehilangan akses Pengaturan Peralatan di portal karyawan.`,
                confirmLabel: "Cabut Akses",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    const nextList = delegates
                        .filter((d) => d.employeeId !== row.employeeId)
                        .map((d) => ({
                            employeeId: d.employeeId,
                            scopes: d.scopes,
                            expiresOnWibDate: d.expiresOnWibDate,
                        }));
                    void persistDelegates(nextList, `Akses PIC ${row.name ?? row.employeeId} dicabut.`);
                },
            });
        },
        [confirm, delegates, persistDelegates]
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Tunjuk hingga {EQUIPMENT_SETTINGS_DELEGATES_MAX} karyawan aktif untuk membantu mengelola tab
                    pengaturan tertentu dari portal karyawan.
                </p>
                <button
                    type="button"
                    onClick={openCreateModal}
                    disabled={delegates.length >= EQUIPMENT_SETTINGS_DELEGATES_MAX}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 shrink-0 min-h-[42px]"
                >
                    <Plus className="h-4 w-4" />
                    Tambah PIC
                </button>
            </div>

            {delegatesError && (
                <FeedbackMessage variant="error">
                    {delegatesError}{" "}
                    <button type="button" onClick={() => void fetchDelegates()} className="underline ml-1">
                        Coba lagi
                    </button>
                </FeedbackMessage>
            )}

            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Daftar PIC Aktif</h2>
                    <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-muted text-muted-foreground">
                        {delegates.length}/{EQUIPMENT_SETTINGS_DELEGATES_MAX}
                    </span>
                </div>

                {delegates.length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-border rounded-lg space-y-1">
                        <p className="text-sm font-medium text-foreground">Belum ada PIC delegasi.</p>
                        <p className="text-xs text-muted-foreground">
                            Saat ini seluruh pengaturan peralatan hanya dikelola oleh Admin GA.
                        </p>
                    </div>
                ) : (
                    <div className="border border-border rounded-lg overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Karyawan</TableHead>
                                    <TableHead>Area Diizinkan</TableHead>
                                    <TableHead>Masa Berlaku</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {delegates.map((row) => (
                                    <TableRow key={row.employeeId}>
                                        <TableCell>
                                            <div className="font-medium text-sm text-foreground">
                                                {row.name ?? row.employeeId}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {row.scopes.map((scope) => (
                                                    <span
                                                        key={scope}
                                                        className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                                                            scope === "atasan"
                                                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                                : "bg-primary/10 text-primary"
                                                        }`}
                                                    >
                                                        {SCOPE_META[scope].shortLabel}
                                                    </span>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                            {row.expiresOnWibDate
                                                ? `s.d. ${formatShortWibDate(row.expiresOnWibDate)}`
                                                : "Tanpa batas"}
                                        </TableCell>
                                        <TableCell>
                                            {!row.isActive ? (
                                                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-destructive/15 text-destructive">
                                                    Nonaktif
                                                </span>
                                            ) : row.isExpired ? (
                                                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                    Kedaluwarsa
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                    Aktif
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditModal(row)}
                                                    disabled={saving}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px]"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    Ubah
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void removeDelegate(row)}
                                                    disabled={saving}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-destructive hover:bg-destructive/10 min-h-[36px]"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Cabut
                                                </button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            {modalOpen && (
                <AccessibleModal
                    ariaLabel={editingEmployeeId ? "Ubah Akses PIC" : "Tambah PIC Delegasi"}
                    onClose={() => !saving && setModalOpen(false)}
                    className="!max-w-2xl"
                >
                    <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-primary" />
                                {editingEmployeeId ? "Ubah Akses PIC" : "Tambah PIC Delegasi"}
                            </h2>
                            {editingEmployeeId && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {selectedEmp?.name ?? editingEmployeeId} ({editingEmployeeId})
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => !saving && setModalOpen(false)}
                            aria-label="Tutup jendela"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        {!editingEmployeeId && (
                            <EmployeeSearchPicker
                                label="Pilih karyawan internal aktif"
                                value={selectedEmp}
                                onChange={setSelectedEmp}
                                placeholder="Ketik nama atau NIK karyawan..."
                            />
                        )}

                        <div>
                            <p className="text-xs font-medium text-foreground mb-2">
                                Area pengaturan yang diizinkan:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {EQUIPMENT_SETTINGS_SCOPES.map((scope) => {
                                    const meta = SCOPE_META[scope];
                                    const checked = selectedScopes.includes(scope);
                                    return (
                                        <label
                                            key={scope}
                                            className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                                                checked
                                                    ? meta.sensitive
                                                        ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30"
                                                        : "border-primary/60 bg-primary/5"
                                                    : "border-border bg-background hover:bg-muted/40"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleScope(scope)}
                                                className="mt-0.5 rounded border-border shrink-0"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium leading-tight">
                                                    {meta.label}
                                                </span>
                                                <span className="block text-[11px] text-muted-foreground mt-0.5">
                                                    {meta.description}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {selectedScopes.includes("atasan") && (
                                <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>
                                        Untuk menjaga objektivitas, PIC tetap tidak dapat menambahkan dirinya sendiri
                                        sebagai pemantau utama maupun pemberi persetujuan akhir.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="delegate-expires" className="block text-xs font-medium text-foreground mb-1">
                                Berlaku sampai tanggal (opsional)
                            </label>
                            <input
                                id="delegate-expires"
                                type="date"
                                value={expiresOn}
                                onChange={(e) => setExpiresOn(e.target.value)}
                                className={inputClass}
                            />
                            <p className="text-[11px] text-muted-foreground mt-1">
                                Kosongkan bila tanpa batas waktu. Akses otomatis berhenti jika karyawan nonaktif.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                disabled={saving}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[42px]"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={
                                    saving ||
                                    (!editingEmployeeId && !selectedEmp) ||
                                    selectedScopes.length === 0
                                }
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                            >
                                {saving
                                    ? "Menyimpan..."
                                    : editingEmployeeId
                                      ? "Simpan Perubahan"
                                      : "Simpan PIC"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
