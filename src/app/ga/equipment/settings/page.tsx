"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, ChevronDown, ChevronRight, Loader2, AlertTriangle, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmployeeSearchPicker, { type EmployeePick } from "@/components/equipment/EmployeeSearchPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TemplateItem {
    id: string;
    name: string;
    sortOrder: number;
    requirePhoto: boolean;
    isActive: boolean;
}

interface EquipmentTemplate {
    id: string;
    name: string;
    isActive: boolean;
    items: TemplateItem[];
    _count: { units: number };
}

interface EquipmentUnit {
    id: string;
    name: string;
    brand: string | null;
    location: string | null;
    isActive: boolean;
    templateId: string;
    template: { id: string; name: string };
    _count: { assignments: number; inspections: number };
}

interface QcMember {
    employeeId: string;
    name: string;
    isActive: boolean;
    email?: string | null;
}

interface TopViewer {
    employeeId: string;
    name: string;
    isActive: boolean;
    email?: string | null;
}

interface EquipmentAssignment {
    id: string;
    unitId: string | null;
    startsOnWibDate: string;
    endsOnWibDate: string | null;
    unit: { id: string; name: string } | null;
    user: { id: string; employeeId: string | null; displayName: string };
}

type Tab = "templates" | "units" | "assignments" | "atasan";

const inputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm";

