"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentCompanyBadge, resolveDisplayCompanies } from "@/components/equipment/EquipmentStatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inputClass } from "@/app/ga/equipment/settings/_components/useSettingsData";
import type {
    EquipmentTemplate,
    EquipmentUnit,
} from "@/app/ga/equipment/settings/_components/useSettingsData";

type UnitCompanyFilter = "SEMUA" | "WIG" | "MKI" | "BOTH" | "TANPA";

interface UnitsTabProps {
    units: EquipmentUnit[];
    templates: EquipmentTemplate[];
    fetchUnits: () => Promise<void>;
    fetchTemplates: () => Promise<void>;
}

export default function UnitsTab({ units, templates, fetchUnits, fetchTemplates }: UnitsTabProps) {
    const toast = useToast();

    // ─── Unit form (modal) ───
    const [showUnitModal, setShowUnitModal] = useState(false);
    const [editingUnit, setEditingUnit] = useState<EquipmentUnit | null>(null);
    const [unitName, setUnitName] = useState("");
    const [unitBrand, setUnitBrand] = useState("");
    const [unitLocation, setUnitLocation] = useState("");
    const [unitTemplateId, setUnitTemplateId] = useState("");
    const [savingUnit, setSavingUnit] = useState(false);

    // ─── Kategori perusahaan unit (modal unit: multi-pilih WIG / MKI / keduanya) ───
    const [unitCompanies, setUnitCompanies] = useState<Array<"WIG" | "MKI">>([]);

    // ─── Filter & pagination client (tanpa query server) ───
    const [unitQuery, setUnitQuery] = useState("");
    const [unitCompanyFilter, setUnitCompanyFilter] = useState<UnitCompanyFilter>("SEMUA");

    const filteredUnits = useMemo(() => {
        const q = unitQuery.trim().toLowerCase();
        return units.filter((u) => {
            const comps = resolveDisplayCompanies(u);
            if (unitCompanyFilter === "WIG" || unitCompanyFilter === "MKI") {
                if (!comps.includes(unitCompanyFilter)) return false;
            } else if (unitCompanyFilter === "BOTH") {
                if (comps.length < 2) return false;
            } else if (unitCompanyFilter === "TANPA") {
                if (comps.length > 0) return false;
            }
            if (!q) return true;
            return `${u.name} ${u.brand ?? ""} ${u.location ?? ""} ${comps.join(" ")} ${u.template.name ?? ""}`.toLowerCase().includes(q);
        });
    }, [units, unitQuery, unitCompanyFilter]);

    const {
        currentPage: unitPage,
        pageSize: unitPageSize,
        setPage: setUnitPage,
        setPageSize: setUnitPageSize,
        resetPage: resetUnitPage,
        getSliceIndices: getUnitSlice,
    } = useTablePagination({ storageKey: "ga-equipment-units", defaultPageSize: 10, totalItems: filteredUnits.length });

    // ─── Unit CRUD ───

    const openUnitModal = useCallback(
        (unit?: EquipmentUnit) => {
            setEditingUnit(unit ?? null);
            setUnitName(unit?.name ?? "");
            setUnitBrand(unit?.brand ?? "");
            setUnitLocation(unit?.location ?? "");
            setUnitTemplateId(unit?.templateId ?? templates.find((t) => t.isActive)?.id ?? "");
            setUnitCompanies(unit ? resolveDisplayCompanies(unit) : []);
            setShowUnitModal(true);
        },
        [templates]
    );

    const toggleModalCompany = useCallback((c: "WIG" | "MKI") => {
        setUnitCompanies((prev) =>
            prev.includes(c)
                ? prev.filter((item) => item !== c)
                : (["WIG", "MKI"] as const).filter((item) => item === c || prev.includes(item))
        );
    }, []);

    const saveUnit = useCallback(async () => {
        if (savingUnit || !unitName.trim() || !unitTemplateId) {
            if (!unitName.trim() || !unitTemplateId) toast("Nama alat dan template wajib diisi.", "warning");
            return;
        }
        setSavingUnit(true);
        try {
            const isEdit = !!editingUnit;
            const payload: Record<string, unknown> = isEdit
                ? {
                      id: editingUnit.id,
                      name: unitName.trim(),
                      brand: unitBrand.trim() || null,
                      location: unitLocation.trim() || null,
                      templateId: unitTemplateId,
                      companies: unitCompanies,
                  }
                : {
                      name: unitName.trim(),
                      brand: unitBrand.trim() || null,
                      location: unitLocation.trim() || null,
                      templateId: unitTemplateId,
                      companies: unitCompanies,
                  };
            const res = await fetch("/api/ga/equipment/units", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan unit."));
            toast(isEdit ? "Unit diperbarui." : "Unit dibuat.", "success");
            setShowUnitModal(false);
            setEditingUnit(null);
            await Promise.all([fetchUnits(), fetchTemplates()]);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("EquipmentSettings", "Unit save failed", err);
        } finally {
            setSavingUnit(false);
        }
    }, [savingUnit, unitName, unitTemplateId, unitBrand, unitLocation, unitCompanies, editingUnit, toast, fetchUnits, fetchTemplates]);

    const toggleUnitActive = useCallback(
        async (unit: EquipmentUnit) => {
            try {
                const res = await fetch("/api/ga/equipment/units", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: unit.id, isActive: !unit.isActive }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status."));
                toast(unit.isActive ? "Unit dinonaktifkan." : "Unit diaktifkan.", "success");
                await Promise.all([fetchUnits(), fetchTemplates()]);
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal mengubah status.", "error");
            }
        },
        [toast, fetchUnits, fetchTemplates]
    );

    const activeTemplates = templates.filter((t) => t.isActive);
    const [unitSliceStart, unitSliceEnd] = getUnitSlice(filteredUnits.length);
    const paginatedUnits = filteredUnits.slice(unitSliceStart, unitSliceEnd);
    const unitTotalPages = Math.max(1, Math.ceil(filteredUnits.length / unitPageSize));

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Unit Alat</h2>
                <button
                    onClick={() => openUnitModal()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                >
                    <Plus className="h-4 w-4" /> Tambah
                </button>
            </div>

            {activeTemplates.length === 0 && (
                <FeedbackMessage variant="warning" className="mb-4">
                    Belum ada template aktif. Buat template di tab Template &amp; Item terlebih dahulu.
                </FeedbackMessage>
            )}

            <div className="mb-3">
                <EquipmentSearchField
                    id="cari-unit"
                    label="Cari unit alat"
                    value={unitQuery}
                    onChange={(v) => {
                        setUnitQuery(v);
                        resetUnitPage();
                    }}
                    placeholder="Cari nama, merek, lokasi, template…"
                />
            </div>
            <div className="flex flex-wrap gap-1 mb-3 border-b border-border">
                {(["SEMUA", "WIG", "MKI", "BOTH", "TANPA"] as const).map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => {
                            setUnitCompanyFilter(c);
                            resetUnitPage();
                        }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                            unitCompanyFilter === c
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {c === "SEMUA"
                            ? "Semua"
                            : c === "BOTH"
                              ? "WIG & MKI"
                              : c === "TANPA"
                                ? "Belum dikategorikan"
                                : c}
                    </button>
                ))}
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Template</TableHead>
                            <TableHead>Perusahaan</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedUnits.map((unit) => {
                            const comps = resolveDisplayCompanies(unit);
                            return (
                            <TableRow key={unit.id}>
                                <TableCell>
                                    <p className="font-medium text-foreground">{unit.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {[unit.brand, unit.location].filter(Boolean).join(" · ") || "—"}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {unit._count.assignments} penugasan · {unit._count.inspections} inspeksi
                                    </p>
                                </TableCell>
                                <TableCell>{unit.template.name}</TableCell>
                                <TableCell>
                                    {comps.length > 0 ? (
                                        <EquipmentCompanyBadge
                                            company={unit.company}
                                            isSharedBoth={unit.isSharedBoth}
                                            companies={unit.companies}
                                        />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <span
                                        className={`text-xs px-1.5 py-0.5 rounded ${unit.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
                                    >
                                        {unit.isActive ? "Aktif" : "Nonaktif"}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => openUnitModal(unit)}
                                            className="p-1 text-muted-foreground hover:text-foreground"
                                            title="Edit unit"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => void toggleUnitActive(unit)}
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            {unit.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                    </div>
                                </TableCell>
                            </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                {units.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 text-sm">Belum ada unit alat.</p>
                )}
                {units.length > 0 && filteredUnits.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 text-sm">
                        Tidak ada unit yang cocok dengan pencarian.
                    </p>
                )}
                <DataTablePagination
                    currentPage={unitPage}
                    totalPages={unitTotalPages}
                    totalItems={filteredUnits.length}
                    pageSize={unitPageSize}
                    onPageChange={setUnitPage}
                    onPageSizeChange={setUnitPageSize}
                    itemLabel="unit"
                />
            </div>

            {showUnitModal && (
                <AccessibleModal ariaLabel={editingUnit ? "Edit Unit Alat" : "Tambah Unit Alat"} onClose={() => setShowUnitModal(false)}>
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">{editingUnit ? "Edit Unit Alat" : "Unit Alat Baru"}</h2>
                        </div>
                        <button type="button" className="modal-close" onClick={() => setShowUnitModal(false)} aria-label="Tutup modal">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium">Nama alat</label>
                            <input
                                type="text"
                                value={unitName}
                                onChange={(e) => setUnitName(e.target.value)}
                                placeholder="Nama alat"
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium">Merek (opsional)</label>
                                <input
                                    type="text"
                                    value={unitBrand}
                                    onChange={(e) => setUnitBrand(e.target.value)}
                                    placeholder="Merek"
                                    className={`${inputClass} mt-1`}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium">Lokasi (opsional)</label>
                                <input
                                    type="text"
                                    value={unitLocation}
                                    onChange={(e) => setUnitLocation(e.target.value)}
                                    placeholder="Lokasi"
                                    className={`${inputClass} mt-1`}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs font-medium">Perusahaan (bisa pilih 1 atau keduanya)</label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setUnitCompanies((prev) => (prev.length === 2 ? [] : ["WIG", "MKI"]))
                                    }
                                    className="text-[11px] font-medium text-primary hover:underline"
                                >
                                    {unitCompanies.length === 2 ? "Kosongkan pilihan" : "Pilih WIG & MKI"}
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-1.5">
                                {(["WIG", "MKI"] as const).map((c) => {
                                    const checked = unitCompanies.includes(c);
                                    return (
                                        <label
                                            key={c}
                                            className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                                                checked
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border hover:bg-accent/50"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleModalCompany(c)}
                                                className="rounded border-border"
                                            />
                                            <span>Perusahaan {c}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                                {unitCompanies.length === 2
                                    ? "Alat ini dapat dipetakan dan dipakai oleh produk di WIG maupun MKI."
                                    : unitCompanies.length === 1
                                      ? `Alat ini terdaftar untuk perusahaan ${unitCompanies[0]}.`
                                      : "Belum dikategorikan ke perusahaan."}
                            </p>
                        </div>
                        <div>
                            <label className="text-xs font-medium">Template</label>
                            <select
                                value={unitTemplateId}
                                onChange={(e) => setUnitTemplateId(e.target.value)}
                                className={`${inputClass} mt-1`}
                            >
                                <option value="">Pilih template</option>
                                {activeTemplates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void saveUnit()}
                                disabled={savingUnit}
                                className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {savingUnit ? "Menyimpan..." : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowUnitModal(false)}
                                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
