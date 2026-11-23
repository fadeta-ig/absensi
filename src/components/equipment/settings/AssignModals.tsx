"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import EquipmentActorPicker from "@/components/equipment/settings/EquipmentActorPicker";
import { extractOsUserIdFromToken, toOsActorToken } from "@/lib/services/equipmentAuth";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import {
    EquipmentCompanyBadge,
    EquipmentGlobalBadge,
    resolveDisplayCompanies,
} from "@/components/equipment/EquipmentStatusBadge";
import {
    formatShortWibDate,
    inputClass,
    isAssignmentActive,
} from "@/components/equipment/settings/useSettingsData";
import type {
    EquipmentAssignment,
    EquipmentProduct,
    EquipmentUnit,
    ProductToolRow,
} from "@/components/equipment/settings/useSettingsData";

export type AssignMode = "units" | "company" | "product" | "global";

export type AssignBulkResult = { created: number; skipped: Array<{ unitName: string; reason: string }> };

export interface CreateAssignmentModalProps {
    open: boolean;
    units: EquipmentUnit[];
    assignments: EquipmentAssignment[];
    fetchAssignments: () => Promise<void>;
    fetchUnits: () => Promise<void>;
    onClose: () => void;
    onEndAssignment: (assignment: EquipmentAssignment) => void;
}

function formatPeriod(startsOn: string, endsOn: string | null): string {
    const start = formatShortWibDate(startsOn);
    if (!endsOn) return `Mulai ${start}`;
    return `${start} - ${formatShortWibDate(endsOn)}`;
}

