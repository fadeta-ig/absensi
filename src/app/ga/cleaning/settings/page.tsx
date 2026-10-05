"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, ChevronDown, ChevronRight, Loader2, AlertTriangle, Users, UserPlus, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { toWIBDateString } from "@/lib/timezone";
import AccessibleModal from "@/components/ui/AccessibleModal";
import TopViewerCard from "./TopViewerCard";
import DefaultReviewerCard from "./DefaultReviewerCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Template {
    id: string;
    name: string;
    isActive: boolean;
    items: TemplateItem[];
    _count: { rooms: number };
}

interface TemplateItem {
    id: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
}

interface Room {
    id: string;
    name: string;
    isActive: boolean;
    template: { id: string; name: string };
    assignments: Assignment[];
    _count: { checklists: number };
}

interface Assignment {
    id: string;
    workerType: "INTERNAL" | "OUTSOURCE";
    startsOnWibDate: string;
    endsOnWibDate: string | null;
    user: { id: string; username: string; displayName: string };
}

interface AvailableUser {
    id: string;
    username: string;
    displayName: string;
    employeeId: string | null;
}

interface OutsourceUser {
    id: string;
    username: string;
    displayName: string;
    email: string;
    isActive: boolean;
    createdAt: string;
    cleaningAssignments: Array<{
        room: { id: string; name: string };
    }>;
}

type Tab = "templates" | "rooms" | "assignments" | "atasan";

interface TopViewerOption {
    employeeId: string;
    name: string;
}

interface TopViewerInfo {
    employeeId: string | null;
    name: string | null;
    isActive: boolean | null;
}

