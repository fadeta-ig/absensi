"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmployeeSearchPicker, { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentCompanyBadge, EquipmentGlobalBadge, resolveDisplayCompanies } from "@/components/equipment/EquipmentStatusBadge";
import { inputClass, isAssignmentActive } from "@/app/ga/equipment/settings/_components/useSettingsData";
import type {
    EquipmentAssignment,
    EquipmentProduct,
    EquipmentUnit,
    ProductToolRow,
} from "@/app/ga/equipment/settings/_components/useSettingsData";

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
    const [assignStartsOn, setAssignStartsOn] = useState("");
    const [assignEndsOn, setAssignEndsOn] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);
    const [assignBulkResult, setAssignBulkResult] = useState<{ created: number; skipped: Array<{ unitName: string; reason: string }> } | null>(null);

    const fetchAssignProducts = useCallback(async (company: "WIG" | "MKI") => {
        setAssignProductsLoading(true);
        try {
            const res = await fetch(`/api/ga/equipment/products?company=${company}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat produk."));
            const json = await res.json();
            setAssignProducts(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat produk.";
            toast(msg, "error");
            reportClientError("EquipmentSettings", msg, err);
        } finally {
            setAssignProductsLoading(false);
        }
    }, [toast]);

    const fetchAssignProductTools = useCallback(async (productId: string) => {
        setAssignProductLoading(true);
        try {
            const res = await fetch(`/api/ga/equipment/products/${productId}/tools`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat alat produk."));
            const json = await res.json();
            setAssignProductTools(json.data.tools ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat alat produk.";
            setAssignProductTools([]);
            toast(msg, "error");
            reportClientError("EquipmentSettings", msg, err);
        } finally {
            setAssignProductLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (assignMode !== "product") return;
        setAssignProductId("");
        setAssignProductTools([]);
        void fetchAssignProducts(assignCompany);
    }, [assignMode, assignCompany, fetchAssignProducts]);

    const saveAssignment = useCallback(async () => {
        if (savingAssign) return;
        if (!assignEmployee) {
            toast("Pilih karyawan terlebih dahulu.", "warning");
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
                      ? `Tidak ada alat aktif berkategori ${assignCompany}.`
                      : "Pilih produk yang sudah dipetakan ke alat.",
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
                toast("Penugasan global dibuat (berlaku semua unit).", "success");
            } else {
                const res = await fetch("/api/ga/equipment/assignments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...base, unitIds: previewIds }),
                });
                const json = await res.json().catch(() => ({}));
                if (res.status === 409 && Array.isArray(json.details)) {
                    setAssignBulkResult({ created: 0, skipped: json.details });
                    toast("Semua alat di-skip (sudah ditugaskan).", "warning");
                } else {
                    if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan penugasan.");
                    const data = json.data as { created: unknown[]; skipped: Array<{ unitName: string; reason: string }> };
                    setAssignBulkResult({ created: data.created.length, skipped: data.skipped });
                    toast(
                        data.skipped.length === 0
                            ? `${data.created.length} penugasan dibuat.`
                            : `${data.created.length} dibuat, ${data.skipped.length} di-skip.`,
                        data.skipped.length === 0 ? "success" : "warning"
                    );
                }
            }
            setAssignUnitIds([]);
            setAssignUnitQuery("");
            // Karyawan dipertahankan agar panel "Penugasan aktif" langsung memverifikasi hasil.
            setAssignStartsOn("");
            setAssignEndsOn("");
            setAssignProductId("");
            setAssignProductTools([]);
            await Promise.all([fetchAssignments(), fetchUnits()]);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        } finally {
            setSavingAssign(false);
        }
    }, [savingAssign, assignMode, assignUnitIds, assignCompany, assignProductTools, units, assignEmployee, assignStartsOn, assignEndsOn, toast, fetchAssignments, fetchUnits]);

    const assignableUnits = units.filter((u) => u.isActive && resolveDisplayCompanies(u).length > 0);
    const filteredAssignUnits = assignableUnits.filter((u) => {
        const q = assignUnitQuery.trim().toLowerCase();
        if (!q) return true;
        return `${u.name} ${u.brand ?? ""} ${u.location ?? ""} ${resolveDisplayCompanies(u).join(" ")}`.toLowerCase().includes(q);
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
        ? assignments.filter((a) => a.user.employeeId === assignEmployee.employeeId && isAssignmentActive(a))
        : [];

    if (!open) return null;

    return (
                <AccessibleModal ariaLabel="Buat Penugasan" onClose={() => onClose()}>
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">Penugasan Baru</h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                Hanya karyawan yang ditugaskan yang melihat modul Inspeksi Alat.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => onClose()}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Pilih alat tertentu, semua alat satu perusahaan, semua alat satu produk, atau semua unit
                            (global). Kosongkan tanggal mulai untuk berlaku hari ini.
                        </p>
                <div className="flex flex-wrap gap-1 mb-3 border-b border-border" role="tablist" aria-label="Mode penugasan">
                    {([["units", "Alat tertentu"], ["company", "Per Perusahaan"], ["product", "Per Produk"], ["global", "Semua unit"]] as const).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={assignMode === key}
                            onClick={() => setAssignMode(key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                assignMode === key
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {assignMode === "units" && (
                    <div className="mb-3">
                        <div className="mb-2">
                            <EquipmentSearchField
                                id="cari-alat-penugasan"
                                label="Cari alat untuk ditugaskan"
                                value={assignUnitQuery}
                                onChange={setAssignUnitQuery}
                                placeholder="Cari nama, merek, atau lokasi…"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const ids = filteredAssignUnits.map((u) => u.id);
                                    const allVisible = ids.length > 0 && ids.every((id) => assignUnitIds.includes(id));
                                    setAssignUnitIds((prev) =>
                                        allVisible ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
                                    );
                                }}
                                className="text-xs font-medium text-primary hover:underline min-h-[44px] px-2"
                            >
                                {(() => {
                                    const allVisible =
                                        filteredAssignUnits.length > 0 &&
                                        filteredAssignUnits.every((u) => assignUnitIds.includes(u.id));
                                    return allVisible ? "Batalkan hasil" : `Pilih hasil (${filteredAssignUnits.length})`;
                                })()}
                            </button>
                            <span className="text-xs text-muted-foreground" aria-live="polite">
                                {assignUnitIds.length} dipilih
                            </span>
                        </div>
                        {filteredAssignUnits.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {assignableUnits.length === 0
                                    ? "Belum ada alat aktif berkategori WIG/MKI."
                                    : "Tidak ada alat yang cocok dengan pencarian."}
                            </p>
                        ) : (
                            <ul className="space-y-1 max-h-[280px] overflow-y-auto">
                                {filteredAssignUnits.map((u) => (
                                    <li key={u.id}>
                                        <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/50 min-h-[48px]">
                                            <input
                                                type="checkbox"
                                                checked={assignUnitIds.includes(u.id)}
                                                onChange={(e) =>
                                                    setAssignUnitIds((prev) =>
                                                        e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                                                    )
                                                }
                                                className="rounded border-border shrink-0"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-medium truncate">{u.name}</span>
                                                <span className="block text-xs text-muted-foreground truncate">
                                                    {[u.brand, u.location].filter(Boolean).join(" · ") || "—"}
                                                </span>
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
                            <p className="text-xs text-muted-foreground mt-2">
                                Alat yang belum berkategori tidak tampil di sini — kategorikan dulu di tab Produk.
                            </p>
                        )}
                    </div>
                )}

                {assignMode === "company" && (
                    <div className="mb-3">
                        <div className="flex gap-1 mb-2 border-b border-border">
                            {(["WIG", "MKI"] as const).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setAssignCompany(c)}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                        assignCompany === c
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground" aria-live="polite">
                            {assignCompanyUnits.length} alat aktif {assignCompany} akan ditugaskan
                            (satu baris per alat).
                        </p>
                        {assignCompanyUnits.length > 0 && (
                            <ul className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
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
                    <div className="mb-3 space-y-2">
                        <div className="flex gap-1 border-b border-border">
                            {(["WIG", "MKI"] as const).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setAssignCompany(c)}
                                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                        assignCompany === c
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                        <div>
                            <label htmlFor="assign-product" className="text-xs font-medium">Produk {assignCompany}</label>
                            <select
                                id="assign-product"
                                value={assignProductId}
                                onChange={(e) => {
                                    setAssignProductId(e.target.value);
                                    if (e.target.value) void fetchAssignProductTools(e.target.value);
                                    else setAssignProductTools([]);
                                }}
                                disabled={assignProductsLoading}
                                className={`${inputClass} mt-1 disabled:opacity-50 min-h-[44px]`}
                            >
                                <option value="">{assignProductsLoading ? "Memuat…" : "Pilih produk"}</option>
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
                                        {assignProductChecked.length} alat terpetakan akan ditugaskan
                                        (satu baris per alat).
                                    </p>
                                    {assignProductChecked.length > 0 && (
                                        <ul className="space-y-1 max-h-[200px] overflow-y-auto">
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
                    <FeedbackMessage variant="info" className="mb-3">
                        Penugasan global mencakup semua unit aktif WIG dan MKI sekaligus, termasuk unit
                        yang dibuat kemudian.
                    </FeedbackMessage>
                )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <EmployeeSearchPicker
                                label="Karyawan"
                                value={assignEmployee}
                                onChange={setAssignEmployee}
                            />
                            <div>
                                <label htmlFor="assign-starts" className="text-xs font-medium">Mulai (opsional)</label>
                                <input
                                    id="assign-starts"
                                    type="date"
                                    value={assignStartsOn}
                                    onChange={(e) => setAssignStartsOn(e.target.value)}
                                    className={`${inputClass} mt-1 min-h-[44px]`}
                                />
                            </div>
                            <div>
                                <label htmlFor="assign-ends" className="text-xs font-medium">Selesai (opsional)</label>
                                <input
                                    id="assign-ends"
                                    type="date"
                                    value={assignEndsOn}
                                    onChange={(e) => setAssignEndsOn(e.target.value)}
                                    className={`${inputClass} mt-1 min-h-[44px]`}
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => void saveAssignment()}
                            disabled={savingAssign}
                            className="btn btn-primary mt-3 min-h-[48px]"
                        >
                            {savingAssign
                                ? "Menyimpan..."
                                : assignMode === "global"
                                  ? "Simpan Penugasan Global"
                                  : `Simpan ${assignPreviewCount} Penugasan`}
                        </button>
                        {assignBulkResult && (
                            <FeedbackMessage
                                variant={assignBulkResult.skipped.length === 0 ? "success" : "warning"}
                                className="mt-3"
                            >
                                {assignBulkResult.created} penugasan dibuat
                                {assignBulkResult.skipped.length > 0 && (
                                    <>
                                        {`, ${assignBulkResult.skipped.length} di-skip:`}
                                        <ul className="mt-1 list-disc pl-5">
                                            {assignBulkResult.skipped.slice(0, 5).map((s) => (
                                                <li key={s.unitName}>
                                                    {s.unitName} — {s.reason}
                                                </li>
                                            ))}
                                            {assignBulkResult.skipped.length > 5 && (
                                                <li>…dan {assignBulkResult.skipped.length - 5} lainnya.</li>
                                            )}
                                        </ul>
                                    </>
                                )}
                            </FeedbackMessage>
                        )}
                        {assignEmployee && (
                            <div className="mt-3 rounded-lg border border-border p-3">
                                <h3 className="text-sm font-medium mb-1">
                                    Penugasan aktif {assignEmployee.name} ({assignEmployee.employeeId})
                                </h3>
                                {assignEmployeeActive.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Belum ada penugasan aktif.</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {assignEmployeeActive.map((a) => (
                                            <li
                                                key={a.id}
                                                className="flex items-center justify-between gap-2 text-xs"
                                            >
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
                                                        · {a.startsOnWibDate}
                                                        {a.endsOnWibDate ? ` → ${a.endsOnWibDate}` : " → berjalan"}
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => onEndAssignment(a)}
                                                    className="shrink-0 text-rose-600 hover:underline min-h-[36px] px-1"
                                                >
                                                    Akhiri
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => onClose()}
                                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground min-h-[48px]"
                            >
                                Tutup
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

export function EditAssignmentModal({ assignment, units, fetchAssignments, fetchUnits, onClose }: EditAssignmentModalProps) {
    const toast = useToast();

    const [editIsGlobal, setEditIsGlobal] = useState(false);
    const [editUnitIds, setEditUnitIds] = useState<string[]>([]);
    const [editUnitQuery, setEditUnitQuery] = useState("");
    const [editEmployee, setEditEmployee] = useState<EmployeePick | null>(null);
    const [editStartsOn, setEditStartsOn] = useState("");
    const [editEndsOn, setEditEndsOn] = useState("");
    const [savingEdit, setSavingEdit] = useState(false);
    const [editBulkResult, setEditBulkResult] = useState<{ created: number; skipped: Array<{ unitName: string; reason: string }> } | null>(null);

    useEffect(() => {
        if (!assignment) return;
        setEditIsGlobal(!assignment.unitId);
        setEditUnitIds(assignment.unitId ? [assignment.unitId] : []);
        setEditUnitQuery("");
        setEditBulkResult(null);
        setEditEmployee(
            assignment.user.employeeId
                ? { employeeId: assignment.user.employeeId, name: assignment.user.displayName }
                : null
        );
        setEditStartsOn(assignment.startsOnWibDate);
        setEditEndsOn(assignment.endsOnWibDate ?? "");
        setSavingEdit(false);
    }, [assignment]);

    const saveEditAssignment = useCallback(async () => {
        if (!assignment || savingEdit) return;
        if (!editEmployee) {
            toast("Pilih karyawan terlebih dahulu.", "warning");
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
            // Baris ini memakai alat pertama; sisanya dibuatkan via bulk (karyawan + periode sama).
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
                toast("Baris ini diperbarui; alat tambahan semuanya di-skip.", "warning");
            } else {
                if (!bulkRes.ok) throw new Error(json.error ?? "Gagal menambah penugasan.");
                const data = json.data as { created: unknown[]; skipped: Array<{ unitName: string; reason: string }> };
                setEditBulkResult({ created: data.created.length, skipped: data.skipped });
                if (data.skipped.length === 0) {
                    toast(`Penugasan diperbarui + ${data.created.length} baris tambahan dibuat.`, "success");
                    onClose();
                } else {
                    toast(`Baris diperbarui; ${data.created.length} tambahan dibuat, ${data.skipped.length} di-skip.`, "warning");
                }
            }
            await Promise.all([fetchAssignments(), fetchUnits()]);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        } finally {
            setSavingEdit(false);
        }
    }, [assignment, savingEdit, editIsGlobal, editUnitIds, editEmployee, editStartsOn, editEndsOn, toast, fetchAssignments, fetchUnits, onClose]);

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
        return `${u.name} ${u.brand ?? ""} ${u.location ?? ""} ${resolveDisplayCompanies(u).join(" ")}`.toLowerCase().includes(q);
    });

    if (!assignment) return null;

    return (
                <AccessibleModal ariaLabel="Edit Penugasan" onClose={() => onClose()}>
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">Edit Penugasan</h2>
                            <p className="text-xs text-muted-foreground mt-1">
                                Centang satu alat untuk mengganti, atau beberapa alat sekaligus — baris ini
                                memakai alat pertama, sisanya jadi baris penugasan baru.
                            </p>
                        </div>
                        <button type="button" className="modal-close" onClick={() => onClose()} aria-label="Tutup modal">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                                <input
                                    type="checkbox"
                                    checked={editIsGlobal}
                                    onChange={(e) => {
                                        setEditIsGlobal(e.target.checked);
                                        if (e.target.checked) setEditUnitIds([]);
                                    }}
                                    className="rounded border-border"
                                />
                                Semua unit (global)
                            </label>
                            {!editIsGlobal && (
                                <>
                                    <EquipmentSearchField
                                        id="cari-alat-edit-penugasan"
                                        label="Cari alat"
                                        value={editUnitQuery}
                                        onChange={setEditUnitQuery}
                                        placeholder="Cari nama, merek, atau lokasi…"
                                    />
                                    <div className="flex flex-wrap items-center gap-2 mt-1 mb-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const ids = filteredEditUnits.map((u) => u.id);
                                                const allVisible = ids.length > 0 && ids.every((id) => editUnitIds.includes(id));
                                                setEditUnitIds((prev) =>
                                                    allVisible ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
                                                );
                                            }}
                                            className="text-xs font-medium text-primary hover:underline min-h-[44px] px-2"
                                        >
                                            {filteredEditUnits.length > 0 &&
                                            filteredEditUnits.every((u) => editUnitIds.includes(u.id))
                                                ? "Batalkan hasil"
                                                : `Pilih hasil (${filteredEditUnits.length})`}
                                        </button>
                                        <span className="text-xs text-muted-foreground" aria-live="polite">
                                            {editUnitIds.length} dipilih
                                        </span>
                                    </div>
                                    {filteredEditUnits.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            Tidak ada alat yang cocok dengan pencarian.
                                        </p>
                                    ) : (
                                        <ul className="space-y-1 max-h-[240px] overflow-y-auto">
                                            {filteredEditUnits.map((u) => (
                                                <li key={u.id}>
                                                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/50 min-h-[48px]">
                                                        <input
                                                            type="checkbox"
                                                            checked={editUnitIds.includes(u.id)}
                                                            onChange={(e) =>
                                                                setEditUnitIds((prev) =>
                                                                    e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                                                                )
                                                            }
                                                            className="rounded border-border shrink-0"
                                                        />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block text-sm font-medium truncate">{u.name}</span>
                                                            <span className="block text-xs text-muted-foreground truncate">
                                                                {[u.brand, u.location].filter(Boolean).join(" · ") || "—"}
                                                            </span>
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
                        <EmployeeSearchPicker
                            label="Karyawan"
                            value={editEmployee}
                            onChange={setEditEmployee}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="edit-assign-starts" className="text-xs font-medium">Mulai</label>
                                <input
                                    id="edit-assign-starts"
                                    type="date"
                                    value={editStartsOn}
                                    onChange={(e) => setEditStartsOn(e.target.value)}
                                    className={`${inputClass} mt-1 min-h-[44px]`}
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-assign-ends" className="text-xs font-medium">Selesai (opsional)</label>
                                <input
                                    id="edit-assign-ends"
                                    type="date"
                                    value={editEndsOn}
                                    onChange={(e) => setEditEndsOn(e.target.value)}
                                    className={`${inputClass} mt-1 min-h-[44px]`}
                                />
                            </div>
                        </div>
                        {editBulkResult && editBulkResult.skipped.length > 0 && (
                            <FeedbackMessage variant="warning">
                                {editBulkResult.created} baris tambahan dibuat, {editBulkResult.skipped.length} di-skip:
                                <ul className="mt-1 list-disc pl-5">
                                    {editBulkResult.skipped.slice(0, 5).map((s) => (
                                        <li key={s.unitName}>
                                            {s.unitName} — {s.reason}
                                        </li>
                                    ))}
                                    {editBulkResult.skipped.length > 5 && (
                                        <li>…dan {editBulkResult.skipped.length - 5} lainnya.</li>
                                    )}
                                </ul>
                            </FeedbackMessage>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void saveEditAssignment()}
                                disabled={savingEdit}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[48px]"
                            >
                                {savingEdit ? "Menyimpan..." : !editIsGlobal && editUnitIds.length > 1 ? `Simpan (1 diubah + ${editUnitIds.length - 1} baru)` : "Simpan Perubahan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => onClose()}
                                className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground min-h-[48px]"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
    );
}