export function CreateAssignmentModal({
    open,
    units,
    assignments,
    fetchAssignments,
    fetchUnits,
    onClose,
    onEndAssignment,
}: CreateAssignmentModalProps) {
    const toast = useToast();

    const [assignMode, setAssignMode] = useState<AssignMode>("units");
    const [assignUnitIds, setAssignUnitIds] = useState<string[]>([]);
    const [assignUnitQuery, setAssignUnitQuery] = useState("");
    const [assignCompany, setAssignCompany] = useState<"WIG" | "MKI">("WIG");
    const [assignProducts, setAssignProducts] = useState<EquipmentProduct[]>([]);
    const [assignProductsLoading, setAssignProductsLoading] = useState(false);
    const [assignProductId, setAssignProductId] = useState("");
    const [assignProductTools, setAssignProductTools] = useState<ProductToolRow[]>([]);
    const [assignProductLoading, setAssignProductLoading] = useState(false);
    const [assignEmployee, setAssignEmployee] = useState<EmployeePick | null>(null);
    const [showExistingActive, setShowExistingActive] = useState(false);
    const [assignStartsOn, setAssignStartsOn] = useState("");
    const [assignEndsOn, setAssignEndsOn] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);
    const [assignBulkResult, setAssignBulkResult] = useState<AssignBulkResult | null>(null);

    const fetchAssignProducts = useCallback(
        async (company: "WIG" | "MKI") => {
            setAssignProductsLoading(true);
            try {
                const res = await fetch(`/api/ga/equipment/products?company=${company}`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat produk."));
                const json = await res.json();
                setAssignProducts(json.data ?? []);
            } catch (err) {
                const msg = getFriendlyClientErrorMessage(err, "Gagal memuat daftar produk. Coba lagi.");
                toast(msg, "error");
                reportClientError("EquipmentSettings", msg, err);
            } finally {
                setAssignProductsLoading(false);
            }
        },
        [toast]
    );

    const fetchAssignProductTools = useCallback(
        async (productId: string) => {
            setAssignProductLoading(true);
            try {
                const res = await fetch(`/api/ga/equipment/products/${productId}/tools`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar alat produk."));
                const json = await res.json();
                setAssignProductTools(json.data.tools ?? []);
            } catch (err) {
                const msg = getFriendlyClientErrorMessage(err, "Gagal memuat daftar alat produk. Coba lagi.");
                setAssignProductTools([]);
                toast(msg, "error");
                reportClientError("EquipmentSettings", msg, err);
            } finally {
                setAssignProductLoading(false);
            }
        },
        [toast]
    );

    useEffect(() => {
        if (assignMode !== "product") return;
        setAssignProductId("");
        setAssignProductTools([]);
        void fetchAssignProducts(assignCompany);
    }, [assignMode, assignCompany, fetchAssignProducts]);

    const saveAssignment = useCallback(async () => {
        if (savingAssign) return;
        if (!assignEmployee) {
            toast("Pilih petugas terlebih dahulu.", "warning");
            return;
        }
        const previewIds =
            assignMode === "units"
                ? assignUnitIds
                : assignMode === "company"
                  ? units.filter((u) => u.isActive && resolveDisplayCompanies(u).includes(assignCompany)).map((u) => u.id)
                  : assignMode === "product"
                    ? assignProductTools.filter((t) => t.checked).map((t) => t.id)
                    : [];
        if (assignMode !== "global" && previewIds.length === 0) {
            toast(
                assignMode === "units"
                    ? "Centang minimal satu alat."
                    : assignMode === "company"
                      ? `Tidak ada alat aktif untuk ${assignCompany}.`
                      : "Pilih produk yang sudah memiliki daftar alat.",
                "warning"
            );
            return;
        }
        setSavingAssign(true);
        setAssignBulkResult(null);
        try {
            const base = {
                employeeId: assignEmployee.employeeId,
                ...(assignStartsOn ? { startsOnWibDate: assignStartsOn } : {}),
                ...(assignEndsOn ? { endsOnWibDate: assignEndsOn } : {}),
            };
            if (assignMode === "global") {
                const res = await fetch("/api/ga/equipment/assignments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...base, unitId: null }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan penugasan."));
                toast("Penugasan untuk semua unit berhasil dibuat.", "success");
            } else {
                const res = await fetch("/api/ga/equipment/assignments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...base, unitIds: previewIds }),
                });
                const json = await res.json().catch(() => ({}));
                if (res.status === 409 && Array.isArray(json.details)) {
                    setAssignBulkResult({ created: 0, skipped: json.details });
                    toast("Semua alat dilewati karena sudah ditugaskan sebelumnya.", "warning");
                } else {
                    if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan penugasan.");
                    const data = json.data as { created: unknown[]; skipped: Array<{ unitName: string; reason: string }> };
                    setAssignBulkResult({ created: data.created.length, skipped: data.skipped });
                    toast(
                        data.skipped.length === 0
                            ? `${data.created.length} penugasan dibuat.`
                            : `${data.created.length} dibuat, ${data.skipped.length} dilewati.`,
                        data.skipped.length === 0 ? "success" : "warning"
                    );
                }
            }
            setAssignUnitIds([]);
            setAssignUnitQuery("");
            setAssignStartsOn("");
            setAssignEndsOn("");
            setAssignProductId("");
            setAssignProductTools([]);
            await Promise.all([fetchAssignments(), fetchUnits()]);
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal menyimpan penugasan. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
        } finally {
            setSavingAssign(false);
        }
    }, [
        savingAssign,
        assignMode,
        assignUnitIds,
        assignCompany,
        assignProductTools,
        units,
        assignEmployee,
        assignStartsOn,
        assignEndsOn,
        toast,
        fetchAssignments,
        fetchUnits,
    ]);

    const assignableUnits = units.filter((u) => u.isActive && resolveDisplayCompanies(u).length > 0);
    const filteredAssignUnits = assignableUnits.filter((u) => {
        const q = assignUnitQuery.trim().toLowerCase();
        if (!q) return true;
        return `${u.name} ${u.brand ?? ""} ${u.location ?? ""} ${resolveDisplayCompanies(u).join(" ")}`
            .toLowerCase()
            .includes(q);
    });
    const assignCompanyUnits = assignableUnits.filter((u) => resolveDisplayCompanies(u).includes(assignCompany));
    const assignProductChecked = assignProductTools.filter((t) => t.checked);
    const assignPreviewCount =
        assignMode === "units"
            ? assignUnitIds.length
            : assignMode === "company"
              ? assignCompanyUnits.length
              : assignMode === "product"
                ? assignProductChecked.length
                : 0;
    const assignEmployeeActive = assignEmployee
        ? assignments.filter((a) => {
              const osId = extractOsUserIdFromToken(assignEmployee.employeeId);
              const matched = osId ? a.user.id === osId : a.user.employeeId === assignEmployee.employeeId;
              return matched && isAssignmentActive(a);
          })
        : [];
    const isAssignOs = Boolean(assignEmployee && extractOsUserIdFromToken(assignEmployee.employeeId));

    if (!open) return null;

    return (
        <AccessibleModal ariaLabel="Penugasan Baru" onClose={() => onClose()} className="!max-w-2xl">
            <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                <div>
                    <h2 className="modal-title">Penugasan Baru</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Tentukan petugas, alat yang ditugaskan, dan periode berlaku.
                    </p>
                </div>
                <button type="button" className="modal-close" onClick={() => onClose()} aria-label="Tutup jendela">
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="space-y-4">
                {/* Langkah 1: Petugas */}
                <div className="space-y-2">
                    <EquipmentActorPicker
                        role="operator"
                        label="1. Pilih Petugas"
                        value={assignEmployee}
                        onChange={(pick) => {
                            setAssignEmployee(pick);
                            setShowExistingActive(false);
                        }}
                    />
                    {assignEmployee && (
                        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
                                    <span className="truncate font-medium text-foreground">
                                        {assignEmployee.name}
                                        {!isAssignOs ? ` (${assignEmployee.employeeId})` : ""}
                                    </span>
                                    {isAssignOs && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 shrink-0">
                                            OS
                                        </span>
                                    )}
                                    <span className="shrink-0">
                                        {assignEmployeeActive.length === 0
                                            ? "· Belum ada penugasan aktif"
                                            : `· ${assignEmployeeActive.length} penugasan aktif`}
                                    </span>
                                </span>
                                {assignEmployeeActive.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowExistingActive((v) => !v)}
                                        className="inline-flex items-center gap-0.5 text-primary font-medium hover:underline shrink-0"
                                    >
                                        {showExistingActive ? (
                                            <>
                                                <ChevronDown className="h-3.5 w-3.5" /> Sembunyikan
                                            </>
                                        ) : (
                                            <>
                                                <ChevronRight className="h-3.5 w-3.5" /> Lihat daftar
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                            {showExistingActive && assignEmployeeActive.length > 0 && (
                                <ul className="mt-2 pt-2 border-t border-border/60 space-y-1 max-h-[160px] overflow-y-auto">
                                    {assignEmployeeActive.map((a) => (
                                        <li key={a.id} className="flex items-center justify-between gap-2">
                                            <span className="min-w-0 truncate">
                                                {a.unit ? a.unit.name : "Semua unit"}{" "}
                                                {a.unit ? (
                                                    <EquipmentCompanyBadge
                                                        company={a.unit.company}
                                                        isSharedBoth={a.unit.isSharedBoth}
                                                        companies={a.unit.companies}
                                                    />
                                                ) : (
                                                    <EquipmentGlobalBadge />
                                                )}{" "}
                                                <span className="text-muted-foreground">
                                                    · {formatPeriod(a.startsOnWibDate, a.endsOnWibDate)}
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => onEndAssignment(a)}
                                                className="shrink-0 text-rose-600 hover:underline px-1"
                                            >
                                                Akhiri
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Langkah 2: Pilih Cakupan Alat */}
                <div className="space-y-2.5 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-foreground">2. Pilih Alat yang Ditugaskan</p>
                    <div
                        role="tablist"
                        aria-label="Cara memilih alat"
                        className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-lg border border-border bg-muted/40 p-1"
                    >
                        {(
                            [
                                ["units", "Alat Tertentu"],
                                ["company", "Per Perusahaan"],
                                ["product", "Per Produk"],
                                ["global", "Semua Unit"],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={assignMode === key}
                                onClick={() => setAssignMode(key)}
                                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors min-h-[36px] ${
                                    assignMode === key
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {assignMode === "units" && (
                        <div className="space-y-2">
                            <EquipmentSearchField
                                id="cari-alat-penugasan"
                                label="Cari alat"
                                value={assignUnitQuery}
                                onChange={setAssignUnitQuery}
                                placeholder="Cari nama, merek, atau lokasi..."
                            />
                            <div className="flex items-center justify-between text-xs">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const ids = filteredAssignUnits.map((u) => u.id);
                                        const allVisible =
                                            ids.length > 0 && ids.every((id) => assignUnitIds.includes(id));
                                        setAssignUnitIds((prev) =>
                                            allVisible
                                                ? prev.filter((id) => !ids.includes(id))
                                                : [...new Set([...prev, ...ids])]
                                        );
                                    }}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {filteredAssignUnits.length > 0 &&
                                    filteredAssignUnits.every((u) => assignUnitIds.includes(u.id))
                                        ? "Batalkan semua hasil"
                                        : `Pilih semua hasil (${filteredAssignUnits.length})`}
                                </button>
                                <span className="text-muted-foreground" aria-live="polite">
                                    {assignUnitIds.length} alat dipilih
                                </span>
                            </div>
                            {filteredAssignUnits.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                                    {assignableUnits.length === 0
                                        ? "Belum ada alat aktif berkategori WIG atau MKI."
                                        : "Tidak ada alat yang cocok dengan pencarian."}
                                </p>
                            ) : (
                                <ul className="space-y-1 max-h-[220px] overflow-y-auto pr-0.5">
                                    {filteredAssignUnits.map((u) => (
                                        <li key={u.id}>
                                            <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/40">
                                                <input
                                                    type="checkbox"
                                                    checked={assignUnitIds.includes(u.id)}
                                                    onChange={(e) =>
                                                        setAssignUnitIds((prev) =>
                                                            e.target.checked
                                                                ? [...prev, u.id]
                                                                : prev.filter((id) => id !== u.id)
                                                        )
                                                    }
                                                    className="rounded border-border shrink-0"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-medium truncate">{u.name}</span>
                                                    {(u.brand || u.location) && (
                                                        <span className="block text-xs text-muted-foreground truncate">
                                                            {[u.brand, u.location].filter(Boolean).join(" · ")}
                                                        </span>
                                                    )}
                                                </span>
                                                <EquipmentCompanyBadge
                                                    company={u.company}
                                                    isSharedBoth={u.isSharedBoth}
                                                    companies={u.companies}
                                                />
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {units.some((u) => u.isActive && resolveDisplayCompanies(u).length === 0) && (
                                <p className="text-[11px] text-muted-foreground">
                                    Alat yang belum memiliki perusahaan tidak tampil di sini. Atur dulu di tab Unit Alat atau Produk.
                                </p>
                            )}
                        </div>
                    )}

                    {assignMode === "company" && (
                        <div className="space-y-2">
                            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                                {(["WIG", "MKI"] as const).map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setAssignCompany(c)}
                                        className={`px-3.5 py-1.5 rounded font-semibold min-h-[36px] ${
                                            assignCompany === c
                                                ? "bg-background text-primary shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground" aria-live="polite">
                                {assignCompanyUnits.length} alat aktif {assignCompany} akan ditugaskan.
                            </p>
                            {assignCompanyUnits.length > 0 && (
                                <ul className="space-y-1 max-h-[180px] overflow-y-auto">
                                    {assignCompanyUnits.map((u) => (
                                        <li
                                            key={u.id}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5"
                                        >
                                            <span className="text-sm truncate">{u.name}</span>
                                            <EquipmentCompanyBadge
                                                company={u.company}
                                                isSharedBoth={u.isSharedBoth}
                                                companies={u.companies}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {assignMode === "product" && (
                        <div className="space-y-2">
                            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                                {(["WIG", "MKI"] as const).map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setAssignCompany(c)}
                                        className={`px-3.5 py-1.5 rounded font-semibold min-h-[36px] ${
                                            assignCompany === c
                                                ? "bg-background text-primary shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label htmlFor="assign-product" className="text-xs font-medium">
                                    Produk {assignCompany}
                                </label>
                                <select
                                    id="assign-product"
                                    value={assignProductId}
                                    onChange={(e) => {
                                        setAssignProductId(e.target.value);
                                        if (e.target.value) void fetchAssignProductTools(e.target.value);
                                        else setAssignProductTools([]);
                                    }}
                                    disabled={assignProductsLoading}
                                    className={`${inputClass} mt-1 disabled:opacity-50 min-h-[42px]`}
                                >
                                    <option value="">{assignProductsLoading ? "Memuat..." : "Pilih produk"}</option>
                                    {assignProducts.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p._count.tools} alat)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {assignProductLoading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                assignProductId && (
                                    <>
                                        <p className="text-xs text-muted-foreground" aria-live="polite">
                                            {assignProductChecked.length} alat terpetakan akan ditugaskan.
                                        </p>
                                        {assignProductChecked.length > 0 && (
                                            <ul className="space-y-1 max-h-[160px] overflow-y-auto">
                                                {assignProductChecked.map((t) => (
                                                    <li
                                                        key={t.id}
                                                        className="rounded-lg border border-border px-3 py-1.5 text-sm truncate"
                                                    >
                                                        {t.name}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                )
                            )}
                        </div>
                    )}

                    {assignMode === "global" && (
                        <FeedbackMessage variant="info">
                            Mencakup semua unit aktif WIG dan MKI sekaligus, termasuk unit baru di kemudian hari.
                        </FeedbackMessage>
                    )}
                </div>

                {/* Langkah 3: Periode Opsional */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                    <div>
                        <label htmlFor="assign-starts" className="text-xs font-medium">
                            Tanggal Mulai (opsional)
                        </label>
                        <input
                            id="assign-starts"
                            type="date"
                            value={assignStartsOn}
                            onChange={(e) => setAssignStartsOn(e.target.value)}
                            className={`${inputClass} mt-1 min-h-[42px]`}
                        />
                        <p className="text-[11px] text-muted-foreground mt-0.5">Kosongkan untuk mulai hari ini.</p>
                    </div>
                    <div>
                        <label htmlFor="assign-ends" className="text-xs font-medium">
                            Tanggal Selesai (opsional)
                        </label>
                        <input
                            id="assign-ends"
                            type="date"
                            value={assignEndsOn}
                            onChange={(e) => setAssignEndsOn(e.target.value)}
                            className={`${inputClass} mt-1 min-h-[42px]`}
                        />
                        <p className="text-[11px] text-muted-foreground mt-0.5">Kosongkan bila tanpa batas waktu.</p>
                    </div>
                </div>

                {assignBulkResult && (
                    <FeedbackMessage variant={assignBulkResult.skipped.length === 0 ? "success" : "warning"}>
                        {assignBulkResult.created} penugasan dibuat
                        {assignBulkResult.skipped.length > 0 && (
                            <>
                                {`, ${assignBulkResult.skipped.length} dilewati:`}
                                <ul className="mt-1 list-disc pl-5">
                                    {assignBulkResult.skipped.slice(0, 5).map((s) => (
                                        <li key={s.unitName}>
                                            {s.unitName}: {s.reason}
                                        </li>
                                    ))}
                                    {assignBulkResult.skipped.length > 5 && (
                                        <li>...dan {assignBulkResult.skipped.length - 5} lainnya.</li>
                                    )}
                                </ul>
                            </>
                        )}
                    </FeedbackMessage>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted min-h-[44px]"
                    >
                        Tutup
                    </button>
                    <button
                        type="button"
                        onClick={() => void saveAssignment()}
                        disabled={savingAssign}
                        className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                    >
                        {savingAssign
                            ? "Menyimpan..."
                            : assignMode === "global"
                              ? "Simpan Penugasan Global"
                              : `Simpan ${assignPreviewCount} Penugasan`}
                    </button>
                </div>
            </div>
        </AccessibleModal>
    );
}

export interface EditAssignmentModalProps {
    assignment: EquipmentAssignment | null;
    units: EquipmentUnit[];
    fetchAssignments: () => Promise<void>;
    fetchUnits: () => Promise<void>;
    onClose: () => void;
}

export function EditAssignmentModal({
    assignment,
    units,
    fetchAssignments,
    fetchUnits,
    onClose,
}: EditAssignmentModalProps) {
    const toast = useToast();

    const [editIsGlobal, setEditIsGlobal] = useState(false);
    const [editUnitIds, setEditUnitIds] = useState<string[]>([]);
    const [editUnitQuery, setEditUnitQuery] = useState("");
    const [editEmployee, setEditEmployee] = useState<EmployeePick | null>(null);
    const [editStartsOn, setEditStartsOn] = useState("");
    const [editEndsOn, setEditEndsOn] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);
    const [editBulkResult, setEditBulkResult] = useState<AssignBulkResult | null>(null);

    useEffect(() => {
        if (!assignment) return;
        setEditIsGlobal(!assignment.unitId);
        setEditUnitIds(assignment.unitId ? [assignment.unitId] : []);
        setEditUnitQuery("");
        setEditBulkResult(null);
        setEditEmployee(
            assignment.user.employeeId
                ? { employeeId: assignment.user.employeeId, name: assignment.user.displayName }
                : {
                      employeeId: toOsActorToken(assignment.user.id),
                      name: assignment.user.username
                          ? `${assignment.user.displayName} (@${assignment.user.username})`
                          : assignment.user.displayName,
                  }
        );
        setEditStartsOn(assignment.startsOnWibDate);
        setEditEndsOn(assignment.endsOnWibDate ?? "");
        setSavingEdit(false);
    }, [assignment]);

    const saveEditAssignment = useCallback(async () => {
        if (!assignment || savingEdit) return;
        if (!editEmployee) {
            toast("Pilih petugas terlebih dahulu.", "warning");
            return;
        }
        if (!editIsGlobal && editUnitIds.length === 0) {
            toast("Centang minimal satu alat atau pilih Semua unit.", "warning");
            return;
        }
        setSavingEdit(true);
        setEditBulkResult(null);
        try {
            const patchRes = await fetch("/api/ga/equipment/assignments", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    assignmentId: assignment.id,
                    unitId: editIsGlobal ? null : editUnitIds[0],
                    employeeId: editEmployee.employeeId,
                    startsOnWibDate: editStartsOn,
                    endsOnWibDate: editEndsOn || null,
                }),
            });
            if (!patchRes.ok) throw new Error(await getResponseErrorMessage(patchRes, "Gagal menyimpan perubahan."));
            const extra = editIsGlobal ? [] : editUnitIds.slice(1);
            if (extra.length === 0) {
                toast("Penugasan diperbarui.", "success");
                onClose();
                await Promise.all([fetchAssignments(), fetchUnits()]);
                return;
            }
            const bulkRes = await fetch("/api/ga/equipment/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: editEmployee.employeeId,
                    ...(editStartsOn ? { startsOnWibDate: editStartsOn } : {}),
                    ...(editEndsOn ? { endsOnWibDate: editEndsOn } : {}),
                    unitIds: extra,
                }),
            });
            const json = await bulkRes.json().catch(() => ({}));
            if (bulkRes.status === 409 && Array.isArray(json.details)) {
                setEditBulkResult({ created: 0, skipped: json.details });
                toast("Baris ini diperbarui; semua alat tambahan dilewati.", "warning");
            } else {
                if (!bulkRes.ok) throw new Error(json.error ?? "Gagal menambah penugasan.");
                const data = json.data as { created: unknown[]; skipped: Array<{ unitName: string; reason: string }> };
                setEditBulkResult({ created: data.created.length, skipped: data.skipped });
                if (data.skipped.length === 0) {
                    toast(`Penugasan diperbarui dan ${data.created.length} baris tambahan dibuat.`, "success");
                    onClose();
                } else {
                    toast(
                        `Baris diperbarui; ${data.created.length} tambahan dibuat, ${data.skipped.length} dilewati.`,
                        "warning"
                    );
                }
            }
            await Promise.all([fetchAssignments(), fetchUnits()]);
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal menyimpan perubahan. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
        } finally {
            setSavingEdit(false);
        }
    }, [
        assignment,
        savingEdit,
        editIsGlobal,
        editUnitIds,
        editEmployee,
        editStartsOn,
        editEndsOn,
        toast,
        fetchAssignments,
        fetchUnits,
        onClose,
    ]);

    const assignableUnits = units.filter((u) => u.isActive && resolveDisplayCompanies(u).length > 0);
    const editListUnits = (() => {
        const currentId = assignment?.unitId;
        if (!currentId || assignableUnits.some((u) => u.id === currentId)) return assignableUnits;
        const cur = units.find((u) => u.id === currentId);
        return cur ? [...assignableUnits, cur] : assignableUnits;
    })();
    const filteredEditUnits = editListUnits.filter((u) => {
        const q = editUnitQuery.trim().toLowerCase();
        if (!q) return true;
        return `${u.name} ${u.brand ?? ""} ${u.location ?? ""} ${resolveDisplayCompanies(u).join(" ")}`
            .toLowerCase()
            .includes(q);
    });

    if (!assignment) return null;

    return (
        <AccessibleModal ariaLabel="Ubah Penugasan" onClose={() => onClose()} className="!max-w-2xl">
            <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                <div>
                    <h2 className="modal-title">Ubah Penugasan</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Ubah petugas, alat, atau periode berlaku. Memilih lebih dari satu alat otomatis membuat baris
                        penugasan tambahan.
                    </p>
                </div>
                <button type="button" className="modal-close" onClick={() => onClose()} aria-label="Tutup jendela">
                    <X className="h-5 w-5" />
                </button>
            </div>
            <div className="space-y-4">
                <EquipmentActorPicker
                    role="operator"
                    label="Petugas"
                    value={editEmployee}
                    onChange={setEditEmployee}
                />

                <div className="space-y-2 pt-2 border-t border-border">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={editIsGlobal}
                            onChange={(e) => {
                                setEditIsGlobal(e.target.checked);
                                if (e.target.checked) setEditUnitIds([]);
                            }}
                            className="rounded border-border"
                        />
                        Berlaku untuk semua unit (global)
                    </label>
                    {!editIsGlobal && (
                        <>
                            <EquipmentSearchField
                                id="cari-alat-edit-penugasan"
                                label="Cari alat"
                                value={editUnitQuery}
                                onChange={setEditUnitQuery}
                                placeholder="Cari nama, merek, atau lokasi..."
                            />
                            <div className="flex items-center justify-between text-xs">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const ids = filteredEditUnits.map((u) => u.id);
                                        const allVisible =
                                            ids.length > 0 && ids.every((id) => editUnitIds.includes(id));
                                        setEditUnitIds((prev) =>
                                            allVisible
                                                ? prev.filter((id) => !ids.includes(id))
                                                : [...new Set([...prev, ...ids])]
                                        );
                                    }}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {filteredEditUnits.length > 0 &&
                                    filteredEditUnits.every((u) => editUnitIds.includes(u.id))
                                        ? "Batalkan semua hasil"
                                        : `Pilih semua hasil (${filteredEditUnits.length})`}
                                </button>
                                <span className="text-muted-foreground" aria-live="polite">
                                    {editUnitIds.length} alat dipilih
                                </span>
                            </div>
                            {filteredEditUnits.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                                    Tidak ada alat yang cocok dengan pencarian.
                                </p>
                            ) : (
                                <ul className="space-y-1 max-h-[210px] overflow-y-auto pr-0.5">
                                    {filteredEditUnits.map((u) => (
                                        <li key={u.id}>
                                            <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/40">
                                                <input
                                                    type="checkbox"
                                                    checked={editUnitIds.includes(u.id)}
                                                    onChange={(e) =>
                                                        setEditUnitIds((prev) =>
                                                            e.target.checked
                                                                ? [...prev, u.id]
                                                                : prev.filter((id) => id !== u.id)
                                                        )
                                                    }
                                                    className="rounded border-border shrink-0"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-medium truncate">{u.name}</span>
                                                    {(u.brand || u.location) && (
                                                        <span className="block text-xs text-muted-foreground truncate">
                                                            {[u.brand, u.location].filter(Boolean).join(" · ")}
                                                        </span>
                                                    )}
                                                </span>
                                                <EquipmentCompanyBadge
                                                    company={u.company}
                                                    isSharedBoth={u.isSharedBoth}
                                                    companies={u.companies}
                                                />
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                    <div>
                        <label htmlFor="edit-assign-starts" className="text-xs font-medium">
                            Tanggal Mulai
                        </label>
                        <input
                            id="edit-assign-starts"
                            type="date"
                            value={editStartsOn}
                            onChange={(e) => setEditStartsOn(e.target.value)}
                            className={`${inputClass} mt-1 min-h-[42px]`}
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-assign-ends" className="text-xs font-medium">
                            Tanggal Selesai (opsional)
                        </label>
                        <input
                            id="edit-assign-ends"
                            type="date"
                            value={editEndsOn}
                            onChange={(e) => setEditEndsOn(e.target.value)}
                            className={`${inputClass} mt-1 min-h-[42px]`}
                        />
                    </div>
                </div>

                {editBulkResult && editBulkResult.skipped.length > 0 && (
                    <FeedbackMessage variant="warning">
                        {editBulkResult.created} baris tambahan dibuat, {editBulkResult.skipped.length} dilewati:
                        <ul className="mt-1 list-disc pl-5">
                            {editBulkResult.skipped.slice(0, 5).map((s) => (
                                <li key={s.unitName}>
                                    {s.unitName}: {s.reason}
                                </li>
                            ))}
                            {editBulkResult.skipped.length > 5 && (
                                <li>...dan {editBulkResult.skipped.length - 5} lainnya.</li>
                            )}
                        </ul>
                    </FeedbackMessage>
                )}

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted min-h-[44px]"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={() => void saveEditAssignment()}
                        disabled={savingEdit}
                        className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                    >
                        {savingEdit
                            ? "Menyimpan..."
                            : !editIsGlobal && editUnitIds.length > 1
                              ? `Simpan (1 diubah + ${editUnitIds.length - 1} baru)`
                              : "Simpan Perubahan"}
                    </button>
                </div>
            </div>
        </AccessibleModal>
    );
}
