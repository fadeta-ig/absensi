"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentCompanyBadge, resolveDisplayCompanies } from "@/components/equipment/EquipmentStatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inputClass } from "@/components/equipment/settings/useSettingsData";
import type {
    EquipmentTemplate,
    EquipmentUnit,
} from "@/components/equipment/settings/useSettingsData";

type UnitCompanyFilter = "SEMUA" | "WIG" | "MKI" | "BOTH" | "TANPA";

interface UnitsTabProps {
    units: EquipmentUnit[];
    templates: EquipmentTemplate[];
    fetchUnits: () => Promise<void>;
    fetchTemplates: () => Promise<void>;
}

export default function UnitsTab({ units, templates, fetchUnits, fetchTemplates }: UnitsTabProps) {
    const toast = useToast();

    const [showUnitModal, setShowUnitModal] = useState(false);
    const [editingUnit, setEditingUnit] = useState<EquipmentUnit | null>(null);
    const [unitName, setUnitName] = useState("");
    const [unitBrand, setUnitBrand] = useState("");
    const [unitLocation, setUnitLocation] = useState("");
    const [unitTemplateId, setUnitTemplateId] = useState("");
    const [savingUnit, setSavingUnit] = useState(false);
    const [unitCompanies, setUnitCompanies] = useState<Array<"WIG" | "MKI">>([]);

    const [unitQuery, setUnitQuery] = useState("");
    const [unitCompanyFilter, setUnitCompanyFilter] = useState<UnitCompanyFilter>("SEMUA");

    const filterCounts = useMemo(() => {
        let wig = 0;
        let mki = 0;
        let both = 0;
        let tanpa = 0;
        for (const u of units) {
            const comps = resolveDisplayCompanies(u);
            if (comps.includes("WIG")) wig++;
            if (comps.includes("MKI")) mki++;
            if (comps.length >= 2) both++;
            if (comps.length === 0) tanpa++;
        }
        return { SEMUA: units.length, WIG: wig, MKI: mki, BOTH: both, TANPA: tanpa };
    }, [units]);

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
            return `${u.name} ${u.brand ?? ""} ${u.location ?? ""} ${comps.join(" ")} ${u.template.name ?? ""}`
                .toLowerCase()
                .includes(q);
        });
    }, [units, unitQuery, unitCompanyFilter]);

    const {
        currentPage: unitPage,
        pageSize: unitPageSize,
        setPage: setUnitPage,
        setPageSize: setUnitPageSize,
        resetPage: resetUnitPage,
        getSliceIndices: getUnitSlice,
    } = useTablePagination({
        storageKey: "ga-equipment-units",
        defaultPageSize: 10,
        totalItems: filteredUnits.length,
    });

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
            toast(isEdit ? "Unit diperbarui." : "Unit ditambahkan.", "success");
            setShowUnitModal(false);
            setEditingUnit(null);
            await Promise.all([fetchUnits(), fetchTemplates()]);
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal menyimpan unit. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
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
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status unit."));
                toast(unit.isActive ? "Unit dinonaktifkan." : "Unit diaktifkan.", "success");
                await Promise.all([fetchUnits(), fetchTemplates()]);
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal mengubah status unit. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [toast, fetchUnits, fetchTemplates]
    );

    const activeTemplates = templates.filter((t) => t.isActive);
    const [unitSliceStart, unitSliceEnd] = getUnitSlice(filteredUnits.length);
    const paginatedUnits = filteredUnits.slice(unitSliceStart, unitSliceEnd);
    const unitTotalPages = Math.max(1, Math.ceil(filteredUnits.length / unitPageSize));

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Master unit alat beserta merek, lokasi, template checklist, dan perusahaan pemiliknya.
                </p>
                <button
                    type="button"
                    onClick={() => openUnitModal()}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0 min-h-[42px]"
                >
                    <Plus className="h-4 w-4" />
                    Tambah Unit
                </button>
            </div>

            {activeTemplates.length === 0 && (
                <FeedbackMessage variant="warning">
                    Belum ada template aktif. Buat template terlebih dahulu di tab Template.
                </FeedbackMessage>
            )}

            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                        <EquipmentSearchField
                            id="cari-unit"
                            label="Cari unit alat"
                            value={unitQuery}
                            onChange={(v) => {
                                setUnitQuery(v);
                                resetUnitPage();
                            }}
                            placeholder="Cari nama alat, merek, lokasi, atau template..."
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter perusahaan unit">
                        {(
                            [
                                ["SEMUA", "Semua"],
                                ["WIG", "WIG"],
                                ["MKI", "MKI"],
                                ["BOTH", "WIG & MKI"],
                                ["TANPA", "Belum dikategorikan"],
                            ] as const
                        ).map(([key, label]) => {
                            const active = unitCompanyFilter === key;
                            const count = filterCounts[key];
                            if (key === "TANPA" && count === 0 && !active) return null;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => {
                                        setUnitCompanyFilter(key);
                                        resetUnitPage();
                                    }}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors min-h-[34px] ${
                                        active
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <span>{label}</span>
                                    <span className="text-[11px] opacity-80">{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="border border-border rounded-lg overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Unit Alat</TableHead>
                                <TableHead>Template</TableHead>
                                <TableHead>Perusahaan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedUnits.map((unit) => {
                                const comps = resolveDisplayCompanies(unit);
                                const meta = [unit.brand, unit.location].filter(Boolean).join(" · ");
                                return (
                                    <TableRow key={unit.id} className={!unit.isActive ? "opacity-65" : undefined}>
                                        <TableCell>
                                            <p className="font-medium text-foreground text-sm">{unit.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {meta ? `${meta} · ` : ""}
                                                {unit._count.assignments} penugasan · {unit._count.inspections} inspeksi
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {unit.template.name}
                                        </TableCell>
                                        <TableCell>
                                            {comps.length > 0 ? (
                                                <EquipmentCompanyBadge
                                                    company={unit.company}
                                                    isSharedBoth={unit.isSharedBoth}
                                                    companies={unit.companies}
                                                />
                                            ) : (
                                                <span className="text-xs text-amber-700 dark:text-amber-300">
                                                    Belum diatur
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                                    unit.isActive
                                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                        : "bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {unit.isActive ? "Aktif" : "Nonaktif"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openUnitModal(unit)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px]"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                    Ubah
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void toggleUnitActive(unit)}
                                                    className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[36px]"
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
                </div>

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
                <AccessibleModal
                    ariaLabel={editingUnit ? "Ubah Unit Alat" : "Tambah Unit Alat"}
                    onClose={() => setShowUnitModal(false)}
                >
                    <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                        <h2 className="modal-title">{editingUnit ? "Ubah Unit Alat" : "Unit Alat Baru"}</h2>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setShowUnitModal(false)}
                            aria-label="Tutup jendela"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3.5">
                        <div>
                            <label htmlFor="unit-name" className="text-xs font-medium">
                                Nama alat *
                            </label>
                            <input
                                id="unit-name"
                                type="text"
                                value={unitName}
                                onChange={(e) => setUnitName(e.target.value)}
                                placeholder="Contoh: Mixer 50L"
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="unit-brand" className="text-xs font-medium">
                                    Merek (opsional)
                                </label>
                                <input
                                    id="unit-brand"
                                    type="text"
                                    value={unitBrand}
                                    onChange={(e) => setUnitBrand(e.target.value)}
                                    placeholder="Merek alat"
                                    className={`${inputClass} mt-1`}
                                />
                            </div>
                            <div>
                                <label htmlFor="unit-location" className="text-xs font-medium">
                                    Lokasi (opsional)
                                </label>
                                <input
                                    id="unit-location"
                                    type="text"
                                    value={unitLocation}
                                    onChange={(e) => setUnitLocation(e.target.value)}
                                    placeholder="Ruang produksi"
                                    className={`${inputClass} mt-1`}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium">Perusahaan (bisa pilih 1 atau keduanya)</span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setUnitCompanies((prev) => (prev.length === 2 ? [] : ["WIG", "MKI"]))
                                    }
                                    className="text-[11px] font-medium text-primary hover:underline"
                                >
                                    {unitCompanies.length === 2 ? "Kosongkan" : "Pilih WIG & MKI"}
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
                                            <span>{c}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="unit-tpl" className="text-xs font-medium">
                                Template checklist *
                            </label>
                            <select
                                id="unit-tpl"
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
                        <div className="flex justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setShowUnitModal(false)}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[42px]"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveUnit()}
                                disabled={savingUnit}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                            >
                                {savingUnit ? "Menyimpan..." : "Simpan"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
