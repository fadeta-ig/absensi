"use client";

import Link from "next/link";
import { Loader2, Plus, UserPlus, X } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cleaningInputClass, type OutsourceCleaningUser } from "./cleaningSettingsUtils";

interface OutsourceUsersModalProps {
    outsourceUsers: OutsourceCleaningUser[];
    loadingOutsource: boolean;
    username: string;
    setUsername: (val: string) => void;
    displayName: string;
    setDisplayName: (val: string) => void;
    email: string;
    setEmail: (val: string) => void;
    password: string;
    setPassword: (val: string) => void;
    saving: boolean;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
}

export default function OutsourceUsersModal({
    outsourceUsers,
    loadingOutsource,
    username,
    setUsername,
    displayName,
    setDisplayName,
    email,
    setEmail,
    password,
    setPassword,
    saving,
    onSubmit,
    onClose,
}: OutsourceUsersModalProps) {
    return (
        <AccessibleModal
            ariaLabel="Kelola Petugas Outsource"
            onClose={onClose}
            className="!max-w-2xl !p-6"
        >
            <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                <div>
                    <h2 className="modal-title">Kelola Petugas Outsource</h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Buat cepat akun petugas outsource kebersihan. Untuk mengubah profil, mengatur ulang
                        kata sandi, atau mengelola status akun, buka{" "}
                        <Link
                            href="/ga/outsource-users"
                            className="text-[var(--primary)] underline font-medium"
                        >
                            Akun Outsource
                        </Link>
                        .
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

            <div className="p-4 rounded-xl border border-border bg-muted/20 mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground mb-3 flex items-center gap-1.5">
                    <UserPlus className="h-4 w-4 text-primary" />
                    Tambah Akun Petugas Outsource
                </h3>
                <form onSubmit={onSubmit} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label
                                className="block text-xs font-medium text-foreground mb-1"
                                htmlFor="outsource-username"
                            >
                                Username
                            </label>
                            <input
                                id="outsource-username"
                                type="text"
                                value={username}
                                onChange={(e) =>
                                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                                }
                                placeholder="Contoh: tono_kebersihan"
                                required
                                className={cleaningInputClass}
                            />
                        </div>
                        <div>
                            <label
                                className="block text-xs font-medium text-foreground mb-1"
                                htmlFor="outsource-display-name"
                            >
                                Nama Lengkap
                            </label>
                            <input
                                id="outsource-display-name"
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Contoh: Tono Santoso"
                                required
                                className={cleaningInputClass}
                            />
                        </div>
                        <div>
                            <label
                                className="block text-xs font-medium text-foreground mb-1"
                                htmlFor="outsource-email"
                            >
                                Email (Opsional)
                            </label>
                            <input
                                id="outsource-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Otomatis dibuat jika dikosongkan"
                                className={cleaningInputClass}
                            />
                        </div>
                        <div>
                            <label
                                className="block text-xs font-medium text-foreground mb-1"
                                htmlFor="outsource-password"
                            >
                                Password
                            </label>
                            <input
                                id="outsource-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Minimal 8 karakter"
                                minLength={8}
                                maxLength={128}
                                autoComplete="new-password"
                                required
                                className={cleaningInputClass}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end pt-1">
                        <button
                            type="submit"
                            disabled={
                                saving ||
                                !username.trim() ||
                                !displayName.trim() ||
                                password.length < 8
                            }
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                        >
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            Simpan Akun Outsource
                        </button>
                    </div>
                </form>
            </div>

            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Akun Outsource Terdaftar ({outsourceUsers.length})
                </h3>

                {loadingOutsource ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : outsourceUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-6 text-center border border-dashed border-border rounded-lg">
                        Belum ada akun petugas outsource yang terdaftar.
                    </p>
                ) : (
                    <div className="border border-border rounded-xl overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Petugas</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Ruangan Aktif</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {outsourceUsers.map((u) => {
                                    const assignedRooms = u.cleaningAssignments
                                        .map((ca) => ca.room.name)
                                        .join(", ");
                                    return (
                                        <TableRow key={u.id}>
                                            <TableCell>
                                                <div className="font-medium text-foreground">
                                                    {u.displayName}
                                                </div>
                                                <div className="text-xs text-muted-foreground font-mono">
                                                    @{u.username}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {u.email}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {assignedRooms ? (
                                                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                                        {assignedRooms}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        Belum ditugaskan
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </AccessibleModal>
    );
}
