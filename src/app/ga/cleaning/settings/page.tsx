"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, ChevronDown, ChevronRight, Loader2, AlertTriangle, Users } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

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

type Tab = "templates" | "rooms" | "assignments";

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

    // ─── Assignment form state ────────────────────────────
    const [showAssignForm, setShowAssignForm] = useState(false);
    const [assignRoomId, setAssignRoomId] = useState("");
    const [assignUserId, setAssignUserId] = useState("");
    const [assignWorkerType, setAssignWorkerType] = useState<"INTERNAL" | "OUTSOURCE">("OUTSOURCE");
    const [assignApplyToday, setAssignApplyToday] = useState(false);
    const [savingAssign, setSavingAssign] = useState(false);

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

    // ─── Assignment CRUD ──────────────────────────────────

    const saveAssignment = useCallback(async () => {
        if (savingAssign || !assignRoomId || !assignUserId) return;
        setSavingAssign(true);
        try {
            const res = await fetch("/api/ga/cleaning/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomId: assignRoomId,
                    userId: assignUserId,
                    workerType: assignWorkerType,
                    applyToToday: assignApplyToday,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan penugasan."));
            toast("Petugas ditugaskan.", "success");
            setShowAssignForm(false);
            setAssignRoomId("");
            setAssignUserId("");
            setAssignApplyToday(false);
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        } finally {
            setSavingAssign(false);
        }
    }, [savingAssign, assignRoomId, assignUserId, assignApplyToday, toast, fetchAll]);

    const removeAssignment = useCallback(async (assignment: Assignment, _roomId: string) => {
        const reason = prompt("Alasan mengakhiri penugasan:");
        if (!reason) return;
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
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus penugasan."));
            toast("Penugasan diakhiri.", "success");
            await fetchAll();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal.", "error");
        }
    }, [toast, fetchAll]);

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

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Pengaturan Kebersihan</h1>
            <p className="text-sm text-muted-foreground mb-6">
                Kelola template, ruangan, dan penugasan petugas.
            </p>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 border-b border-border">
                {([["templates", "Template"], ["rooms", "Ruangan"], ["assignments", "Penugasan"]] as [Tab, string][]).map(([key, label]) => (
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
                                        <span className="text-xs text-muted-foreground">{tpl._count.rooms} ruangan · {tpl.items.length} item</span>
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
                                                        <button
                                                            onClick={() => toggleItemActive(item)}
                                                            className="text-xs text-muted-foreground hover:text-foreground"
                                                        >
                                                            {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                        </button>
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
                                    {activeTemplates.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
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
                                            Template: {room.template.name} · {room.assignments.filter((a) => a.endsOnWibDate === null).length} petugas aktif
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
                                    </div>
                                </div>
                                {room.assignments.filter((a) => a.endsOnWibDate === null).length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {room.assignments.filter((a) => a.endsOnWibDate === null).map((a) => (
                                            <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-accent/50 px-2 py-0.5 rounded">
                                                <Users className="h-3 w-3" />
                                                {a.user.displayName}
                                                <button
                                                    onClick={() => removeAssignment(a, room.id)}
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
                        <button
                            onClick={() => { setShowAssignForm(true); setAssignRoomId(rooms[0]?.id ?? ""); setAssignUserId(""); setAssignWorkerType("INTERNAL"); setAssignApplyToday(false); }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                        >
                            <Plus className="h-4 w-4" /> Tugaskan
                        </button>
                    </div>

                    {showAssignForm && (
                        <div className="bg-card border border-border rounded-lg p-4 mb-4">
                            <h3 className="text-sm font-medium mb-2">Penugasan Baru</h3>
                            <div className="space-y-3">
                                <select
                                    aria-label="Ruangan"
                                    value={assignRoomId}
                                    onChange={(e) => setAssignRoomId(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                                >
                                    <option value="">Pilih ruangan</option>
                                    {rooms.filter((r) => r.isActive).map((r) => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Tipe petugas"
                                    value={assignWorkerType}
                                    onChange={(e) => {
                                        const wt = e.target.value as "INTERNAL" | "OUTSOURCE";
                                        setAssignWorkerType(wt);
                                        setAssignUserId("");
                                        fetchAvailableUsers(wt);
                                    }}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                                >
                                    <option value="INTERNAL">Internal</option>
                                    <option value="OUTSOURCE">Outsource</option>
                                </select>
                                <select
                                    aria-label="Pengguna"
                                    value={assignUserId}
                                    onChange={(e) => setAssignUserId(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                                >
                                    <option value="">Pilih pengguna</option>
                                    {availableUsers.map((u) => (
                                        <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>
                                    ))}
                                </select>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={assignApplyToday}
                                        onChange={(e) => setAssignApplyToday(e.target.checked)}
                                        className="rounded border-border"
                                    />
                                    Berlaku mulai hari ini (bukan besok)
                                </label>
                            </div>
                            <div className="flex gap-2 mt-3">
                                <button onClick={saveAssignment} disabled={savingAssign} className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
                                    {savingAssign ? "Menyimpan..." : "Tugaskan"}
                                </button>
                                <button onClick={() => setShowAssignForm(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                                    Batal
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Summary by room */}
                    <div className="space-y-3">
                        {rooms.filter((r) => r.isActive).map((room) => (
                            <div key={room.id} className="bg-card border border-border rounded-lg p-3">
                                <p className="font-medium text-sm mb-2">{room.name}</p>
                                {room.assignments.filter((a) => a.endsOnWibDate === null).length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Belum ada petugas ditugaskan.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {room.assignments.filter((a) => a.endsOnWibDate === null).map((a) => (
                                            <div key={a.id} className="flex items-center justify-between text-sm py-1">
                                                <div>
                                                    <span className="font-medium">{a.user.displayName}</span>
                                                    <span className="text-muted-foreground ml-2 text-xs">({a.user.username})</span>
                                                    <span className="text-xs text-muted-foreground ml-2">{a.workerType}</span>
                                                    <span className="text-xs text-muted-foreground ml-2">sejak {a.startsOnWibDate}</span>
                                                </div>
                                                <button
                                                    onClick={() => removeAssignment(a, room.id)}
                                                    className="text-xs text-destructive hover:text-destructive/80"
                                                >
                                                    Akhiri
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