export default function EquipmentSettingsPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState<Tab>("templates");
    const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
    const [units, setUnits] = useState<EquipmentUnit[]>([]);
    const [qcMembers, setQcMembers] = useState<QcMember[]>([]);
    const [qcError, setQcError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ─── Template form ───
    const [showTemplateForm, setShowTemplateForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<EquipmentTemplate | null>(null);
    const [templateName, setTemplateName] = useState("");
    const [savingTemplate, setSavingTemplate] = useState(false);

    // ─── Item form ───
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
    const [showItemForm, setShowItemForm] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
    const [itemName, setItemName] = useState("");
    const [itemRequirePhoto, setItemRequirePhoto] = useState(true);
    const [savingItem, setSavingItem] = useState(false);

    // ─── Unit form (modal) ───
    const [showUnitModal, setShowUnitModal] = useState(false);
    const [editingUnit, setEditingUnit] = useState<EquipmentUnit | null>(null);
    const [unitName, setUnitName] = useState("");
    const [unitBrand, setUnitBrand] = useState("");
    const [unitLocation, setUnitLocation] = useState("");
    const [unitTemplateId, setUnitTemplateId] = useState("");
    const [savingUnit, setSavingUnit] = useState(false);

    // ─── Assignment form (WIG002 menentukan siapa dapat modul Inspeksi Alat) ───
    const [assignUnitId, setAssignUnitId] = useState("");
    const [assignAllUnits, setAssignAllUnits] = useState(false);
    const [assignEmployee, setAssignEmployee] = useState<EmployeePick | null>(null);
    const [assignStartsOn, setAssignStartsOn] = useState("");
    const [assignEndsOn, setAssignEndsOn] = useState("");
    const [savingAssign, setSavingAssign] = useState(false);
    const [assignments, setAssignments] = useState<EquipmentAssignment[]>([]);

    // ─── Anggota QC ───
    const [newQc, setNewQc] = useState<EmployeePick | null>(null);
    const [savingQc, setSavingQc] = useState(false);

    // ─── Top reviewer (atasan global) ───
    const [topViewers, setTopViewers] = useState<TopViewer[]>([]);
    const [topViewerError, setTopViewerError] = useState<string | null>(null);
    const [newTopViewer, setNewTopViewer] = useState<EmployeePick | null>(null);
    const [savingTopViewers, setSavingTopViewers] = useState(false);

    // ─── Approver final (satu atasan lapangan) ───
    const [approver, setApprover] = useState<{ employeeId: string; name: string | null; isActive: boolean } | null>(null);
    const [approverError, setApproverError] = useState<string | null>(null);
    const [newApprover, setNewApprover] = useState<EmployeePick | null>(null);
    const [savingApprover, setSavingApprover] = useState(false);

    const fetchTopViewers = useCallback(async () => {
        setTopViewerError(null);
        try {
            const res = await fetch("/api/ga/equipment/settings/top-viewers");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat top reviewer."));
            const json = await res.json();
            setTopViewers(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat top reviewer.";
            setTopViewerError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchQcMembers = useCallback(async () => {        setQcError(null);
        try {
            const res = await fetch("/api/ga/equipment/qc-members");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat anggota QC."));
            const json = await res.json();
            setQcMembers(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat anggota QC.";
            setQcError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchApprover = useCallback(async () => {
        setApproverError(null);
        try {
            const res = await fetch("/api/ga/equipment/settings/approver");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat approver."));
            const json = await res.json();
            setApprover(json.data ?? null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat approver.";
            setApproverError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const saveApprover = useCallback(async () => {
        if (!newApprover) {
            toast("Cari dan pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        setSavingApprover(true);
        try {
            const res = await fetch("/api/ga/equipment/settings/approver", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: newApprover.employeeId }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan approver."));
            toast("Approver ditetapkan.", "success");
            setNewApprover(null);
            await fetchApprover();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("EquipmentSettings", "Approver save failed", err);
        } finally {
            setSavingApprover(false);
        }
    }, [newApprover, toast, fetchApprover]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tplRes, unitRes, assignRes] = await Promise.all([
                fetch("/api/ga/equipment/templates"),
                fetch("/api/ga/equipment/units"),
                fetch("/api/ga/equipment/assignments"),
            ]);
            if (!tplRes.ok) throw new Error(await getResponseErrorMessage(tplRes, "Gagal memuat template."));
            if (!unitRes.ok) throw new Error(await getResponseErrorMessage(unitRes, "Gagal memuat unit alat."));
            if (!assignRes.ok) throw new Error(await getResponseErrorMessage(assignRes, "Gagal memuat penugasan."));
            const [tplJson, unitJson, assignJson] = await Promise.all([tplRes.json(), unitRes.json(), assignRes.json()]);
            setTemplates(tplJson.data ?? []);
            setUnits(unitJson.data ?? []);
            setAssignments(assignJson.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            setError(msg);
            reportClientError("EquipmentSettings", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAll();
        void fetchTopViewers();
        void fetchQcMembers();
        void fetchApprover();
    }, [fetchAll, fetchTopViewers, fetchQcMembers, fetchApprover]);

    // ─── Template CRUD ───

    const saveTemplate = useCallback(async () => {
        if (savingTemplate || !templateName.trim()) return;
        setSavingTemplate(true);
        try {
            const isEdit = !!editingTemplate;
            const res = await fetch("/api/ga/equipment/templates", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isEdit ? { id: editingTemplate.id, name: templateName.trim() } : { name: templateName.trim() }
                ),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan template."));
            toast(isEdit ? "Template diperbarui." : "Template dibuat.", "success");
            setShowTemplateForm(false);
            setEditingTemplate(null);
            setTemplateName("");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("EquipmentSettings", "Template save failed", err);
        } finally {
            setSavingTemplate(false);
        }
    }, [savingTemplate, templateName, editingTemplate, toast, fetchAll]);

    const toggleTemplateActive = useCallback(
        async (tpl: EquipmentTemplate) => {
            try {
                const res = await fetch("/api/ga/equipment/templates", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: tpl.id, isActive: !tpl.isActive }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status."));
                toast(tpl.isActive ? "Template dinonaktifkan." : "Template diaktifkan.", "success");
                await fetchAll();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal mengubah status.", "error");
            }
        },
        [toast, fetchAll]
    );

    // ─── Item CRUD ───

    const openItemForm = useCallback((templateId: string, item?: TemplateItem) => {
        setShowItemForm(templateId);
        setEditingItem(item ?? null);
        setItemName(item?.name ?? "");
        setItemRequirePhoto(item?.requirePhoto ?? true);
    }, []);

    const saveItem = useCallback(
        async (templateId: string) => {
            if (savingItem || !itemName.trim()) return;
            setSavingItem(true);
            try {
                if (editingItem) {
                    const res = await fetch("/api/ga/equipment/template-items", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: editingItem.id, name: itemName.trim(), requirePhoto: itemRequirePhoto }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui item."));
                    toast("Item diperbarui.", "success");
                } else {
                    const res = await fetch("/api/ga/equipment/template-items", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ templateId, name: itemName.trim(), requirePhoto: itemRequirePhoto }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menambah item."));
                    toast("Item ditambahkan.", "success");
                }
                setShowItemForm(null);
                setEditingItem(null);
                setItemName("");
                setItemRequirePhoto(true);
                await fetchAll();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal menyimpan item.", "error");
            } finally {
                setSavingItem(false);
            }
        },
        [savingItem, itemName, itemRequirePhoto, editingItem, toast, fetchAll]
    );

    const toggleItemActive = useCallback(
        async (item: TemplateItem) => {
            try {
                const res = await fetch("/api/ga/equipment/template-items", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status item."));
                toast(item.isActive ? "Item dinonaktifkan." : "Item diaktifkan.", "success");
                await fetchAll();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal.", "error");
            }
        },
        [toast, fetchAll]
    );

    const deleteItem = useCallback(
        (item: TemplateItem) => {
            confirm({
                title: `Hapus item "${item.name}"?`,
                message: "Item yang dihapus tidak bisa dikembalikan. Riwayat inspeksi lama tetap tersimpan sebagai snapshot.",
                confirmLabel: "Ya, hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void (async () => {
                        try {
                            const res = await fetch(
                                `/api/ga/equipment/template-items?id=${encodeURIComponent(item.id)}`,
                                { method: "DELETE" }
                            );
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus item."));
                            toast("Item dihapus.", "success");
                            await fetchAll();
                        } catch (err) {
                            toast(err instanceof Error ? err.message : "Gagal menghapus.", "error");
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchAll]
    );

    // ─── Unit CRUD ───

    const openUnitModal = useCallback(
        (unit?: EquipmentUnit) => {
            setEditingUnit(unit ?? null);
            setUnitName(unit?.name ?? "");
            setUnitBrand(unit?.brand ?? "");
            setUnitLocation(unit?.location ?? "");
            setUnitTemplateId(unit?.templateId ?? templates.find((t) => t.isActive)?.id ?? "");
            setShowUnitModal(true);
        },
        [templates]
    );

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
                  }
                : {
                      name: unitName.trim(),
                      brand: unitBrand.trim() || null,
                      location: unitLocation.trim() || null,
                      templateId: unitTemplateId,
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
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("EquipmentSettings", "Unit save failed", err);
        } finally {
            setSavingUnit(false);
        }
    }, [savingUnit, unitName, unitTemplateId, unitBrand, unitLocation, editingUnit, toast, fetchAll]);

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
                await fetchAll();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal mengubah status.", "error");
            }
        },
        [toast, fetchAll]
    );

    // ─── Assignment (siapa dapat modul Inspeksi Alat) ───

    const saveAssignment = useCallback(async () => {
        if (savingAssign || (!assignAllUnits && !assignUnitId) || !assignEmployee) {
            if ((!assignAllUnits && !assignUnitId) || !assignEmployee)
                toast("Pilih unit (atau centang Semua unit) dan pilih karyawan.", "warning");
            return;
        }
        setSavingAssign(true);
        try {
            const res = await fetch("/api/ga/equipment/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unitId: assignAllUnits ? null : assignUnitId,
                    employeeId: assignEmployee.employeeId,
                    ...(assignStartsOn ? { startsOnWibDate: assignStartsOn } : {}),
                    ...(assignEndsOn ? { endsOnWibDate: assignEndsOn } : {}),
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan penugasan."));
            toast(assignAllUnits ? "Penugasan global dibuat (berlaku semua unit)." : "Penugasan dibuat.", "success");
            setAssignUnitId("");
            setAssignAllUnits(false);
            setAssignEmployee(null);
            setAssignStartsOn("");
            setAssignEndsOn("");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        } finally {
            setSavingAssign(false);
        }
    }, [savingAssign, assignAllUnits, assignUnitId, assignEmployee, assignStartsOn, assignEndsOn, toast, fetchAll]);

    const endAssignment = useCallback(
        (assignment: EquipmentAssignment) => {
            const who = assignment.user.displayName ?? assignment.user.employeeId ?? "karyawan";
            const scope = assignment.unit ? assignment.unit.name : "Semua unit";
            confirm({
                title: `Akhiri penugasan ${who}?`,
                message: `Penugasan ${scope} mulai ${assignment.startsOnWibDate} akan diakhiri hari ini.`,
                confirmLabel: "Ya, akhiri",
                cancelLabel: "Batal",
                variant: "warning",
                onConfirm: () => {
                    void (async () => {
                        try {
                            const res = await fetch("/api/ga/equipment/assignments", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ assignmentId: assignment.id }),
                            });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengakhiri penugasan."));
                            toast("Penugasan diakhiri.", "success");
                            await fetchAll();
                        } catch (err) {
                            toast(err instanceof Error ? err.message : "Gagal.", "error");
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchAll]
    );

    // ─── Anggota QC ───

    const persistQcMembers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingQc(true);
            try {
                const res = await fetch("/api/ga/equipment/qc-members", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan anggota QC."));
                toast(successMessage, "success");
                setNewQc(null);
                await fetchQcMembers();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
                reportClientError("EquipmentSettings", "Qc members save failed", err);
            } finally {
                setSavingQc(false);
            }
        },
        [toast, fetchQcMembers]
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
            toast("Anggota QC maksimal 20 orang.", "warning");
            return;
        }
        setNewQc(null);
        void persistQcMembers([...qcMembers.map((v) => v.employeeId), id], "Anggota QC ditambahkan.");
    }, [newQc, qcMembers, toast, persistQcMembers]);

    const removeQcMember = useCallback(
        (member: QcMember) => {
            confirm({
                title: `Hapus "${member.name}" dari QC?`,
                message: "Karyawan tersebut tidak lagi melihat antrean pemeriksaan QC.",
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
        [confirm, qcMembers, persistQcMembers]
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

    // ─── Render ───

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-destructive">{error}</p>
                    <button onClick={() => void fetchAll()} className="mt-3 text-sm text-primary hover:underline">
                        Coba lagi
                    </button>
                </div>
            </div>
        );
    }

    const activeTemplates = templates.filter((t) => t.isActive);

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Pengaturan Peralatan</h1>
            <p className="text-sm text-muted-foreground mb-6">
                Kelola template checklist, unit alat, penugasan, dan anggota QC.
            </p>

            <div className="flex gap-1 mb-6 border-b border-border">
                {([["templates", "Template & Item"], ["units", "Alat / Unit"], ["assignments", "Penugasan"], ["atasan", "Atasan"]] as [Tab, string][]).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === "templates" && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-medium">Template Checklist</h2>
                        <button
                            onClick={() => {
                                setShowTemplateForm(true);
                                setEditingTemplate(null);
                                setTemplateName("");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                        >
                            <Plus className="h-4 w-4" /> Tambah
                        </button>
                    </div>

                    {showTemplateForm && (
                        <div className="bg-card border border-border rounded-lg p-4 mb-4">
                            <h3 className="text-sm font-medium mb-2">{editingTemplate ? "Edit Template" : "Template Baru"}</h3>
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="Nama template"
                                className={inputClass}
                            />
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={() => void saveTemplate()}
                                    disabled={savingTemplate}
                                    className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {savingTemplate ? "Menyimpan..." : "Simpan"}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowTemplateForm(false);
                                        setEditingTemplate(null);
                                    }}
                                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        {templates.map((tpl) => (
                            <div key={tpl.id} className="bg-card border border-border rounded-lg">
                                <div className="flex items-center justify-between p-3">
                                    <button
                                        onClick={() => setExpandedTemplate(expandedTemplate === tpl.id ? null : tpl.id)}
                                        className="flex items-center gap-2 text-left flex-1"
                                    >
                                        {expandedTemplate === tpl.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        <span className="font-medium text-sm">{tpl.name}</span>
                                        <span
                                            className={`text-xs px-1.5 py-0.5 rounded ${tpl.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
                                        >
                                            {tpl.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {tpl._count.units} unit, {tpl.items.length} item
                                        </span>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => {
                                                setShowTemplateForm(true);
                                                setEditingTemplate(tpl);
                                                setTemplateName(tpl.name);
                                            }}
                                            className="p-1 text-muted-foreground hover:text-foreground"
                                            title="Edit"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => void toggleTemplateActive(tpl)}
                                            className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                                        >
                                            {tpl.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                    </div>
                                </div>

                                {expandedTemplate === tpl.id && (
                                    <div className="border-t border-border px-3 pb-3 pt-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-muted-foreground uppercase">Item</span>
                                            <button
                                                onClick={() => openItemForm(tpl.id)}
                                                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                            >
                                                <Plus className="h-3 w-3" /> Tambah Item
                                            </button>
                                        </div>

                                        {showItemForm === tpl.id && (
                                            <div className="bg-muted/30 border border-border rounded-md p-3 mb-2 space-y-2">
                                                <input
                                                    type="text"
                                                    value={itemName}
                                                    onChange={(e) => setItemName(e.target.value)}
                                                    placeholder="Nama item"
                                                    className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background"
                                                />
                                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={itemRequirePhoto}
                                                        onChange={(e) => setItemRequirePhoto(e.target.checked)}
                                                        className="rounded border-border"
                                                    />
                                                    Wajib foto bukti
                                                </label>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => void saveItem(tpl.id)}
                                                        disabled={savingItem}
                                                        className="px-2 py-1 text-xs font-medium text-primary-foreground bg-primary rounded hover:bg-primary/90"
                                                    >
                                                        {savingItem ? "..." : editingItem ? "Perbarui" : "Simpan"}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowItemForm(null);
                                                            setEditingItem(null);
                                                        }}
                                                        className="text-xs text-muted-foreground"
                                                    >
                                                        Batal
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {tpl.items.length === 0 ? (
                                            <p className="text-xs text-muted-foreground py-2">Belum ada item.</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {tpl.items.map((item, idx) => (
                                                    <div
                                                        key={item.id}
                                                        className="flex items-center justify-between py-1 px-2 text-sm rounded hover:bg-accent/50"
                                                    >
                                                        <span className={item.isActive ? "text-foreground" : "text-muted-foreground line-through"}>
                                                            {idx + 1}. {item.name}
                                                            {item.requirePhoto && (
                                                                <span className="ml-1.5 text-[10px] px-1 py-px rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                                    Wajib foto
                                                                </span>
                                                            )}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => openItemForm(tpl.id, item)}
                                                                className="p-1 text-muted-foreground hover:text-foreground"
                                                                title="Edit item"
                                                            >
                                                                <Pencil className="h-3 w-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => void toggleItemActive(item)}
                                                                className="text-xs text-muted-foreground hover:text-foreground"
                                                            >
                                                                {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                            </button>
                                                            <button
                                                                onClick={() => deleteItem(item)}
                                                                className="text-xs text-destructive hover:text-destructive/80"
                                                                title="Hapus item"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {templates.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">Belum ada template. Buat template pertama.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === "units" && (
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

                    <div className="bg-card border border-border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>Template</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {units.map((unit) => (
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
                                ))}
                            </TableBody>
                        </Table>
                        {units.length === 0 && (
                            <p className="text-center text-muted-foreground py-8 text-sm">Belum ada unit alat.</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === "assignments" && (
                <div className="space-y-6">
                    <div className="bg-card border border-border rounded-lg p-4">
                        <h2 className="text-base font-medium mb-1">Penugasan Baru</h2>
                        <p className="text-xs text-muted-foreground mb-3">
                            Hanya karyawan yang ditugaskan yang melihat modul Inspeksi Alat. Tugaskan satu
                            unit ke satu karyawan internal, atau centang Semua unit agar berlaku global.
                            Kosongkan tanggal mulai untuk berlaku hari ini.
                        </p>
                        <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
                            <input
                                type="checkbox"
                                checked={assignAllUnits}
                                onChange={(e) => setAssignAllUnits(e.target.checked)}
                                className="rounded border-border"
                            />
                            Semua unit (berlaku global)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="assign-unit" className="text-xs font-medium">Unit alat</label>
                                <select
                                    id="assign-unit"
                                    value={assignUnitId}
                                    onChange={(e) => setAssignUnitId(e.target.value)}
                                    disabled={assignAllUnits}
                                    className={`${inputClass} mt-1 disabled:opacity-50 min-h-[44px]`}
                                >
                                    <option value="">{assignAllUnits ? "Semua unit" : "Pilih unit"}</option>
                                    {units
                                        .filter((u) => u.isActive)
                                        .map((u) => (
                                            <option key={u.id} value={u.id}>
                                                {u.name}
                                            </option>
                                        ))}
                                </select>
                            </div>
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
                            {savingAssign ? "Menyimpan..." : "Simpan Penugasan"}
                        </button>
                    </div>

                    <div className="bg-card border border-border rounded-lg p-4">
                        <h2 className="text-base font-medium mb-1">Daftar Penugasan</h2>
                        <p className="text-xs text-muted-foreground mb-3">
                            {assignments.length === 0
                                ? "Belum ada penugasan."
                                : "Akhiri penugasan yang sudah tidak berlaku."}
                        </p>
                        {assignments.length > 0 && (
                            <ul className="space-y-2">
                                {assignments.map((a) => (
                                    <li
                                        key={a.id}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold truncate">
                                                {a.user.displayName ?? a.user.employeeId ?? "—"}
                                            </span>
                                            <span className="block text-xs text-muted-foreground truncate">
                                                {a.unit ? a.unit.name : "Semua unit"} · {a.user.employeeId ?? ""} · {a.startsOnWibDate}
                                                {a.endsOnWibDate ? ` → ${a.endsOnWibDate}` : " → berjalan"}
                                            </span>
                                        </span>
                                        {!a.endsOnWibDate || a.endsOnWibDate >= new Date().toISOString().slice(0, 10) ? (
                                            <button
                                                type="button"
                                                onClick={() => endAssignment(a)}
                                                className="shrink-0 px-3 min-h-[44px] inline-flex items-center text-xs font-medium text-rose-600 border border-border rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                            >
                                                Akhiri
                                            </button>
                                        ) : (
                                            <span className="shrink-0 text-xs text-muted-foreground">Berakhir</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                </div>
            )}

            {activeTab === "atasan" && (
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
                        <p className="text-xs text-muted-foreground mb-3">
                            Satu atasan lapangan yang memberi approval final (DONE → Selesai). Dinamis, bisa diganti kapan saja.
                        </p>
                        {approverError && (
                            <FeedbackMessage variant="error" className="mb-3">
                                {approverError}{" "}
                                <button onClick={() => void fetchApprover()} className="underline">
                                    Coba lagi
                                </button>
                            </FeedbackMessage>
                        )}
                        {approver ? (
                            <p className="text-sm text-foreground mb-3">
                                <span className="font-medium">{approver.name}</span>{" "}
                                <span className="text-xs text-muted-foreground">{approver.employeeId}</span>
                            </p>
                        ) : (
                            !approverError && (
                                <p className="text-sm text-muted-foreground mb-3">
                                    Belum ada approver — approval final terkunci sampai ditetapkan.
                                </p>
                            )
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
                                onClick={saveApprover}
                                disabled={savingApprover}
                                className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 self-end min-h-10"
                            >
                                {savingApprover ? "Menyimpan..." : "Tetapkan"}
                            </button>
                        </div>
                    </div>

                    <div className="bg-card border border-border rounded-lg p-4">
                        <h2 className="text-base font-medium mb-1">Anggota QC</h2>
                        <p className="text-xs text-muted-foreground mb-3">
                            Karyawan QC yang memeriksa hasil inspeksi produksi. Semua anggota melihat semua
                            yang disubmit, terbaru di atas. Maksimal 20 orang.
                        </p>
                        {qcError && (
                            <FeedbackMessage variant="error" className="mb-3">
                                {qcError}{" "}
                                <button onClick={() => void fetchQcMembers()} className="underline">
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
                                    {qcMembers.map((member) => (
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
                                Batas 20 anggota QC tercapai. Hapus salah satu untuk menambah.
                            </p>
                        )}
                    </div>
                </div>
            )}

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
