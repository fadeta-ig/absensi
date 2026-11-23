"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    DoorOpen,
    Loader2,
    Pencil,
    Plus,
    Search,
    ShieldCheck,
    UserPlus,
    Users,
    X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { toWIBDateString } from "@/lib/timezone";
import AccessibleModal from "@/components/ui/AccessibleModal";
import TopViewerCard from "./TopViewerCard";
import DefaultReviewerCard from "./DefaultReviewerCard";
import OutsourceUsersModal from "./OutsourceUsersModal";
import BulkAssignModal from "./BulkAssignModal";
import EndAssignmentModal from "./EndAssignmentModal";
import {
    cleaningInputClass,
    formatCleaningWibDate,
    getVisibleAssignments,
    toFriendlyCleaningError,
    type AvailableCleaningUser,
    type BulkAssignResult,
    type CleaningAssignment,
    type CleaningRoom,
    type CleaningTemplate,
    type CleaningTemplateItem,
    type OutsourceCleaningUser,
} from "./cleaningSettingsUtils";

type Tab = "templates" | "rooms" | "assignments" | "atasan";
type RoomStatusFilter = "all" | "active" | "inactive";
type AssignmentViewMode = "by-room" | "by-worker";
type AssignmentRoomFilter = "all" | "assigned" | "unassigned";

const TAB_ITEMS: Array<{ key: Tab; label: string; icon: typeof ClipboardList }> = [
    { key: "templates", label: "Template", icon: ClipboardList },
    { key: "rooms", label: "Ruangan", icon: DoorOpen },
    { key: "assignments", label: "Penugasan", icon: Users },
    { key: "atasan", label: "Pemeriksa & Atasan", icon: ShieldCheck },
];