export default function CleaningSettingsPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<Tab>("templates");
    const [templates, setTemplates] = useState<Template[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ─── Template form state ──────────────────────────────
    const [showTemplateForm, setShowTemplateForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [templateName, setTemplateName] = useState("");
    const [savingTemplate, setSavingTemplate] = useState(false);

    // ─── Template item form state ─────────────────────────
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
    const [showItemForm, setShowItemForm] = useState<string | null>(null);
    const [itemName, setItemName] = useState("");
    const [savingItem, setSavingItem] = useState(false);

    // ─── Room form state ──────────────────────────────────
    const [showRoomForm, setShowRoomForm] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [roomName, setRoomName] = useState("");
    const [roomTemplateId, setRoomTemplateId] = useState("");
    const [savingRoom, setSavingRoom] = useState(false);

    // ─── Assignment form state (bulk: banyak petugas × banyak ruangan) ──
    const [showAssignForm, setShowAssignForm] = useState(false);
    const [bulkAssignRoomIds, setBulkAssignRoomIds] = useState<string[]>([]);
    const [bulkAssignUserIds, setBulkAssignUserIds] = useState<string[]>([]);
    const [assignWorkerType, setAssignWorkerType] = useState<"INTERNAL" | "OUTSOURCE">("OUTSOURCE");
    const [assignApplyToday, setAssignApplyToday] = useState(false);
    const [savingAssign, setSavingAssign] = useState(false);
    const [bulkResult, setBulkResult] = useState<{
        created: Array<{ roomName: string; displayName: string }>;
        skipped: Array<{ roomName: string; displayName: string; message: string }>;
        failed: Array<{ roomName: string; displayName: string; message: string }>;
    } | null>(null);

    const toggleBulkId = (list: string[], setList: (next: string[]) => void, id: string) => {
        setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
    };

    // ─── Outsource modal state ────────────────────────────
    const [showOutsourceModal, setShowOutsourceModal] = useState(false);
    const [outsourceUsers, setOutsourceUsers] = useState<OutsourceUser[]>([]);
    const [loadingOutsource, setLoadingOutsource] = useState(false);
    const [newOutsourceUsername, setNewOutsourceUsername] = useState("");
    const [newOutsourceDisplayName, setNewOutsourceDisplayName] = useState("");
    const [newOutsourceEmail, setNewOutsourceEmail] = useState("");
    const [newOutsourcePassword, setNewOutsourcePassword] = useState("");
    const [savingOutsource, setSavingOutsource] = useState(false);

    // ─── Data fetching ────────────────────────────────────

    const fetchAvailableUsers = useCallback(async (workerType: "INTERNAL" | "OUTSOURCE") => {
        try {
            const res = await fetch(`/api/ga/cleaning/assignments/available-users?workerType=${workerType}`);
            if (res.ok) {
                const json = await res.json();
                setAvailableUsers(json.data ?? []);
            }
        } catch {
            // silently ignore — users list is non-critical
        }
    }, []);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tplRes, roomRes, usersRes] = await Promise.all([
                fetch("/api/ga/cleaning/templates"),
                fetch("/api/ga/cleaning/rooms"),
                fetch("/api/ga/cleaning/assignments/available-users?workerType=OUTSOURCE"),
            ]);

            if (!tplRes.ok) throw new Error(await getResponseErrorMessage(tplRes, "Gagal memuat template."));
            if (!roomRes.ok) throw new Error(await getResponseErrorMessage(roomRes, "Gagal memuat ruangan."));
            if (!usersRes.ok) throw new Error(await getResponseErrorMessage(usersRes, "Gagal memuat daftar pengguna."));

            const [tplJson, roomJson, usersJson] = await Promise.all([tplRes.json(), roomRes.json(), usersRes.json()]);
            setTemplates(tplJson.data ?? []);
            setRooms(roomJson.data ?? []);
            setAvailableUsers(usersJson.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            setError(msg);
            reportClientError("CleaningSettings", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchAll(); }, [fetchAll]);

    // ─── Template CRUD ────────────────────────────────────

    const saveTemplate = useCallback(async () => {
        if (savingTemplate || !templateName.trim()) return;
        setSavingTemplate(true);
        try {
            const isEdit = !!editingTemplate;
            const res = await fetch("/api/ga/cleaning/templates", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isEdit ? { id: editingTemplate.id, name: templateName.trim() } : { name: templateName.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan template."));
            toast(isEdit ? "Template diperbarui." : "Template dibuat.", "success");
            setShowTemplateForm(false);
            setEditingTemplate(null);
            setTemplateName("");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("CleaningSettings", "Template save failed", err);
        } finally {
            setSavingTemplate(false);
        }
    }, [savingTemplate, templateName, editingTemplate, toast, fetchAll]);

    const toggleTemplateActive = useCallback(async (tpl: Template) => {
        try {
            const res = await fetch("/api/ga/cleaning/templates", {
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
    }, [toast, fetchAll]);

    // ─── Template item CRUD ───────────────────────────────

    const saveTemplateItem = useCallback(async (templateId: string) => {
        if (savingItem || !itemName.trim()) return;
        setSavingItem(true);
        try {
            const res = await fetch("/api/ga/cleaning/template-items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId, name: itemName.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menambah item."));
            toast("Item ditambahkan.", "success");
            setShowItemForm(null);
            setItemName("");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menambah item.", "error");
        } finally {
            setSavingItem(false);
        }
    }, [savingItem, itemName, toast, fetchAll]);

    const toggleItemActive = useCallback(async (item: TemplateItem) => {
        try {
            const res = await fetch("/api/ga/cleaning/template-items", {
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
    }, [toast, fetchAll]);

    // ─── Room CRUD ────────────────────────────────────────

    const saveRoom = useCallback(async () => {
        if (savingRoom || !roomName.trim() || !roomTemplateId) return;
        setSavingRoom(true);
        try {
            const isEdit = !!editingRoom;
            const res = await fetch("/api/ga/cleaning/rooms", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isEdit
                        ? { id: editingRoom.id, name: roomName.trim(), templateId: roomTemplateId }
                        : { name: roomName.trim(), templateId: roomTemplateId }
                ),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan ruangan."));
            toast(isEdit ? "Ruangan diperbarui." : "Ruangan dibuat.", "success");
            setShowRoomForm(false);
            setEditingRoom(null);
            setRoomName("");
            setRoomTemplateId("");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("CleaningSettings", "Room save failed", err);
        } finally {
            setSavingRoom(false);
        }
    }, [savingRoom, roomName, roomTemplateId, editingRoom, toast, fetchAll]);

    const toggleRoomActive = useCallback(async (room: Room) => {
        try {
            const res = await fetch("/api/ga/cleaning/rooms", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: room.id, isActive: !room.isActive }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status."));
            toast(room.isActive ? "Ruangan dinonaktifkan." : "Ruangan diaktifkan.", "success");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal mengubah status.", "error");
        }
    }, [toast, fetchAll]);

    // ─── Hapus master yang belum dipakai ────────────────────

    const deleteMaster = useCallback(async (kind: "template" | "item" | "room", id: string, label: string) => {
        if (!confirm(`Hapus ${label}? Hanya data yang belum pernah dipakai yang bisa dihapus.`)) return;
        const endpoint =
            kind === "template"
                ? "/api/ga/cleaning/templates"
                : kind === "item"
                    ? "/api/ga/cleaning/template-items"
                    : "/api/ga/cleaning/rooms";
        try {
            const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, `Gagal menghapus ${label}.`));
            toast(`${label} dihapus.`, "success");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menghapus.", "error");
            reportClientError("CleaningSettings", `Delete ${kind} failed`, err);
        }
    }, [toast, fetchAll]);

    // ─── Assignment CRUD ──────────────────────────────────

    const saveBulkAssignment = useCallback(async () => {
        if (savingAssign || bulkAssignRoomIds.length === 0 || bulkAssignUserIds.length === 0) return;
        setSavingAssign(true);
        setBulkResult(null);
        try {
            const res = await fetch("/api/ga/cleaning/assignments/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomIds: bulkAssignRoomIds,
                    userIds: bulkAssignUserIds,
                    workerType: assignWorkerType,
                    applyToToday: assignApplyToday,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan penugasan."));
            const json = await res.json();
            const data = json.data ?? { created: [], skipped: [], failed: [] };
            setBulkResult(data);
            const total = data.created.length + data.skipped.length + data.failed.length;
            toast(
                `Selesai: ${data.created.length} ditugaskan, ${data.skipped.length} sudah ada, ${data.failed.length} gagal (dari ${total}).`,
                data.failed.length > 0 ? "error" : "success"
            );
            if (data.failed.length === 0) {
                setBulkAssignRoomIds([]);
                setBulkAssignUserIds([]);
            }
            setAssignApplyToday(false);
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        } finally {
            setSavingAssign(false);
        }
    }, [savingAssign, bulkAssignRoomIds, bulkAssignUserIds, assignWorkerType, assignApplyToday, toast, fetchAll]);

    const removeAssignment = useCallback(async (assignment: Assignment) => {
        const todayStr = toWIBDateString();
        const isPlanned = assignment.startsOnWibDate > todayStr;
        const confirmMsg = isPlanned
            ? `Batalkan jadwal penugasan untuk ${assignment.user.displayName}?`
            : "Alasan mengakhiri penugasan:";

        let reason = "Dibatalkan oleh GA";
        if (isPlanned) {
            if (!confirm(confirmMsg)) return;
        } else {
            const promptReason = prompt(confirmMsg);
            if (!promptReason) return;
            reason = promptReason;
        }

        try {
            const res = await fetch("/api/ga/cleaning/assignments", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    assignmentId: assignment.id,
                    action: "END",
                    applyToToday: true,
                    reason,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengakhiri penugasan."));
            toast(isPlanned ? "Jadwal penugasan dibatalkan." : "Penugasan diakhiri.", "success");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        }
    }, [toast, fetchAll]);

    // ─── Outsource users management ───────────────────────

    const fetchOutsourceUsers = useCallback(async () => {
        setLoadingOutsource(true);
        try {
            const res = await fetch("/api/ga/cleaning/outsource-users");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat petugas outsource."));
            const json = await res.json();
            setOutsourceUsers(json.data ?? []);
        } catch (err) {
            reportClientError("CleaningSettingsOutsourceUsers", "Gagal memuat petugas outsource", err);
            toast(err instanceof Error ? err.message : "Gagal memuat petugas outsource.", "error");
        } finally {
            setLoadingOutsource(false);
        }
    }, [toast]);

    const handleCreateOutsourceUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const username = newOutsourceUsername.trim().toLowerCase();
        const displayName = newOutsourceDisplayName.trim();
        if (!username) {
            toast("Username wajib diisi.", "error");
            return;
        }
        if (!displayName) {
            toast("Nama lengkap wajib diisi.", "error");
            return;
        }
        if (newOutsourcePassword.length < 8) {
            toast("Password minimal 8 karakter.", "error");
            return;
        }

        setSavingOutsource(true);
        try {
            const res = await fetch("/api/ga/cleaning/outsource-users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    displayName,
                    email: newOutsourceEmail.trim() || undefined,
                    password: newOutsourcePassword,
                }),
            });

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal membuat akun outsource."));
            }

            const json = await res.json();
            toast("Akun outsource berhasil dibuat!", "success");
            setNewOutsourceUsername("");
            setNewOutsourceDisplayName("");
            setNewOutsourceEmail("");
            setNewOutsourcePassword("");

            await Promise.all([
                fetchOutsourceUsers(),
                fetchAvailableUsers("OUTSOURCE"),
            ]);

            if (json.data?.id && showAssignForm) {
                setAssignWorkerType("OUTSOURCE");
                setBulkAssignUserIds([json.data.id]);
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal membuat akun outsource.", "error");
        } finally {
            setSavingOutsource(false);
        }
    };

    // ─── Render ───────────────────────────────────────────

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
                    <button onClick={fetchAll} className="mt-3 text-sm text-primary hover:underline">Coba lagi</button>
                </div>
            </div>
        );
    }

    const activeTemplates = templates.filter((t) => t.isActive);
    // B7: template yang sedang dipakai ruangan tetap bisa dipilih saat edit
    // (tampil dengan penanda nonaktif) agar simpan tanpa ganti tidak dipaksa.
    const roomTemplateOptions =
        editingRoom && !activeTemplates.some((t) => t.id === editingRoom.template.id)
            ? [...activeTemplates, { ...editingRoom.template, isActive: false, items: [], _count: { rooms: 0 } } as Template]
            : activeTemplates;

    // B2: tampilkan penugasan yang masih berlaku hari ini (termasuk yang berakhir besok),
    // bukan hanya yang endsOn null — agar tidak dikira sudah lepas.
    const visibleAssignments = (list: Assignment[]) => {
        const todayStr = toWIBDateString();
        return list.filter((a) => a.endsOnWibDate === null || a.endsOnWibDate > todayStr);
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Pengaturan Inspeksi</h1>
            <p className="text-sm text-muted-foreground mb-6">
                Kelola template, ruangan, dan penugasan petugas inspeksi.
            </p>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
                {([["templates", "Template"], ["rooms", "Ruangan"], ["assignments", "Penugasan"], ["atasan", "Reviewer & Atasan"]] as [Tab, string][]).map(([key, label]) => (
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

            {/* Templates tab */}
            {activeTab === "templates" && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-medium">Template Checklist</h2>
                        <button
                            onClick={() => { setShowTemplateForm(true); setEditingTemplate(null); setTemplateName(""); }}
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
                                className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                            />
                            <div className="flex gap-2 mt-3">
                                <button onClick={saveTemplate} disabled={savingTemplate} className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                                    {savingTemplate ? "Menyimpan..." : "Simpan"}
                                </button>
                                <button onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
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
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${tpl.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                                            {tpl.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{tpl._count.rooms} ruangan, {tpl.items.length} pekerjaan</span>
                                    </button>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => { setShowTemplateForm(true); setEditingTemplate(tpl); setTemplateName(tpl.name); }}
                                            className="p-1 text-muted-foreground hover:text-foreground"
                                            title="Edit"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => toggleTemplateActive(tpl)}
                                            className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                                        >
                                            {tpl.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                        <button
                                            onClick={() => void deleteMaster("template", tpl.id, `Template "${tpl.name}"`)}
                                            className="text-xs px-2 py-1 text-destructive hover:text-destructive/80"
                                            title="Hapus template yang belum dipakai"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                </div>

                                {expandedTemplate === tpl.id && (
                                    <div className="border-t border-border px-3 pb-3 pt-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-muted-foreground uppercase">Item</span>
                                            <button
                                                onClick={() => { setShowItemForm(tpl.id); setItemName(""); }}
                                                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                            >
                                                <Plus className="h-3 w-3" /> Tambah Item
                                            </button>
                                        </div>

                                        {showItemForm === tpl.id && (
                                            <div className="flex gap-2 mb-2">
                                                <input
                                                    type="text"
                                                    value={itemName}
                                                    onChange={(e) => setItemName(e.target.value)}
                                                    placeholder="Nama item"
                                                    className="flex-1 px-2 py-1.5 border border-border rounded text-sm bg-background"
                                                />
                                                <button onClick={() => saveTemplateItem(tpl.id)} disabled={savingItem} className="px-2 py-1 text-xs font-medium text-primary-foreground bg-primary rounded hover:bg-primary/90">
                                                    {savingItem ? "..." : "Simpan"}
                                                </button>
                                                <button onClick={() => setShowItemForm(null)} className="text-xs text-muted-foreground">Batal</button>
                                            </div>
                                        )}

                                        {tpl.items.length === 0 ? (
                                            <p className="text-xs text-muted-foreground py-2">Belum ada item.</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {tpl.items.map((item, idx) => (
                                                    <div key={item.id} className="flex items-center justify-between py-1 px-2 text-sm rounded hover:bg-accent/50">
                                                        <span className={item.isActive ? "text-foreground" : "text-muted-foreground line-through"}>
                                                            {idx + 1}. {item.name}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => toggleItemActive(item)}
                                                                className="text-xs text-muted-foreground hover:text-foreground"
                                                            >
                                                                {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                            </button>
                                                            <button
                                                                onClick={() => void deleteMaster("item", item.id, `Item "${item.name}"`)}
                                                                className="text-xs text-destructive hover:text-destructive/80"
                                                                title="Hapus item yang belum dipakai"
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

            {/* Rooms tab */}
            {activeTab === "rooms" && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-medium">Ruangan</h2>
                        <button
                            onClick={() => { setShowRoomForm(true); setEditingRoom(null); setRoomName(""); setRoomTemplateId(activeTemplates[0]?.id ?? ""); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                        >
                            <Plus className="h-4 w-4" /> Tambah
                        </button>
                    </div>

                    {showRoomForm && (
                        <div className="bg-card border border-border rounded-lg p-4 mb-4">
                            <h3 className="text-sm font-medium mb-2">{editingRoom ? "Edit Ruangan" : "Ruangan Baru"}</h3>
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                    placeholder="Nama ruangan"
                                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                                />
                                <select
                                    value={roomTemplateId}
                                    onChange={(e) => setRoomTemplateId(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                                >
                                    <option value="">Pilih template</option>
                                    {roomTemplateOptions.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}{t.isActive ? "" : " (nonaktif)"}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-2 mt-3">
                                <button onClick={saveRoom} disabled={savingRoom} className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                                    {savingRoom ? "Menyimpan..." : "Simpan"}
                                </button>
                                <button onClick={() => { setShowRoomForm(false); setEditingRoom(null); }} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                                    Batal
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        {rooms.map((room) => (
                            <div key={room.id} className="bg-card border border-border rounded-lg p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-sm">{room.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Template: {room.template.name} · {visibleAssignments(room.assignments).length} petugas aktif
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${room.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                                            {room.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                        <button
                                            onClick={() => { setShowRoomForm(true); setEditingRoom(room); setRoomName(room.name); setRoomTemplateId(room.template.id); }}
                                            className="p-1 text-muted-foreground hover:text-foreground"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => toggleRoomActive(room)}
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            {room.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                        <button
                                            onClick={() => void deleteMaster("room", room.id, `Ruangan "${room.name}"`)}
                                            className="text-xs text-destructive hover:text-destructive/80"
                                            title="Hapus ruangan yang belum punya data"
                                        >
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                                {visibleAssignments(room.assignments).length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {visibleAssignments(room.assignments).map((a) => (
                                            <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-accent/50 px-2 py-0.5 rounded">
                                                <Users className="h-3 w-3" />
                                                {a.user.displayName}
                                                {a.endsOnWibDate && (
                                                    <span className="text-amber-700 dark:text-amber-400 font-medium">
                                                        · berakhir {a.endsOnWibDate}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => removeAssignment(a)}
                                                    className="text-destructive hover:text-destructive/80 ml-0.5"
                                                    title="Hapus penugasan"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                        {rooms.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">Belum ada ruangan. Buat template terlebih dahulu, lalu tambah ruangan.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Assignments tab */}
            {activeTab === "assignments" && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-medium">Penugasan Petugas</h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setShowOutsourceModal(true);
                                    void fetchOutsourceUsers();
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-muted text-foreground"
                                type="button"
                            >
                                <UserPlus className="h-4 w-4 text-primary" /> Petugas Outsource
                            </button>
                            <button
                                onClick={() => { setShowAssignForm(true); setBulkAssignRoomIds([]); setBulkAssignUserIds([]); setAssignWorkerType("INTERNAL"); setAssignApplyToday(false); setBulkResult(null); fetchAvailableUsers("INTERNAL"); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                            >
                                <Plus className="h-4 w-4" /> Tugaskan
                            </button>
                        </div>
                    </div>

                    {showAssignForm && (
                        <div className="bg-card border border-border rounded-lg p-4 mb-4">
                            <h3 className="text-sm font-medium mb-1">Penugasan Baru (bisa banyak sekaligus)</h3>
                            <p className="text-xs text-muted-foreground mb-3">
                                Centang petugas dan ruangan, lalu tugaskan sekaligus. 1 petugas bisa ke semua ruangan, atau selang-seling.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-semibold text-foreground">
                                            Ruangan ({bulkAssignRoomIds.length} dipilih)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const active = rooms.filter((r) => r.isActive);
                                                setBulkAssignRoomIds(
                                                    bulkAssignRoomIds.length === active.length ? [] : active.map((r) => r.id)
                                                );
                                            }}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            {bulkAssignRoomIds.length > 0 ? "Hapus semua" : "Pilih semua ruangan"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto border border-border rounded-md p-2">
                                        {rooms.filter((r) => r.isActive).map((r) => (
                                            <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer px-1.5 py-1 rounded hover:bg-accent/50">
                                                <input
                                                    type="checkbox"
                                                    checked={bulkAssignRoomIds.includes(r.id)}
                                                    onChange={() => toggleBulkId(bulkAssignRoomIds, setBulkAssignRoomIds, r.id)}
                                                    className="rounded border-border"
                                                />
                                                <span className="text-foreground">{r.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-foreground">Tipe petugas</span>
                                    <select
                                        aria-label="Tipe petugas"
                                        value={assignWorkerType}
                                        onChange={(e) => {
                                            const wt = e.target.value as "INTERNAL" | "OUTSOURCE";
                                            setAssignWorkerType(wt);
                                            setBulkAssignUserIds([]);
                                            fetchAvailableUsers(wt);
                                        }}
                                        className="mt-1.5 w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                                    >
                                        <option value="INTERNAL">Karyawan WIG</option>
                                        <option value="OUTSOURCE">Petugas luar (outsource)</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-semibold text-foreground">
                                            Petugas ({bulkAssignUserIds.length} dipilih)
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBulkAssignUserIds(
                                                    bulkAssignUserIds.length === availableUsers.length ? [] : availableUsers.map((u) => u.id)
                                                );
                                            }}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            {bulkAssignUserIds.length > 0 ? "Hapus semua" : "Pilih semua"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto border border-border rounded-md p-2">
                                        {availableUsers.length === 0 && (
                                            <p className="text-xs text-muted-foreground px-1.5 py-1">Belum ada petugas tipe ini.</p>
                                        )}
                                        {availableUsers.map((u) => (
                                            <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer px-1.5 py-1 rounded hover:bg-accent/50">
                                                <input
                                                    type="checkbox"
                                                    checked={bulkAssignUserIds.includes(u.id)}
                                                    onChange={() => toggleBulkId(bulkAssignUserIds, setBulkAssignUserIds, u.id)}
                                                    className="rounded border-border"
                                                />
                                                <span className="text-foreground">{u.displayName}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                {assignWorkerType === "OUTSOURCE" && (
                                    <div className="flex items-center justify-between text-xs text-muted-foreground p-2 rounded border border-border bg-muted/30">
                                        <span>Perlu mendaftarkan akun petugas outsource baru?</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowOutsourceModal(true);
                                                void fetchOutsourceUsers();
                                            }}
                                            className="text-primary font-medium hover:underline flex items-center gap-1"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" /> + Buat Akun Outsource
                                        </button>
                                    </div>
                                )}
                                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={assignApplyToday}
                                            onChange={(e) => setAssignApplyToday(e.target.checked)}
                                            className="rounded border-border"
                                        />
                                        Mulai hari ini (langsung bisa isi).
                                    </label>
                                    <p className="text-xs text-muted-foreground ml-6">
                                        {assignApplyToday
                                            ? "Petugas aktif hari ini dan dapat langsung mengisi checklist."
                                            : "Jika kosong, mulai besok pagi."}
                                    </p>
                                </div>
                                <p className="text-xs font-semibold text-foreground" aria-live="polite">
                                    {bulkAssignUserIds.length > 0 && bulkAssignRoomIds.length > 0
                                        ? `${bulkAssignUserIds.length} petugas × ${bulkAssignRoomIds.length} ruangan = ${bulkAssignUserIds.length * bulkAssignRoomIds.length} penugasan`
                                        : "Pilih minimal 1 ruangan dan 1 petugas."}
                                </p>
                                {bulkResult && (
                                    <div className="rounded-lg border border-border p-3 space-y-1.5 text-xs">
                                        {bulkResult.created.length > 0 && (
                                            <p className="text-green-700 dark:text-green-400 font-medium">
                                                Berhasil {bulkResult.created.length}: {bulkResult.created.slice(0, 5).map((c) => `${c.displayName} → ${c.roomName}`).join("; ")}{bulkResult.created.length > 5 ? ` (+${bulkResult.created.length - 5} lainnya)` : ""}
                                            </p>
                                        )}
                                        {bulkResult.skipped.length > 0 && (
                                            <p className="text-amber-700 dark:text-amber-400 font-medium">
                                                Sudah ada {bulkResult.skipped.length}: {bulkResult.skipped.slice(0, 5).map((c) => `${c.displayName} → ${c.roomName}`).join("; ")}{bulkResult.skipped.length > 5 ? ` (+${bulkResult.skipped.length - 5} lainnya)` : ""}
                                            </p>
                                        )}
                                        {bulkResult.failed.map((f, idx) => (
                                            <p key={idx} className="text-destructive">
                                                Gagal: {f.displayName} → {f.roomName} ({f.message})
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={saveBulkAssignment}
                                    disabled={savingAssign || bulkAssignRoomIds.length === 0 || bulkAssignUserIds.length === 0}
                                    className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                                >
                                    {savingAssign
                                        ? "Menyimpan..."
                                        : bulkAssignRoomIds.length > 0 && bulkAssignUserIds.length > 0
                                            ? `Tugaskan ${bulkAssignRoomIds.length * bulkAssignUserIds.length} penugasan`
                                            : "Tugaskan"}
                                </button>
                                <button onClick={() => { setShowAssignForm(false); setBulkResult(null); }} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                                    Tutup
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Summary by room */}
                    <div className="space-y-3">
                        {rooms.filter((r) => r.isActive).map((room) => {
                            const todayStr = toWIBDateString();
                            const activeAssignments = visibleAssignments(room.assignments);
                            return (
                                <div key={room.id} className="bg-card border border-border rounded-lg p-3">
                                    <p className="font-medium text-sm mb-2">{room.name}</p>
                                    {activeAssignments.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">Belum ada petugas ditugaskan.</p>
                                    ) : (
                                        <div className="space-y-1.5">
                                            {activeAssignments.map((a) => {
                                                const isPlanned = a.startsOnWibDate > todayStr;
                                                return (
                                                    <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-b-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium">{a.user.displayName}</span>
                                                            <span className="text-muted-foreground text-xs">({a.user.username})</span>
                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                                                {a.workerType === "INTERNAL" ? "Karyawan WIG" : "Petugas luar (outsource)"}
                                                            </span>
                                                            {isPlanned ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                                                                    Terjadwal mulai {a.startsOnWibDate}
                                                                </span>
                                                            ) : a.endsOnWibDate ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-[var(--warning-border)]">
                                                                    Berakhir {a.endsOnWibDate} (masih berlaku hari ini)
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">
                                                                    aktif sejak {a.startsOnWibDate}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => removeAssignment(a)}
                                                            className={`text-xs px-2.5 py-1 rounded transition-colors ${
                                                                isPlanned
                                                                    ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-medium"
                                                                    : "text-destructive hover:bg-destructive/10"
                                                            }`}
                                                            title={isPlanned ? "Batalkan jadwal penugasan ini" : "Akhiri masa tugas petugas ini"}
                                                        >
                                                            {isPlanned ? "Batalkan Jadwal" : "Akhiri"}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Modal: Kelola Petugas Outsource */}
            {showOutsourceModal && (
                <AccessibleModal
                    ariaLabel="Kelola Petugas Outsource"
                    onClose={() => setShowOutsourceModal(false)}
                    className="!max-w-2xl !p-6"
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">Kelola Petugas Outsource</h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                Daftarkan akun petugas inspeksi eksternal (outsource) tanpa data karyawan internal.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setShowOutsourceModal(false)}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Form Tambah */}
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/20 mb-6">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
                            <UserPlus className="h-4 w-4 text-[var(--primary)]" />
                            Tambah Petugas Outsource Baru
                        </h3>
                        <form onSubmit={handleCreateOutsourceUser} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="form-group !mb-0">
                                    <label className="form-label" htmlFor="outsource-username">Username</label>
                                    <input
                                        id="outsource-username"
                                        type="text"
                                        value={newOutsourceUsername}
                                        onChange={(e) => setNewOutsourceUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                                        placeholder="cth: outsource_tono"
                                        required
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label" htmlFor="outsource-display-name">Nama Lengkap</label>
                                    <input
                                        id="outsource-display-name"
                                        type="text"
                                        value={newOutsourceDisplayName}
                                        onChange={(e) => setNewOutsourceDisplayName(e.target.value)}
                                        placeholder="cth: Tono Santoso (Outsource)"
                                        required
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label" htmlFor="outsource-email">Email (Opsional)</label>
                                    <input
                                        id="outsource-email"
                                        type="email"
                                        value={newOutsourceEmail}
                                        onChange={(e) => setNewOutsourceEmail(e.target.value)}
                                        placeholder="otomatis dibuat jika kosong"
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label" htmlFor="outsource-password">Password</label>
                                    <input
                                        id="outsource-password"
                                        type="password"
                                        value={newOutsourcePassword}
                                        onChange={(e) => setNewOutsourcePassword(e.target.value)}
                                        placeholder="Minimal 8 karakter"
                                        minLength={8}
                                        maxLength={128}
                                        autoComplete="new-password"
                                        required
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={savingOutsource || !newOutsourceUsername.trim() || !newOutsourceDisplayName.trim() || newOutsourcePassword.length < 8}
                                    className="btn btn-primary btn-sm"
                                >
                                    {savingOutsource ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    Simpan Akun Outsource
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Daftar Petugas Outsource Terdaftar */}
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                            Daftar Akun Outsource Terdaftar ({outsourceUsers.length})
                        </h3>

                        {loadingOutsource ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                            </div>
                        ) : outsourceUsers.length === 0 ? (
                            <p className="text-xs text-[var(--text-muted)] p-4 text-center border border-dashed border-[var(--border)] rounded-lg">
                                Belum ada akun petugas outsource yang terdaftar.
                            </p>
                        ) : (
                            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Nama & Username</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Penugasan Terbuka</TableHead>
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
                                                        <div className="font-semibold text-[var(--text-primary)]">{u.displayName}</div>
                                                        <div className="text-xs text-[var(--text-muted)] font-mono">{u.username}</div>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-[var(--text-secondary)]">{u.email}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {assignedRooms ? (
                                                            <span className="font-medium text-[var(--success)]">{assignedRooms}</span>
                                                        ) : (
                                                            <span className="text-[var(--text-muted)]">Belum ditugaskan</span>
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
            )}

            {activeTab === "atasan" && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-medium">Reviewer & Atasan Tertinggi</h2>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">
                                Pasangan default reviewer
                            </h3>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                                Satu pasang untuk semua ruangan. Dipakai mengisi otomatis periode baru dan paraf/TTD pertama.
                            </p>
                            <DefaultReviewerCard />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">
                                Atasan tertinggi (pemantau)
                            </h3>
                            <p className="text-xs text-[var(--text-muted)] mb-3">
                                Tunjuk karyawan yang boleh memantau seluruh inspeksi (read-only, tanpa paraf/TTD).
                            </p>
                            <TopViewerCard />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
