"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import {
    cleaningInputClass,
    type AvailableCleaningUser,
    type BulkAssignResult,
    type CleaningRoom,
} from "./cleaningSettingsUtils";

interface BulkAssignModalProps {
    activeRooms: CleaningRoom[];
    availableUsers: AvailableCleaningUser[];
    selectedRoomIds: string[];
    setSelectedRoomIds: (ids: string[]) => void;
    selectedUserIds: string[];
    setSelectedUserIds: (ids: string[]) => void;
    workerType: "INTERNAL" | "OUTSOURCE";
    onChangeWorkerType: (type: "INTERNAL" | "OUTSOURCE") => void;
    applyToToday: boolean;
    setApplyToToday: (val: boolean) => void;
    saving: boolean;
    result: BulkAssignResult | null;
    onSubmit: () => void;
    onOpenOutsourceModal: () => void;
    onClose: () => void;
}

export default function BulkAssignModal({
    activeRooms,
    availableUsers,
    selectedRoomIds,
    setSelectedRoomIds,
    selectedUserIds,
    setSelectedUserIds,
    workerType,
    onChangeWorkerType,
    applyToToday,
    setApplyToToday,
    saving,
    result,
    onSubmit,
    onOpenOutsourceModal,
    onClose,
}: BulkAssignModalProps) {
    const [roomQuery, setRoomQuery] = useState("");
    const [userQuery, setUserQuery] = useState("");

    const filteredRooms = useMemo(() => {
        const q = roomQuery.trim().toLowerCase();
        if (!q) return activeRooms;
        return activeRooms.filter((r) => r.name.toLowerCase().includes(q));
    }, [activeRooms, roomQuery]);

    const filteredUsers = useMemo(() => {
        const q = userQuery.trim().toLowerCase();
        if (!q) return availableUsers;
        return availableUsers.filter(
            (u) =>
                u.displayName.toLowerCase().includes(q) ||
                u.username.toLowerCase().includes(q)
        );
    }, [availableUsers, userQuery]);

    const toggleId = (list: string[], setList: (next: string[]) => void, id: string) => {
        setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
    };

    const totalAssignments = selectedRoomIds.length * selectedUserIds.length;

    return (
        <AccessibleModal
            ariaLabel="Penugasan Baru"
            onClose={onClose}
            className="!max-w-2xl !p-6"
        >
            <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                <div>
                    <h2 className="modal-title">Penugasan Baru</h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Pilih satu atau beberapa ruangan dan petugas sekaligus untuk menjadwalkan inspeksi kebersihan.
                    </p>
                </div>
                <button
                    type="button"
                    className="modal-close"
                    onClick={onClose}
                    aria-label="Tutup jendela"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="space-y-4">
                {/* Langkah 1: Pilih Ruangan */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                            1. Ruangan ({selectedRoomIds.length} dipilih)
                        </span>
                        {activeRooms.length > 0 && (
                            <button
                                type="button"
                                onClick={() =>
                                    setSelectedRoomIds(
                                        selectedRoomIds.length === activeRooms.length
                                            ? []
                                            : activeRooms.map((r) => r.id)
                                    )
                                }
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                {selectedRoomIds.length > 0 ? "Hapus semua" : "Pilih semua ruangan"}
                            </button>
                        )}
                    </div>

                    {activeRooms.length > 6 && (
                        <div className="relative">
                            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={roomQuery}
                                onChange={(e) => setRoomQuery(e.target.value)}
                                placeholder="Cari ruangan..."
                                className={`${cleaningInputClass} pl-8 py-1.5 text-xs`}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-border rounded-lg p-2 bg-muted/10">
                        {filteredRooms.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1.5 py-2 col-span-full text-center">
                                {activeRooms.length === 0
                                    ? "Belum ada ruangan aktif."
                                    : "Ruangan tidak ditemukan."}
                            </p>
                        ) : (
                            filteredRooms.map((r) => {
                                const checked = selectedRoomIds.includes(r.id);
                                return (
                                    <label
                                        key={r.id}
                                        className={`flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 rounded-md border transition-colors ${
                                            checked
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-transparent hover:bg-accent/50"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                                toggleId(selectedRoomIds, setSelectedRoomIds, r.id)
                                            }
                                            className="rounded border-border"
                                        />
                                        <span className="text-foreground truncate">{r.name}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Langkah 2: Tipe & Daftar Petugas */}
                <div className="space-y-2">
                    <div>
                        <label
                            htmlFor="assign-worker-type"
                            className="block text-xs font-semibold text-foreground mb-1"
                        >
                            2. Tipe petugas
                        </label>
                        <select
                            id="assign-worker-type"
                            aria-label="Tipe petugas"
                            value={workerType}
                            onChange={(e) => {
                                setUserQuery("");
                                onChangeWorkerType(e.target.value as "INTERNAL" | "OUTSOURCE");
                            }}
                            className={cleaningInputClass}
                        >
                            <option value="INTERNAL">Karyawan</option>
                            <option value="OUTSOURCE">Petugas Outsource</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs font-semibold text-foreground">
                            Petugas ({selectedUserIds.length} dipilih)
                        </span>
                        {availableUsers.length > 0 && (
                            <button
                                type="button"
                                onClick={() =>
                                    setSelectedUserIds(
                                        selectedUserIds.length === availableUsers.length
                                            ? []
                                            : availableUsers.map((u) => u.id)
                                    )
                                }
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                {selectedUserIds.length > 0 ? "Hapus semua" : "Pilih semua"}
                            </button>
                        )}
                    </div>

                    {availableUsers.length > 6 && (
                        <div className="relative">
                            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={userQuery}
                                onChange={(e) => setUserQuery(e.target.value)}
                                placeholder="Cari nama petugas..."
                                className={`${cleaningInputClass} pl-8 py-1.5 text-xs`}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-border rounded-lg p-2 bg-muted/10">
                        {filteredUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-1.5 py-2 col-span-full text-center">
                                {availableUsers.length === 0
                                    ? "Belum ada petugas tersedia untuk tipe ini."
                                    : "Petugas tidak ditemukan."}
                            </p>
                        ) : (
                            filteredUsers.map((u) => {
                                const checked = selectedUserIds.includes(u.id);
                                return (
                                    <label
                                        key={u.id}
                                        className={`flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 rounded-md border transition-colors ${
                                            checked
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-transparent hover:bg-accent/50"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                                toggleId(selectedUserIds, setSelectedUserIds, u.id)
                                            }
                                            className="rounded border-border"
                                        />
                                        <span className="text-foreground truncate">
                                            {u.displayName}
                                        </span>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    {workerType === "OUTSOURCE" && (
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-3 py-2 rounded-lg border border-border bg-muted/25">
                            <span>Petugas outsource belum terdaftar?</span>
                            <button
                                type="button"
                                onClick={onOpenOutsourceModal}
                                className="inline-flex items-center gap-1 text-primary font-medium hover:underline shrink-0"
                            >
                                <UserPlus className="h-3.5 w-3.5" />
                                Buat Akun Outsource
                            </button>
                        </div>
                    )}
                </div>

                {/* Langkah 3: Jadwal Mulai */}
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                        <input
                            type="checkbox"
                            checked={applyToToday}
                            onChange={(e) => setApplyToToday(e.target.checked)}
                            className="rounded border-border"
                        />
                        Mulai hari ini (langsung aktif)
                    </label>
                    <p className="text-xs text-muted-foreground ml-6">
                        {applyToToday
                            ? "Petugas langsung aktif hari ini dan dapat mengisi checklist sekarang."
                            : "Jika tidak dicentang, penugasan otomatis mulai besok pagi."}
                    </p>
                </div>

                {/* Ringkasan & Hasil */}
                <div className="flex items-center justify-between text-xs" aria-live="polite">
                    <span className="font-medium text-foreground">
                        {totalAssignments > 0
                            ? `${selectedUserIds.length} petugas × ${selectedRoomIds.length} ruangan = ${totalAssignments} penugasan`
                            : "Pilih minimal 1 ruangan dan 1 petugas."}
                    </span>
                </div>

                {result && (
                    <div className="rounded-lg border border-border bg-muted/15 p-3 space-y-1.5 text-xs">
                        {result.created.length > 0 && (
                            <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                                Berhasil ({result.created.length}):{" "}
                                {result.created
                                    .slice(0, 5)
                                    .map((c) => `${c.displayName} → ${c.roomName}`)
                                    .join("; ")}
                                {result.created.length > 5
                                    ? ` (+${result.created.length - 5} lainnya)`
                                    : ""}
                            </p>
                        )}
                        {result.skipped.length > 0 && (
                            <p className="text-amber-700 dark:text-amber-400 font-medium">
                                Sudah terdaftar ({result.skipped.length}):{" "}
                                {result.skipped
                                    .slice(0, 5)
                                    .map((c) => `${c.displayName} → ${c.roomName}`)
                                    .join("; ")}
                                {result.skipped.length > 5
                                    ? ` (+${result.skipped.length - 5} lainnya)`
                                    : ""}
                            </p>
                        )}
                        {result.failed.map((f, idx) => (
                            <p key={idx} className="text-destructive">
                                Gagal: {f.displayName} → {f.roomName} ({f.message})
                            </p>
                        ))}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[42px]"
                    >
                        Tutup
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={saving || totalAssignments === 0}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saving
                            ? "Menyimpan..."
                            : totalAssignments > 0
                                ? `Tugaskan ${totalAssignments} penugasan`
                                : "Tugaskan"}
                    </button>
                </div>
            </div>
        </AccessibleModal>
    );
}