export default function CleaningSettingsPage() {
    const toast = useToast();
    const toastRef = useRef(toast);
    toastRef.current = toast;
    const confirm = useConfirm();

    const [activeTab, setActiveTab] = useState<Tab>("templates");
    const [templates, setTemplates] = useState<CleaningTemplate[]>([]);
    const [rooms, setRooms] = useState<CleaningRoom[]>([]);
    const [availableUsers, setAvailableUsers] = useState<AvailableCleaningUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ─── Template form state ──────────────────────────────
    const [showTemplateForm, setShowTemplateForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<CleaningTemplate | null>(null);
    const [templateName, setTemplateName] = useState("");
    const [savingTemplate, setSavingTemplate] = useState(false);

    // ─── Template item form state ─────────────────────────
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
    const initializedExpandRef = useRef(false);
    const [showItemForm, setShowItemForm] = useState<string | null>(null);
    const [itemName, setItemName] = useState("");
    const [savingItem, setSavingItem] = useState(false);

    // ─── Room filter & form state ─────────────────────────
    const [roomSearch, setRoomSearch] = useState("");
    const [roomStatusFilter, setRoomStatusFilter] = useState<RoomStatusFilter>("all");
    const [showRoomForm, setShowRoomForm] = useState(false);
    const [editingRoom, setEditingRoom] = useState<CleaningRoom | null>(null);
    const [roomName, setRoomName] = useState("");
    const [roomTemplateId, setRoomTemplateId] = useState("");
    const [savingRoom, setSavingRoom] = useState(false);

    // ─── Assignment view, filter & bulk modal state ───────
    const [assignViewMode, setAssignViewMode] = useState<AssignmentViewMode>("by-room");
    const [assignSearch, setAssignSearch] = useState("");
    const [assignRoomFilter, setAssignRoomFilter] = useState<AssignmentRoomFilter>("all");
    const [expandedAssignKeys, setExpandedAssignKeys] = useState<Record<string, boolean>>({});
    const [showAssignForm, setShowAssignForm] = useState(false);
    const [bulkAssignRoomIds, setBulkAssignRoomIds] = useState<string[]>([]);
    const [bulkAssignUserIds, setBulkAssignUserIds] = useState<string[]>([]);
    const [assignWorkerType, setAssignWorkerType] = useState<"INTERNAL" | "OUTSOURCE">("INTERNAL");
    const [assignApplyToday, setAssignApplyToday] = useState(false);
    const [savingAssign, setSavingAssign] = useState(false);
    const [bulkResult, setBulkResult] = useState<BulkAssignResult | null>(null);

    // ─── End assignment modal state ───────────────────────
    const [endingTarget, setEndingTarget] = useState<{
        assignment: CleaningAssignment;
        roomName: string;
    } | null>(null);
    const [endingSaving, setEndingSaving] = useState(false);

    // ─── Outsource modal state ────────────────────────────
    const [showOutsourceModal, setShowOutsourceModal] = useState(false);
    const [outsourceUsers, setOutsourceUsers] = useState<OutsourceCleaningUser[]>([]);
    const [loadingOutsource, setLoadingOutsource] = useState(false);
    const [newOutsourceUsername, setNewOutsourceUsername] = useState("");
    const [newOutsourceDisplayName, setNewOutsourceDisplayName] = useState("");
    const [newOutsourceEmail, setNewOutsourceEmail] = useState("");
    const [newOutsourcePassword, setNewOutsourcePassword] = useState("");
    const [savingOutsource, setSavingOutsource] = useState(false);

    // ─── Data fetching ────────────────────────────────────

    const fetchAvailableUsers = useCallback(async (workerType: "INTERNAL" | "OUTSOURCE") => {
        try {
            const res = await fetch(
                `/api/ga/cleaning/assignments/available-users?workerType=${workerType}`
            );
            if (res.ok) {
                const json = await res.json();
                setAvailableUsers(json.data ?? []);
            }
        } catch {
            // Daftar pengguna tersedia akan dimuat ulang saat modal dibuka.
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

            if (!tplRes.ok) {
                throw new Error(await getResponseErrorMessage(tplRes, "Gagal memuat template."));
            }
            if (!roomRes.ok) {
                throw new Error(await getResponseErrorMessage(roomRes, "Gagal memuat ruangan."));
            }
            if (!usersRes.ok) {
                throw new Error(
                    await getResponseErrorMessage(usersRes, "Gagal memuat daftar petugas.")
                );
            }

            const [tplJson, roomJson, usersJson] = await Promise.all([
                tplRes.json(),
                roomRes.json(),
                usersRes.json(),
            ]);
            const fetchedTemplates = (tplJson.data ?? []) as CleaningTemplate[];
            setTemplates(fetchedTemplates);
            setRooms((roomJson.data ?? []) as CleaningRoom[]);
            setAvailableUsers((usersJson.data ?? []) as AvailableCleaningUser[]);

            if (!initializedExpandRef.current) {
                initializedExpandRef.current = true;
                if (fetchedTemplates.length > 0 && fetchedTemplates.length <= 3) {
                    setExpandedTemplate(fetchedTemplates[0].id);
                }
            }
        } catch (err) {
            const msg = toFriendlyCleaningError(
                err,
                "Gagal memuat data pengaturan inspeksi. Periksa koneksi Anda lalu coba lagi."
            );
            setError(msg);
            reportClientError("CleaningSettings", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    // ─── Template CRUD ────────────────────────────────────

    const saveTemplate = useCallback(async () => {
        if (savingTemplate) return;
        if (!templateName.trim()) {
            toastRef.current("Nama template wajib diisi.", "warning");
            return;
        }
        setSavingTemplate(true);
        try {
            const isEdit = !!editingTemplate;
            const res = await fetch("/api/ga/cleaning/templates", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isEdit
                        ? { id: editingTemplate.id, name: templateName.trim() }
                        : { name: templateName.trim() }
                ),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan template."));
            }
            toastRef.current(isEdit ? "Template diperbarui." : "Template dibuat.", "success");
            setShowTemplateForm(false);
            setEditingTemplate(null);
            setTemplateName("");
            await fetchAll();
        } catch (err) {
            toastRef.current(
                toFriendlyCleaningError(
                    err,
                    "Gagal menyimpan template. Periksa koneksi Anda lalu coba lagi."
                ),
                "error"
            );
            reportClientError("CleaningSettings", "Template save failed", err);
        } finally {
            setSavingTemplate(false);
        }
    }, [savingTemplate, templateName, editingTemplate, fetchAll]);

    const toggleTemplateActive = useCallback(
        async (tpl: CleaningTemplate) => {
            try {
                const res = await fetch("/api/ga/cleaning/templates", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: tpl.id, isActive: !tpl.isActive }),
                });
                if (!res.ok) {
                    throw new Error(
                        await getResponseErrorMessage(res, "Gagal mengubah status template.")
                    );
                }
                toastRef.current(
                    tpl.isActive ? "Template dinonaktifkan." : "Template diaktifkan.",
                    "success"
                );
                await fetchAll();
            } catch (err) {
                toastRef.current(
                    toFriendlyCleaningError(
                        err,
                        "Gagal mengubah status template. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [fetchAll]
    );

    // ─── Template item CRUD ───────────────────────────────

    const saveTemplateItem = useCallback(
        async (templateId: string) => {
            if (savingItem) return;
            if (!itemName.trim()) {
                toastRef.current("Nama poin pemeriksaan wajib diisi.", "warning");
                return;
            }
            setSavingItem(true);
            try {
                const res = await fetch("/api/ga/cleaning/template-items", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ templateId, name: itemName.trim() }),
                });
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal menambah item."));
                }
                toastRef.current("Item ditambahkan.", "success");
                setShowItemForm(null);
                setItemName("");
                await fetchAll();
            } catch (err) {
                toastRef.current(
                    toFriendlyCleaningError(
                        err,
                        "Gagal menambah item. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            } finally {
                setSavingItem(false);
            }
        },
        [savingItem, itemName, fetchAll]
    );

    const toggleItemActive = useCallback(
        async (item: CleaningTemplateItem) => {
            try {
                const res = await fetch("/api/ga/cleaning/template-items", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
                });
                if (!res.ok) {
                    throw new Error(
                        await getResponseErrorMessage(res, "Gagal mengubah status item.")
                    );
                }
                toastRef.current(
                    item.isActive ? "Item dinonaktifkan." : "Item diaktifkan.",
                    "success"
                );
                await fetchAll();
            } catch (err) {
                toastRef.current(
                    toFriendlyCleaningError(
                        err,
                        "Gagal mengubah status item. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [fetchAll]
    );

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
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan ruangan."));
            }
            toastRef.current(isEdit ? "Ruangan diperbarui." : "Ruangan dibuat.", "success");
            setShowRoomForm(false);
            setEditingRoom(null);
            setRoomName("");
            setRoomTemplateId("");
            await fetchAll();
        } catch (err) {
            toastRef.current(
                toFriendlyCleaningError(
                    err,
                    "Gagal menyimpan ruangan. Periksa koneksi Anda lalu coba lagi."
                ),
                "error"
            );
            reportClientError("CleaningSettings", "Room save failed", err);
        } finally {
            setSavingRoom(false);
        }
    }, [savingRoom, roomName, roomTemplateId, editingRoom, fetchAll]);

    const toggleRoomActive = useCallback(
        async (room: CleaningRoom) => {
            try {
                const res = await fetch("/api/ga/cleaning/rooms", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: room.id, isActive: !room.isActive }),
                });
                if (!res.ok) {
                    throw new Error(
                        await getResponseErrorMessage(res, "Gagal mengubah status ruangan.")
                    );
                }
                toastRef.current(
                    room.isActive ? "Ruangan dinonaktifkan." : "Ruangan diaktifkan.",
                    "success"
                );
                await fetchAll();
            } catch (err) {
                toastRef.current(
                    toFriendlyCleaningError(
                        err,
                        "Gagal mengubah status ruangan. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [fetchAll]
    );

    // ─── Hapus master yang belum dipakai ──────────────────

    const deleteMaster = useCallback(
        (kind: "template" | "item" | "room", id: string, label: string) => {
            const endpoint =
                kind === "template"
                    ? "/api/ga/cleaning/templates"
                    : kind === "item"
                        ? "/api/ga/cleaning/template-items"
                        : "/api/ga/cleaning/rooms";

            confirm({
                title: `Hapus ${label}?`,
                message: "Hanya data yang belum pernah dipakai dalam inspeksi yang dapat dihapus.",
                confirmLabel: "Hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: async () => {
                    try {
                        const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, {
                            method: "DELETE",
                        });
                        if (!res.ok) {
                            throw new Error(
                                await getResponseErrorMessage(res, `Gagal menghapus ${label}.`)
                            );
                        }
                        toastRef.current(`${label} dihapus.`, "success");
                        await fetchAll();
                    } catch (err) {
                        toastRef.current(
                            toFriendlyCleaningError(
                                err,
                                `Gagal menghapus ${label}. Periksa koneksi Anda lalu coba lagi.`
                            ),
                            "error"
                        );
                        reportClientError("CleaningSettings", `Delete ${kind} failed`, err);
                    }
                },
            });
        },
        [confirm, fetchAll]
    );

    // ─── Assignment CRUD ──────────────────────────────────

    const openAssignModal = useCallback(
        (preselectedRoomIds: string[] = []) => {
            setShowAssignForm(true);
            setBulkAssignRoomIds(preselectedRoomIds);
            setBulkAssignUserIds([]);
            setAssignWorkerType("INTERNAL");
            setAssignApplyToday(false);
            setBulkResult(null);
            void fetchAvailableUsers("INTERNAL");
        },
        [fetchAvailableUsers]
    );

    const saveBulkAssignment = useCallback(async () => {
        if (savingAssign || bulkAssignRoomIds.length === 0 || bulkAssignUserIds.length === 0) {
            return;
        }
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
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan penugasan."));
            }
            const json = await res.json();
            const data: BulkAssignResult = json.data ?? { created: [], skipped: [], failed: [] };
            setBulkResult(data);
            const total = data.created.length + data.skipped.length + data.failed.length;
            toastRef.current(
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
            toastRef.current(
                toFriendlyCleaningError(
                    err,
                    "Gagal menyimpan penugasan. Periksa koneksi Anda lalu coba lagi."
                ),
                "error"
            );
        } finally {
            setSavingAssign(false);
        }
    }, [savingAssign, bulkAssignRoomIds, bulkAssignUserIds, assignWorkerType, assignApplyToday, fetchAll]);

    const submitEndAssignment = useCallback(
        async (assignment: CleaningAssignment, reason: string, isPlanned: boolean) => {
            setEndingSaving(true);
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
                if (!res.ok) {
                    throw new Error(
                        await getResponseErrorMessage(res, "Gagal mengakhiri penugasan.")
                    );
                }
                toastRef.current(
                    isPlanned ? "Jadwal penugasan dibatalkan." : "Penugasan diakhiri.",
                    "success"
                );
                setEndingTarget(null);
                await fetchAll();
            } catch (err) {
                toastRef.current(
                    toFriendlyCleaningError(
                        err,
                        "Gagal mengakhiri penugasan. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            } finally {
                setEndingSaving(false);
            }
        },
        [fetchAll]
    );

    const requestRemoveAssignment = useCallback(
        (assignment: CleaningAssignment, targetRoomName: string) => {
            const todayStr = toWIBDateString();
            const isPlanned = assignment.startsOnWibDate > todayStr;

            if (isPlanned) {
                confirm({
                    title: `Batalkan jadwal ${assignment.user.displayName}?`,
                    message: `Jadwal untuk ruangan ${targetRoomName} mulai ${formatCleaningWibDate(
                        assignment.startsOnWibDate
                    )} akan dibatalkan.`,
                    confirmLabel: "Batalkan Jadwal",
                    cancelLabel: "Kembali",
                    variant: "warning",
                    onConfirm: async () => {
                        await submitEndAssignment(assignment, "Dibatalkan oleh GA", true);
                    },
                });
            } else {
                setEndingTarget({ assignment, roomName: targetRoomName });
            }
        },
        [confirm, submitEndAssignment]
    );

    // ─── Outsource users management ───────────────────────

    const fetchOutsourceUsers = useCallback(async () => {
        setLoadingOutsource(true);
        try {
            const res = await fetch("/api/ga/cleaning/outsource-users");
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal memuat daftar petugas outsource.")
                );
            }
            const json = await res.json();
            setOutsourceUsers(json.data ?? []);
        } catch (err) {
            const msg = toFriendlyCleaningError(
                err,
                "Gagal memuat daftar petugas outsource. Periksa koneksi Anda lalu coba lagi."
            );
            reportClientError("CleaningSettingsOutsourceUsers", msg, err);
            toastRef.current(msg, "error");
        } finally {
            setLoadingOutsource(false);
        }
    }, []);

    const handleCreateOutsourceUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const username = newOutsourceUsername.trim().toLowerCase();
        const displayName = newOutsourceDisplayName.trim();
        if (!username) {
            toastRef.current("Username wajib diisi.", "error");
            return;
        }
        if (!displayName) {
            toastRef.current("Nama lengkap wajib diisi.", "error");
            return;
        }
        if (newOutsourcePassword.length < 8) {
            toastRef.current("Kata sandi minimal 8 karakter.", "error");
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
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal membuat akun outsource.")
                );
            }

            const json = await res.json();
            toastRef.current("Akun outsource berhasil dibuat.", "success");
            setNewOutsourceUsername("");
            setNewOutsourceDisplayName("");
            setNewOutsourceEmail("");
            setNewOutsourcePassword("");

            await Promise.all([fetchOutsourceUsers(), fetchAvailableUsers("OUTSOURCE")]);

            if (json.data?.id && showAssignForm) {
                setAssignWorkerType("OUTSOURCE");
                setBulkAssignUserIds([json.data.id]);
            }
        } catch (err) {
            toastRef.current(
                toFriendlyCleaningError(
                    err,
                    "Gagal membuat akun outsource. Periksa koneksi Anda lalu coba lagi."
                ),
                "error"
            );
        } finally {
            setSavingOutsource(false);
        }
    };

    // ─── Derived counts & filtered lists ──────────────────

    const activeTemplates = useMemo(() => templates.filter((t) => t.isActive), [templates]);
    const activeRooms = useMemo(() => rooms.filter((r) => r.isActive), [rooms]);

    const totalActiveAssignments = useMemo(
        () =>
            activeRooms.reduce(
                (sum, room) => sum + getVisibleAssignments(room.assignments).length,
                0
            ),
        [activeRooms]
    );

    const roomTemplateOptions = useMemo(() => {
        if (editingRoom && !activeTemplates.some((t) => t.id === editingRoom.template.id)) {
            return [
                ...activeTemplates,
                {
                    ...editingRoom.template,
                    isActive: false,
                    items: [],
                    _count: { rooms: 0 },
                } as CleaningTemplate,
            ];
        }
        return activeTemplates;
    }, [activeTemplates, editingRoom]);

    const filteredRooms = useMemo(() => {
        const q = roomSearch.trim().toLowerCase();
        return rooms.filter((r) => {
            if (roomStatusFilter === "active" && !r.isActive) return false;
            if (roomStatusFilter === "inactive" && r.isActive) return false;
            if (!q) return true;
            return (
                r.name.toLowerCase().includes(q) ||
                r.template.name.toLowerCase().includes(q)
            );
        });
    }, [rooms, roomSearch, roomStatusFilter]);

    const filteredAssignRooms = useMemo(() => {
        const q = assignSearch.trim().toLowerCase();
        return activeRooms.filter((r) => {
            const visible = getVisibleAssignments(r.assignments);
            if (assignRoomFilter === "assigned" && visible.length === 0) return false;
            if (assignRoomFilter === "unassigned" && visible.length > 0) return false;
            if (!q) return true;
            if (r.name.toLowerCase().includes(q)) return true;
            return visible.some(
                (a) =>
                    a.user.displayName.toLowerCase().includes(q) ||
                    a.user.username.toLowerCase().includes(q)
            );
        });
    }, [activeRooms, assignRoomFilter, assignSearch]);

    const workerGroups = useMemo(() => {
        const map = new Map<
            string,
            {
                user: CleaningAssignment["user"];
                workerType: CleaningAssignment["workerType"];
                entries: Array<{ room: CleaningRoom; assignment: CleaningAssignment }>;
            }
        >();

        for (const room of activeRooms) {
            for (const assignment of getVisibleAssignments(room.assignments)) {
                const existing = map.get(assignment.user.id);
                if (existing) {
                    existing.entries.push({ room, assignment });
                } else {
                    map.set(assignment.user.id, {
                        user: assignment.user,
                        workerType: assignment.workerType,
                        entries: [{ room, assignment }],
                    });
                }
            }
        }

        const q = assignSearch.trim().toLowerCase();
        return Array.from(map.values())
            .filter((group) => {
                if (!q) return true;
                return (
                    group.user.displayName.toLowerCase().includes(q) ||
                    group.user.username.toLowerCase().includes(q) ||
                    group.entries.some((e) => e.room.name.toLowerCase().includes(q))
                );
            })
            .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName, "id"));
    }, [activeRooms, assignSearch]);

    const todayStr = toWIBDateString();
    const isSearchingAssign = assignSearch.trim().length > 0;
    const activeRoomKeys =
        assignViewMode === "by-room"
            ? filteredAssignRooms.map((r) => `room:${r.id}`)
            : workerGroups.map((g) => `worker:${g.user.id}`);

    const isAssignCardOpen = (key: string) => {
        if (isSearchingAssign) return true;
        if (key in expandedAssignKeys) return expandedAssignKeys[key];
        return activeRoomKeys.length <= 5;
    };

    const allAssignOpen =
        activeRoomKeys.length > 0 && activeRoomKeys.every((key) => isAssignCardOpen(key));

    const toggleAllAssignCards = () => {
        const next: Record<string, boolean> = { ...expandedAssignKeys };
        const targetState = !allAssignOpen;
        for (const key of activeRoomKeys) {
            next[key] = targetState;
        }
        setExpandedAssignKeys(next);
    };

    const badgeForTab = (key: Tab): string | null => {
        switch (key) {
            case "templates":
                return String(templates.length);
            case "rooms":
                return String(rooms.length);
            case "assignments":
                return String(totalActiveAssignments);
            case "atasan":
                return null;
        }
    };

    // ─── Loading & Error states ───────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{error}</p>
                    <button
                        type="button"
                        onClick={() => void fetchAll()}
                        className="mt-3 text-sm font-medium text-primary hover:underline"
                    >
                        Coba lagi
                    </button>
                </div>
            </div>
        );
    }

    const activeRoomCount = activeRooms.length;
    const inactiveRoomCount = rooms.length - activeRoomCount;

    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="mb-4">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Pengaturan Inspeksi
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Atur daftar pemeriksaan, ruangan, jadwal petugas, dan pemantau kebersihan.
                </p>
            </div>

            {/* Sticky Tab Bar */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur -mx-4 px-4 border-b border-border">
                <div className="flex gap-1 overflow-x-auto no-scrollbar -mb-px">
                    {TAB_ITEMS.map(({ key, label, icon: Icon }) => {
                        const active = activeTab === key;
                        const badge = badgeForTab(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveTab(key)}
                                aria-current={active ? "page" : undefined}
                                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
                                    active
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{label}</span>
                                {badge !== null && (
                                    <span
                                        aria-hidden="true"
                                        className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-full leading-none ${
                                            active
                                                ? "bg-primary/15 text-primary"
                                                : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        {badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="pt-5">
                {/* ─── TAB 1: TEMPLATE ──────────────────────────────── */}
                {activeTab === "templates" && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <p className="text-sm text-muted-foreground">
                                Template menentukan daftar poin kebersihan yang diisi petugas pada setiap ruangan.
                            </p>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowTemplateForm(true);
                                    setEditingTemplate(null);
                                    setTemplateName("");
                                }}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0 min-h-[42px]"
                            >
                                <Plus className="h-4 w-4" />
                                Tambah Template
                            </button>
                        </div>

                        {templates.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                    Belum ada template checklist.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Klik Tambah Template untuk membuat daftar pemeriksaan pertama.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {templates.map((tpl) => {
                                    const expanded = expandedTemplate === tpl.id;
                                    const activeItemCount = tpl.items.filter((i) => i.isActive).length;
                                    return (
                                        <section
                                            key={tpl.id}
                                            className="bg-card border border-border rounded-xl overflow-hidden"
                                        >
                                            <div className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-accent/20 transition-colors">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setExpandedTemplate(expanded ? null : tpl.id)
                                                    }
                                                    aria-expanded={expanded}
                                                    className="flex items-center gap-2.5 text-left flex-1 min-w-0 min-h-[36px]"
                                                >
                                                    {expanded ? (
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    )}
                                                    <span className="font-semibold text-sm text-foreground truncate">
                                                        {tpl.name}
                                                    </span>
                                                    <span
                                                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                                                            tpl.isActive
                                                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                                : "bg-muted text-muted-foreground"
                                                        }`}
                                                    >
                                                        {tpl.isActive ? "Aktif" : "Nonaktif"}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                                                        {tpl._count.rooms} ruangan · {activeItemCount}/
                                                        {tpl.items.length} item aktif
                                                    </span>
                                                </button>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowTemplateForm(true);
                                                            setEditingTemplate(tpl);
                                                            setTemplateName(tpl.name);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px]"
                                                        title="Ubah nama template"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        <span className="hidden sm:inline">Ubah</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void toggleTemplateActive(tpl)}
                                                        className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[36px]"
                                                    >
                                                        {tpl.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            deleteMaster(
                                                                "template",
                                                                tpl.id,
                                                                `Template "${tpl.name}"`
                                                            )
                                                        }
                                                        className="px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md min-h-[36px]"
                                                        title="Hapus template yang belum dipakai"
                                                    >
                                                        Hapus
                                                    </button>
                                                </div>
                                            </div>

                                            {expanded && (
                                                <div className="border-t border-border px-4 py-3 bg-muted/15 space-y-2.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                            Daftar Poin Kebersihan ({activeItemCount}/
                                                            {tpl.items.length} aktif)
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowItemForm(tpl.id);
                                                                setItemName("");
                                                            }}
                                                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline min-h-[32px]"
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                            Tambah Item
                                                        </button>
                                                    </div>

                                                    {showItemForm === tpl.id && (
                                                        <form
                                                            onSubmit={(e) => {
                                                                e.preventDefault();
                                                                void saveTemplateItem(tpl.id);
                                                            }}
                                                            className="flex flex-col sm:flex-row gap-2"
                                                        >
                                                            <input
                                                                type="text"
                                                                value={itemName}
                                                                onChange={(e) =>
                                                                    setItemName(e.target.value)
                                                                }
                                                                placeholder="Contoh: Kebersihan lantai dan kaca"
                                                                className={`${cleaningInputClass} flex-1`}
                                                                autoFocus
                                                            />
                                                            <div className="flex gap-1.5 shrink-0">
                                                                <button
                                                                    type="submit"
                                                                    disabled={
                                                                        savingItem || !itemName.trim()
                                                                    }
                                                                    className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[36px]"
                                                                >
                                                                    {savingItem
                                                                        ? "Menyimpan..."
                                                                        : "Simpan"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowItemForm(null)}
                                                                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[36px]"
                                                                >
                                                                    Batal
                                                                </button>
                                                            </div>
                                                        </form>
                                                    )}

                                                    {tpl.items.length === 0 ? (
                                                        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                                                            Belum ada poin pemeriksaan di template ini.
                                                        </p>
                                                    ) : (
                                                        <ul className="divide-y divide-border/70 rounded-lg border border-border bg-card">
                                                            {tpl.items.map((item, idx) => (
                                                                <li
                                                                    key={item.id}
                                                                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                                                                >
                                                                    <span
                                                                        className={`min-w-0 flex-1 ${
                                                                            item.isActive
                                                                                ? "text-foreground"
                                                                                : "text-muted-foreground line-through"
                                                                        }`}
                                                                    >
                                                                        <span className="text-muted-foreground mr-1.5">
                                                                            {idx + 1}.
                                                                        </span>
                                                                        {item.name}
                                                                    </span>
                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void toggleItemActive(
                                                                                    item
                                                                                )
                                                                            }
                                                                            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[32px]"
                                                                        >
                                                                            {item.isActive
                                                                                ? "Nonaktifkan"
                                                                                : "Aktifkan"}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                deleteMaster(
                                                                                    "item",
                                                                                    item.id,
                                                                                    `Item "${item.name}"`
                                                                                )
                                                                            }
                                                                            className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-md min-h-[32px]"
                                                                            title="Hapus item yang belum dipakai"
                                                                        >
                                                                            Hapus
                                                                        </button>
                                                                    </div>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB 2: RUANGAN ───────────────────────────────── */}
                {activeTab === "rooms" && (
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                            <div className="relative flex-1">
                                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    type="text"
                                    value={roomSearch}
                                    onChange={(e) => setRoomSearch(e.target.value)}
                                    placeholder="Cari ruangan atau template..."
                                    className={`${cleaningInputClass} pl-9 pr-8`}
                                />
                                {roomSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setRoomSearch("")}
                                        aria-label="Hapus pencarian"
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs shrink-0 self-start sm:self-auto">
                                {(
                                    [
                                        ["all", `Semua (${rooms.length})`],
                                        ["active", `Aktif (${activeRoomCount})`],
                                        ["inactive", `Nonaktif (${inactiveRoomCount})`],
                                    ] as Array<[RoomStatusFilter, string]>
                                ).map(([status, label]) => (
                                    <button
                                        key={status}
                                        type="button"
                                        onClick={() => setRoomStatusFilter(status)}
                                        className={`px-2.5 py-1.5 rounded font-medium min-h-[34px] transition-colors ${
                                            roomStatusFilter === status
                                                ? "bg-background text-primary shadow-sm"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowRoomForm(true);
                                    setEditingRoom(null);
                                    setRoomName("");
                                    setRoomTemplateId(activeTemplates[0]?.id ?? "");
                                }}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0 min-h-[42px]"
                            >
                                <Plus className="h-4 w-4" />
                                Tambah Ruangan
                            </button>
                        </div>

                        {rooms.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                    Belum ada ruangan terdaftar.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Buat template terlebih dahulu, lalu tambahkan ruangan yang akan diperiksa.
                                </p>
                            </div>
                        ) : filteredRooms.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-xl py-8 text-center">
                                <p className="text-sm text-muted-foreground">
                                    Tidak ada ruangan yang cocok dengan filter saat ini.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {filteredRooms.map((room) => {
                                    const activeList = getVisibleAssignments(room.assignments);
                                    return (
                                        <div
                                            key={room.id}
                                            className="bg-card border border-border rounded-xl p-3.5 space-y-2.5"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="font-semibold text-sm text-foreground truncate">
                                                            {room.name}
                                                        </p>
                                                        <span
                                                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                                                room.isActive
                                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                                    : "bg-muted text-muted-foreground"
                                                            }`}
                                                        >
                                                            {room.isActive ? "Aktif" : "Nonaktif"}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        Template: {room.template.name} ·{" "}
                                                        {activeList.length} petugas aktif
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowRoomForm(true);
                                                            setEditingRoom(room);
                                                            setRoomName(room.name);
                                                            setRoomTemplateId(room.template.id);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px]"
                                                        aria-label={`Edit ruangan ${room.name}`}
                                                        title="Ubah ruangan"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        Ubah
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void toggleRoomActive(room)}
                                                        className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[36px]"
                                                    >
                                                        {room.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            deleteMaster(
                                                                "room",
                                                                room.id,
                                                                `Ruangan "${room.name}"`
                                                            )
                                                        }
                                                        className="px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md min-h-[36px]"
                                                        title="Hapus ruangan yang belum memiliki data"
                                                    >
                                                        Hapus
                                                    </button>
                                                </div>
                                            </div>

                                            {activeList.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/60">
                                                    {activeList.map((a) => (
                                                        <span
                                                            key={a.id}
                                                            className="inline-flex items-center gap-1.5 text-xs bg-muted/50 border border-border/70 px-2.5 py-1 rounded-full"
                                                        >
                                                            <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                                                            <span className="font-medium text-foreground">
                                                                {a.user.displayName}
                                                            </span>
                                                            {a.workerType === "OUTSOURCE" && (
                                                                <span className="px-1 py-0.2 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                                                    OS
                                                                </span>
                                                            )}
                                                            {a.endsOnWibDate && (
                                                                <span className="text-amber-700 dark:text-amber-400 font-medium">
                                                                    · berakhir{" "}
                                                                    {formatCleaningWibDate(
                                                                        a.endsOnWibDate
                                                                    )}
                                                                </span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    requestRemoveAssignment(
                                                                        a,
                                                                        room.name
                                                                    )
                                                                }
                                                                className="text-muted-foreground hover:text-destructive ml-0.5 leading-none"
                                                                title="Akhiri atau batalkan penugasan"
                                                                aria-label={`Akhiri penugasan ${a.user.displayName}`}
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB 3: PENUGASAN ─────────────────────────────── */}
                {activeTab === "assignments" && (
                    <div className="space-y-4">
                        {/* Toolbar */}
                        <div className="flex flex-col gap-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                                <div className="relative flex-1">
                                    <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="text"
                                        value={assignSearch}
                                        onChange={(e) => setAssignSearch(e.target.value)}
                                        placeholder="Cari nama ruangan atau petugas..."
                                        className={`${cleaningInputClass} pl-9 pr-8`}
                                    />
                                    {assignSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setAssignSearch("")}
                                            aria-label="Hapus pencarian"
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowOutsourceModal(true);
                                            void fetchOutsourceUsers();
                                        }}
                                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted text-foreground min-h-[42px]"
                                    >
                                        <UserPlus className="h-4 w-4 text-primary" />
                                        Petugas Outsource
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openAssignModal()}
                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 min-h-[42px]"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Tugaskan
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Tampilan Per Ruangan / Per Petugas */}
                                    <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                                        {(
                                            [
                                                ["by-room", "Per Ruangan"],
                                                ["by-worker", "Per Petugas"],
                                            ] as Array<[AssignmentViewMode, string]>
                                        ).map(([mode, label]) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setAssignViewMode(mode)}
                                                className={`px-2.5 py-1 rounded font-medium min-h-[30px] transition-colors ${
                                                    assignViewMode === mode
                                                        ? "bg-background text-primary shadow-sm"
                                                        : "text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    {assignViewMode === "by-room" && (
                                        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                                            {(
                                                [
                                                    ["all", "Semua"],
                                                    ["assigned", "Ada Petugas"],
                                                    ["unassigned", "Belum Ada"],
                                                ] as Array<[AssignmentRoomFilter, string]>
                                            ).map(([f, label]) => (
                                                <button
                                                    key={f}
                                                    type="button"
                                                    onClick={() => setAssignRoomFilter(f)}
                                                    className={`px-2.5 py-1 rounded font-medium min-h-[30px] transition-colors ${
                                                        assignRoomFilter === f
                                                            ? "bg-background text-primary shadow-sm"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {activeRoomKeys.length > 1 && !isSearchingAssign && (
                                    <button
                                        type="button"
                                        onClick={toggleAllAssignCards}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        {allAssignOpen ? "Tutup semua" : "Buka semua"}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* View A: Per Ruangan */}
                        {assignViewMode === "by-room" && (
                            <div className="space-y-2.5">
                                {activeRooms.length === 0 ? (
                                    <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center space-y-1">
                                        <p className="text-sm font-medium text-foreground">
                                            Belum ada ruangan aktif.
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Aktifkan atau tambahkan ruangan di tab Ruangan terlebih dahulu.
                                        </p>
                                    </div>
                                ) : filteredAssignRooms.length === 0 ? (
                                    <div className="bg-card border border-dashed border-border rounded-xl py-8 text-center">
                                        <p className="text-sm text-muted-foreground">
                                            Tidak ada ruangan yang cocok dengan filter saat ini.
                                        </p>
                                    </div>
                                ) : (
                                    filteredAssignRooms.map((room) => {
                                        const activeList = getVisibleAssignments(room.assignments);
                                        const cardKey = `room:${room.id}`;
                                        const open = isAssignCardOpen(cardKey);
                                        return (
                                            <section
                                                key={room.id}
                                                className="bg-card border border-border rounded-xl overflow-hidden"
                                            >
                                                <div className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-accent/20 transition-colors">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedAssignKeys((prev) => ({
                                                                ...prev,
                                                                [cardKey]: !open,
                                                            }))
                                                        }
                                                        aria-expanded={open}
                                                        className="flex items-center gap-2.5 text-left flex-1 min-w-0 min-h-[34px]"
                                                    >
                                                        {open ? (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        )}
                                                        <span className="font-semibold text-sm text-foreground truncate">
                                                            {room.name}
                                                        </span>
                                                        <span
                                                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                                                                activeList.length > 0
                                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                            }`}
                                                        >
                                                            {activeList.length > 0
                                                                ? `${activeList.length} petugas`
                                                                : "Belum ada petugas"}
                                                        </span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => openAssignModal([room.id])}
                                                        aria-label={`Tambah petugas untuk ${room.name}`}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-md shrink-0 min-h-[34px]"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                        <span className="hidden sm:inline">
                                                            Tambah petugas
                                                        </span>
                                                    </button>
                                                </div>

                                                {open && (
                                                    <div className="border-t border-border px-4 py-2.5 bg-muted/10">
                                                        {activeList.length === 0 ? (
                                                            <p className="text-xs text-muted-foreground py-2">
                                                                Belum ada petugas yang dijadwalkan di ruangan ini.
                                                            </p>
                                                        ) : (
                                                            <ul className="divide-y divide-border/60">
                                                                {activeList.map((a) => {
                                                                    const isPlanned =
                                                                        a.startsOnWibDate > todayStr;
                                                                    return (
                                                                        <li
                                                                            key={a.id}
                                                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
                                                                        >
                                                                            <div className="min-w-0 space-y-0.5">
                                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                                    <span className="text-sm font-medium text-foreground">
                                                                                        {a.user.displayName}
                                                                                    </span>
                                                                                    {a.workerType ===
                                                                                        "OUTSOURCE" && (
                                                                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                                                                            OS
                                                                                        </span>
                                                                                    )}
                                                                                    <span className="text-xs text-muted-foreground font-mono">
                                                                                        @{a.user.username}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    {isPlanned ? (
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                                                            Mulai{" "}
                                                                                            {formatCleaningWibDate(
                                                                                                a.startsOnWibDate
                                                                                            )}
                                                                                        </span>
                                                                                    ) : a.endsOnWibDate ? (
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                                                            Berakhir{" "}
                                                                                            {formatCleaningWibDate(
                                                                                                a.endsOnWibDate
                                                                                            )}{" "}
                                                                                            · aktif hari ini
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-xs text-muted-foreground">
                                                                                            Aktif sejak{" "}
                                                                                            {formatCleaningWibDate(
                                                                                                a.startsOnWibDate
                                                                                            )}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    requestRemoveAssignment(
                                                                                        a,
                                                                                        room.name
                                                                                    )
                                                                                }
                                                                                className={`self-start sm:self-center shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors min-h-[34px] ${
                                                                                    isPlanned
                                                                                        ? "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                                                                                        : "text-destructive hover:bg-destructive/10"
                                                                                }`}
                                                                            >
                                                                                {isPlanned
                                                                                    ? "Batalkan Jadwal"
                                                                                    : "Akhiri"}
                                                                            </button>
                                                                        </li>
                                                                    );
                                                                })}
                                                            </ul>
                                                        )}
                                                    </div>
                                                )}
                                            </section>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* View B: Per Petugas */}
                        {assignViewMode === "by-worker" && (
                            <div className="space-y-2.5">
                                {workerGroups.length === 0 ? (
                                    <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center space-y-1">
                                        <p className="text-sm font-medium text-foreground">
                                            {assignSearch.trim()
                                                ? "Tidak ada petugas yang cocok dengan pencarian."
                                                : "Belum ada penugasan aktif."}
                                        </p>
                                        {!assignSearch.trim() && (
                                            <p className="text-xs text-muted-foreground">
                                                Klik Tugaskan untuk menjadwalkan petugas ke ruangan.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    workerGroups.map((group) => {
                                        const cardKey = `worker:${group.user.id}`;
                                        const open = isAssignCardOpen(cardKey);
                                        return (
                                            <section
                                                key={group.user.id}
                                                className="bg-card border border-border rounded-xl overflow-hidden"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setExpandedAssignKeys((prev) => ({
                                                            ...prev,
                                                            [cardKey]: !open,
                                                        }))
                                                    }
                                                    aria-expanded={open}
                                                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-accent/20 transition-colors min-h-[48px]"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        {open ? (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        )}
                                                        <span className="font-semibold text-sm text-foreground truncate">
                                                            {group.user.displayName}
                                                        </span>
                                                        {group.workerType === "OUTSOURCE" && (
                                                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 shrink-0">
                                                                OS
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                                                            @{group.user.username}
                                                        </span>
                                                    </div>
                                                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                                                        {group.entries.length} ruangan
                                                    </span>
                                                </button>

                                                {open && (
                                                    <div className="border-t border-border px-4 py-2.5 bg-muted/10">
                                                        <ul className="divide-y divide-border/60">
                                                            {group.entries.map(
                                                                ({ room, assignment }) => {
                                                                    const isPlanned =
                                                                        assignment.startsOnWibDate >
                                                                        todayStr;
                                                                    return (
                                                                        <li
                                                                            key={assignment.id}
                                                                            className="flex items-center justify-between gap-2 py-2 first:pt-1 last:pb-1"
                                                                        >
                                                                            <div className="min-w-0">
                                                                                <p className="text-sm font-medium text-foreground truncate">
                                                                                    {room.name}
                                                                                </p>
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {isPlanned
                                                                                        ? `Mulai ${formatCleaningWibDate(assignment.startsOnWibDate)}`
                                                                                        : assignment.endsOnWibDate
                                                                                            ? `Berakhir ${formatCleaningWibDate(assignment.endsOnWibDate)} · aktif hari ini`
                                                                                            : `Aktif sejak ${formatCleaningWibDate(assignment.startsOnWibDate)}`}
                                                                                </p>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    requestRemoveAssignment(
                                                                                        assignment,
                                                                                        room.name
                                                                                    )
                                                                                }
                                                                                className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors min-h-[34px] ${
                                                                                    isPlanned
                                                                                        ? "text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                                                                                        : "text-destructive hover:bg-destructive/10"
                                                                                }`}
                                                                            >
                                                                                {isPlanned
                                                                                    ? "Batalkan Jadwal"
                                                                                    : "Akhiri"}
                                                                            </button>
                                                                        </li>
                                                                    );
                                                                }
                                                            )}
                                                        </ul>
                                                    </div>
                                                )}
                                            </section>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── TAB 4: PEMERIKSA & ATASAN ────────────────────── */}
                {activeTab === "atasan" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        <DefaultReviewerCard />
                        <TopViewerCard />
                    </div>
                )}
            </div>

            {/* ─── MODAL: TAMBAH / UBAH TEMPLATE ───────────────────── */}
            {showTemplateForm && (
                <AccessibleModal
                    ariaLabel={editingTemplate ? "Ubah Template" : "Template Baru"}
                    onClose={() => {
                        setShowTemplateForm(false);
                        setEditingTemplate(null);
                    }}
                    className="!max-w-md !p-6"
                >
                    <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                        <h2 className="modal-title">
                            {editingTemplate ? "Ubah Template" : "Template Baru"}
                        </h2>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => {
                                setShowTemplateForm(false);
                                setEditingTemplate(null);
                            }}
                            aria-label="Tutup jendela"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void saveTemplate();
                        }}
                        className="space-y-4"
                    >
                        <div>
                            <label
                                htmlFor="cleaning-tpl-name"
                                className="block text-xs font-medium text-foreground mb-1"
                            >
                                Nama template
                            </label>
                            <input
                                id="cleaning-tpl-name"
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="Contoh: Kebersihan Ruang Kantor"
                                required
                                className={cleaningInputClass}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowTemplateForm(false);
                                    setEditingTemplate(null);
                                }}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[40px]"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={savingTemplate || !templateName.trim()}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[40px]"
                            >
                                {savingTemplate ? "Menyimpan..." : "Simpan"}
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}

            {/* ─── MODAL: TAMBAH / EDIT RUANGAN ────────────────────── */}
            {showRoomForm && (
                <AccessibleModal
                    ariaLabel={editingRoom ? "Edit Ruangan" : "Tambah Ruangan"}
                    onClose={() => {
                        setShowRoomForm(false);
                        setEditingRoom(null);
                    }}
                    className="!max-w-md !p-6"
                >
                    <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">
                                {editingRoom ? "Edit Ruangan" : "Ruangan Baru"}
                            </h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                {editingRoom
                                    ? "Ubah nama ruangan atau template checklist yang digunakan."
                                    : "Daftarkan ruangan baru beserta template checklist yang digunakan."}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => {
                                setShowRoomForm(false);
                                setEditingRoom(null);
                            }}
                            aria-label="Tutup jendela"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void saveRoom();
                        }}
                        className="space-y-3"
                    >
                        <div>
                            <label
                                className="block text-xs font-medium text-foreground mb-1"
                                htmlFor="room-name"
                            >
                                Nama ruangan
                            </label>
                            <input
                                id="room-name"
                                type="text"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="Contoh: Ruang Resepsionis"
                                required
                                className={cleaningInputClass}
                            />
                        </div>
                        <div>
                            <label
                                className="block text-xs font-medium text-foreground mb-1"
                                htmlFor="room-template"
                            >
                                Template checklist
                            </label>
                            <select
                                id="room-template"
                                value={roomTemplateId}
                                onChange={(e) => setRoomTemplateId(e.target.value)}
                                className={cleaningInputClass}
                            >
                                <option value="">Pilih template</option>
                                {roomTemplateOptions.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                        {t.isActive ? "" : " (nonaktif)"}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRoomForm(false);
                                    setEditingRoom(null);
                                }}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[40px]"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={savingRoom || !roomName.trim() || !roomTemplateId}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[40px]"
                            >
                                {savingRoom && <Loader2 className="h-4 w-4 animate-spin" />}
                                Simpan
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}

            {/* ─── MODAL: PENUGASAN BARU ───────────────────────────── */}
            {showAssignForm && (
                <BulkAssignModal
                    activeRooms={activeRooms}
                    availableUsers={availableUsers}
                    selectedRoomIds={bulkAssignRoomIds}
                    setSelectedRoomIds={setBulkAssignRoomIds}
                    selectedUserIds={bulkAssignUserIds}
                    setSelectedUserIds={setBulkAssignUserIds}
                    workerType={assignWorkerType}
                    onChangeWorkerType={(wt) => {
                        setAssignWorkerType(wt);
                        setBulkAssignUserIds([]);
                        void fetchAvailableUsers(wt);
                    }}
                    applyToToday={assignApplyToday}
                    setApplyToToday={setAssignApplyToday}
                    saving={savingAssign}
                    result={bulkResult}
                    onSubmit={() => void saveBulkAssignment()}
                    onOpenOutsourceModal={() => {
                        setShowOutsourceModal(true);
                        void fetchOutsourceUsers();
                    }}
                    onClose={() => {
                        setShowAssignForm(false);
                        setBulkResult(null);
                    }}
                />
            )}

            {/* ─── MODAL: AKHIRI PENUGASAN ─────────────────────────── */}
            {endingTarget && (
                <EndAssignmentModal
                    assignment={endingTarget.assignment}
                    roomName={endingTarget.roomName}
                    saving={endingSaving}
                    onConfirm={(reason) =>
                        void submitEndAssignment(endingTarget.assignment, reason, false)
                    }
                    onClose={() => {
                        if (!endingSaving) setEndingTarget(null);
                    }}
                />
            )}

            {/* ─── MODAL: KELOLA PETUGAS OUTSOURCE ─────────────────── */}
            {showOutsourceModal && (
                <OutsourceUsersModal
                    outsourceUsers={outsourceUsers}
                    loadingOutsource={loadingOutsource}
                    username={newOutsourceUsername}
                    setUsername={setNewOutsourceUsername}
                    displayName={newOutsourceDisplayName}
                    setDisplayName={setNewOutsourceDisplayName}
                    email={newOutsourceEmail}
                    setEmail={setNewOutsourceEmail}
                    password={newOutsourcePassword}
                    setPassword={setNewOutsourcePassword}
                    saving={savingOutsource}
                    onSubmit={(e) => void handleCreateOutsourceUser(e)}
                    onClose={() => setShowOutsourceModal(false)}
                />
            )}
        </div>
    );
}
