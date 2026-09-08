"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import {
    Cake,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Mail,
    Settings,
    CheckCircle2,
    AlertCircle,
    Sliders,
    Search,
    RefreshCw,
    Plus,
    Trash2,
    Edit3,
    Send,
    User,
    Sparkles,
    Filter,
    X,
    Users,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import AccessibleModal from "@/components/ui/AccessibleModal";
import type {
    BirthdayOverviewResult,
    BirthdayEmployeeDetail,
    BirthdayPreparationInfo,
} from "@/lib/birthdayUtils";

interface StatusItem {
    id: string;
    name: string;
    color: string;
    order: number;
    isDefault: boolean;
    isActive: boolean;
}

interface ReminderSettings {
    id: string;
    isEmailEnabled: boolean;
    recipientEmails: string;
    reminderDays: string;
    lastRunAt?: string | null;
}

const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const PRESET_COLORS = [
    "#0284c7", // Blue
    "#eab308", // Yellow
    "#16a34a", // Green
    "#800020", // Burgundy
    "#8b5cf6", // Purple
    "#ec4899", // Pink
    "#f97316", // Orange
    "#64748b", // Slate
];

export default function BirthdayManagementPage() {
    const toast = useToast();

    // Data State
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<BirthdayOverviewResult | null>(null);
    const [statuses, setStatuses] = useState<StatusItem[]>([]);
    const [settings, setSettings] = useState<ReminderSettings | null>(null);
    const [isSmtpReady, setIsSmtpReady] = useState(false);

    // Selected View Filters
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
    const [activeTab, setActiveTab] = useState<"overview" | "upcoming" | "directory">("overview");

    // Sub-filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [upcomingMilestoneFilter, setUpcomingMilestoneFilter] = useState<string>("ALL");

    // Modals
    const [selectedEmployeeForPrep, setSelectedEmployeeForPrep] = useState<BirthdayEmployeeDetail | null>(null);
    const [prepModalOpen, setPrepModalOpen] = useState(false);
    const [prepStatusId, setPrepStatusId] = useState<string>("");
    const [prepNotes, setPrepNotes] = useState<string>("");
    const [savingPrep, setSavingPrep] = useState(false);

    // Settings Modal
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [editIsEmailEnabled, setEditIsEmailEnabled] = useState(false);
    const [editRecipientEmails, setEditRecipientEmails] = useState("");
    const [editReminderDays, setEditReminderDays] = useState("30,14,7");
    const [savingSettings, setSavingSettings] = useState(false);

    // Status Management Modal
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [newStatusName, setNewStatusName] = useState("");
    const [newStatusColor, setNewStatusColor] = useState("#0284c7");
    const [newStatusOrder, setNewStatusOrder] = useState<number>(1);
    const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
    const [savingStatus, setSavingStatus] = useState(false);
    const [statusToDelete, setStatusToDelete] = useState<StatusItem | null>(null);
    const [deletingStatus, setDeletingStatus] = useState(false);

    // Test Email Modal
    const [testEmailModalOpen, setTestEmailModalOpen] = useState(false);
    const [testEmailRecipients, setTestEmailRecipients] = useState("daffatgi02@gmail.com");
    const [sendingTestEmail, setSendingTestEmail] = useState(false);

    // Stable Modal Close Callbacks
    const closePrepModal = useCallback(() => setPrepModalOpen(false), []);
    const closeSettingsModal = useCallback(() => setSettingsModalOpen(false), []);
    const closeStatusModal = useCallback(() => setStatusModalOpen(false), []);
    const closeTestEmailModal = useCallback(() => setTestEmailModalOpen(false), []);

    // Fetch Overview Data
    const loadOverview = useCallback(async (month: number, year: number) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/birthdays?month=${month}&year=${year}`);
            if (!res.ok) throw new Error("Gagal mengambil data ulang tahun.");
            const data = await res.json();
            if (data.success) {
                setOverview(data.data);
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal memuat data", "error");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    // Fetch Statuses & Settings
    const loadStatusesAndSettings = useCallback(async () => {
        try {
            const [statusRes, settingRes] = await Promise.all([
                fetch("/api/birthdays/statuses"),
                fetch("/api/birthdays/settings"),
            ]);

            if (statusRes.ok) {
                const sData = await statusRes.json();
                if (sData.success) setStatuses(sData.data);
            }

            if (settingRes.ok) {
                const setJson = await settingRes.json();
                if (setJson.success && setJson.data) {
                    setSettings(setJson.data);
                    setIsSmtpReady(Boolean(setJson.isSmtpConfigured));
                    setEditIsEmailEnabled(Boolean(setJson.data.isEmailEnabled));
                    setEditRecipientEmails(setJson.data.recipientEmails || "");
                    setEditReminderDays(setJson.data.reminderDays || "30,14,7");
                    setTestEmailRecipients(setJson.data.recipientEmails || "");
                }
            }
        } catch (error) {
            console.error("Failed to fetch auxiliary birthday data:", error);
        }
    }, []);

    useEffect(() => {
        void loadOverview(selectedMonth, selectedYear);
    }, [loadOverview, selectedMonth, selectedYear]);

    useEffect(() => {
        void loadStatusesAndSettings();
    }, [loadStatusesAndSettings]);

    // Handlers for month navigation
    const handlePrevMonth = () => {
        if (selectedMonth === 1) {
            setSelectedMonth(12);
            setSelectedYear((y) => y - 1);
        } else {
            setSelectedMonth((m) => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (selectedMonth === 12) {
            setSelectedMonth(1);
            setSelectedYear((y) => y + 1);
        } else {
            setSelectedMonth((m) => m + 1);
        }
    };

    // Open Preparation Modal
    const handleOpenPrepModal = (emp: BirthdayEmployeeDetail) => {
        setSelectedEmployeeForPrep(emp);
        setPrepStatusId(emp.preparation?.statusId || "");
        setPrepNotes(emp.preparation?.notes || "");
        setPrepModalOpen(true);
    };

    // Save Preparation
    const handleSavePreparation = async () => {
        if (!selectedEmployeeForPrep) return;
        setSavingPrep(true);
        try {
            const res = await fetch("/api/birthdays/preparation", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: selectedEmployeeForPrep.employeeId,
                    year: selectedYear,
                    statusId: prepStatusId || null,
                    notes: prepNotes || null,
                }),
            });

            if (!res.ok) throw new Error("Gagal memperbarui status persiapan.");
            const json = await res.json();

            if (json.success) {
                toast(`Status persiapan ${selectedEmployeeForPrep.name} berhasil diperbarui.`, "success");
                setPrepModalOpen(false);
                void loadOverview(selectedMonth, selectedYear);
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menyimpan persiapan.", "error");
        } finally {
            setSavingPrep(false);
        }
    };

    // Quick Status Change from Dropdown
    const handleQuickStatusChange = async (emp: BirthdayEmployeeDetail, newStatusId: string) => {
        try {
            const res = await fetch("/api/birthdays/preparation", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: emp.employeeId,
                    year: selectedYear,
                    statusId: newStatusId || null,
                    notes: emp.preparation?.notes || null,
                }),
            });
            if (!res.ok) throw new Error("Gagal mengubah status.");
            toast(`Status persiapan ${emp.name} diperbarui.`, "success");
            void loadOverview(selectedMonth, selectedYear);
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal mengubah status.", "error");
        }
    };

    // Save Settings
    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            const res = await fetch("/api/birthdays/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    isEmailEnabled: editIsEmailEnabled,
                    recipientEmails: editRecipientEmails,
                    reminderDays: editReminderDays,
                }),
            });
            if (!res.ok) throw new Error("Gagal menyimpan pengaturan.");
            const json = await res.json();
            if (json.success) {
                setSettings(json.data);
                toast("Pengaturan email reminder berhasil disimpan.", "success");
                setSettingsModalOpen(false);
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.", "error");
        } finally {
            setSavingSettings(false);
        }
    };

    // Add / Update Status
    const handleSaveStatusItem = async () => {
        if (!newStatusName.trim()) {
            toast("Nama status tidak boleh kosong.", "warning");
            return;
        }
        setSavingStatus(true);
        try {
            if (editingStatusId) {
                const res = await fetch(`/api/birthdays/statuses/${editingStatusId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: newStatusName,
                        color: newStatusColor,
                        order: newStatusOrder,
                    }),
                });
                if (!res.ok) throw new Error("Gagal memperbarui status.");
                toast("Status berhasil diperbarui.", "success");
            } else {
                const res = await fetch("/api/birthdays/statuses", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: newStatusName,
                        color: newStatusColor,
                        order: newStatusOrder,
                    }),
                });
                if (!res.ok) throw new Error("Gagal menambahkan status baru.");
                toast("Status baru berhasil ditambahkan.", "success");
            }
            setNewStatusName("");
            setNewStatusColor("#0284c7");
            setNewStatusOrder(statuses.length + 1);
            setEditingStatusId(null);
            void loadStatusesAndSettings();
            void loadOverview(selectedMonth, selectedYear);
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menyimpan status.", "error");
        } finally {
            setSavingStatus(false);
        }
    };

    // Delete Status
    // Delete Status with In-App Confirmation
    const handleConfirmDeleteStatus = async () => {
        if (!statusToDelete) return;
        setDeletingStatus(true);
        try {
            const res = await fetch(`/api/birthdays/statuses/${statusToDelete.id}`, { method: "DELETE" });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.message || "Gagal menghapus status.");
            }
            toast(`Status "${statusToDelete.name}" berhasil dihapus.`, "success");
            setStatusToDelete(null);
            void loadStatusesAndSettings();
            void loadOverview(selectedMonth, selectedYear);
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menghapus status.", "error");
        } finally {
            setDeletingStatus(false);
        }
    };

    // Send Test Email
    const handleSendTestEmail = async () => {
        setSendingTestEmail(true);
        try {
            const res = await fetch("/api/birthdays/test-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipients: testEmailRecipients }),
            });
            const json = await res.json();
            if (json.success) {
                toast(json.message || "Email uji coba berhasil dikirim!", "success");
                setTestEmailModalOpen(false);
            } else {
                throw new Error(json.error || json.message || "Gagal mengirim email uji coba.");
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal mengirim test email.", "error");
        } finally {
            setSendingTestEmail(false);
        }
    };

    // Directory filter memo
    const filteredDirectoryEmployees = useMemo(() => {
        if (!overview?.allEmployees) return [];
        return overview.allEmployees.filter((emp) => {
            const matchesSearch =
                searchQuery === "" ||
                emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
                emp.position.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesStatus =
                statusFilter === "ALL" ||
                (statusFilter === "UNPROCESSED" && !emp.preparation?.statusId) ||
                emp.preparation?.statusId === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [overview, searchQuery, statusFilter]);

    // Upcoming filter memo
    const filteredUpcomingEmployees = useMemo(() => {
        if (!overview?.upcoming) return [];
        if (upcomingMilestoneFilter === "H-0") return overview.upcoming.h0;
        if (upcomingMilestoneFilter === "H-7") return overview.upcoming.h7;
        if (upcomingMilestoneFilter === "H-14") return overview.upcoming.h14;
        if (upcomingMilestoneFilter === "H-30") return overview.upcoming.h30;
        return overview.upcoming.all;
    }, [overview, upcomingMilestoneFilter]);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">

            {/* ── Header ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Cake className="w-5 h-5 text-[var(--primary)]" />
                        Perencanaan Ulang Tahun &amp; Reminder
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Monitoring, persiapan souvenir/hadiah (H-30, H-14, H-7), dan reminder otomatis pegawai WIG
                    </p>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => {
                            setTestEmailRecipients(settings?.recipientEmails || "");
                            setTestEmailModalOpen(true);
                        }}
                        className="btn btn-secondary border border-[var(--border)] btn-sm"
                    >
                        <Mail className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Kirim Email Uji Coba</span>
                    </button>

                    <button
                        onClick={() => setStatusModalOpen(true)}
                        className="btn btn-secondary border border-[var(--border)] btn-sm"
                    >
                        <Sliders className="w-3.5 h-3.5 text-sky-600" />
                        <span>Status Persiapan ({statuses.length})</span>
                    </button>

                    <button
                        onClick={() => setSettingsModalOpen(true)}
                        className="btn btn-primary btn-sm"
                    >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Pengaturan Reminder</span>
                        {settings?.isEmailEnabled && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                        )}
                    </button>
                </div>
            </div>

            {/* ── KPI Summary Cards ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {/* Total Bulan Ini */}
                <div className="card p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">Bulan Ini ({overview?.currentMonth.monthName || "..."})</span>
                        <Calendar className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
                        {overview?.summary.totalThisMonth ?? 0}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Pegawai berulang tahun
                    </p>
                </div>

                {/* Hari Ini */}
                <div className="card p-4 space-y-2 border-rose-200 dark:border-rose-900/40 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20">
                    <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-semibold">
                        <span className="uppercase tracking-wider text-[10px]">Hari Ini</span>
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-rose-700 dark:text-rose-400">
                        {overview?.summary.totalToday ?? 0}
                    </div>
                    <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80">
                        {overview?.summary.totalToday ? "Rayakan hari ini!" : "Tidak ada hari ini"}
                    </p>
                </div>

                {/* H-7 Final Prep */}
                <div className="card p-4 space-y-2 border-amber-200 dark:border-amber-900/40">
                    <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 font-medium">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">H-7 (Final Prep)</span>
                        <Clock className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-400">
                        {overview?.summary.totalH7 ?? 0}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Pemesanan kue &amp; kartu
                    </p>
                </div>

                {/* H-14 Monitoring */}
                <div className="card p-4 space-y-2 border-sky-200 dark:border-sky-900/40">
                    <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-400 font-medium">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">H-14 (Monitoring)</span>
                        <Clock className="w-4 h-4 text-sky-500" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-sky-700 dark:text-sky-400">
                        {overview?.summary.totalH14 ?? 0}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Konfirmasi persiapan
                    </p>
                </div>

                {/* H-30 Persiapan Awal */}
                <div className="card p-4 space-y-2 border-indigo-200 dark:border-indigo-900/40 col-span-2 sm:col-span-1">
                    <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-400 font-medium">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">H-30 (Awal)</span>
                        <Clock className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-indigo-700 dark:text-indigo-400">
                        {overview?.summary.totalH30 ?? 0}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Mulai koordinasi
                    </p>
                </div>
            </div>

            {/* ── Navigation Tabs & Toolbar ─────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-1.5 p-1 bg-[var(--secondary)] rounded-xl overflow-x-auto max-w-full">
                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-all ${
                            activeTab === "overview"
                                ? "bg-[var(--card)] text-[var(--primary)] shadow-xs"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Calendar className="w-3.5 h-3.5 mr-1.5" />
                        <span>Bulan Berjalan</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("upcoming")}
                        className={`inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-all ${
                            activeTab === "upcoming"
                                ? "bg-[var(--card)] text-[var(--primary)] shadow-xs"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        <span>Upcoming &amp; Milestones ({overview?.upcoming.all.length ?? 0})</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("directory")}
                        className={`inline-flex items-center px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-all ${
                            activeTab === "directory"
                                ? "bg-[var(--card)] text-[var(--primary)] shadow-xs"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                        <Users className="w-3.5 h-3.5 mr-1.5" />
                        <span>Semua Pegawai ({overview?.summary.totalEmployeesWithBirthDate ?? 0})</span>
                    </button>
                </div>

                {/* Month Navigator for Overview Tab */}
                {activeTab === "overview" && (
                    <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
                        <button
                            onClick={handlePrevMonth}
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[var(--text-primary)] transition-colors"
                            title="Bulan sebelumnya"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold text-[var(--text-primary)] px-2 min-w-[130px] text-center">
                            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                        </span>
                        <button
                            onClick={handleNextMonth}
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[var(--text-primary)] transition-colors"
                            title="Bulan berikutnya"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {/* ── TAB 1: OVERVIEW BULAN BERJALAN ────────────────────── */}
            {activeTab === "overview" && (
                <div className="space-y-6">
                    {loading ? (
                        <div className="p-12 text-center text-sm text-[var(--text-secondary)] flex items-center justify-center gap-2">
                            <RefreshCw className="w-5 h-5 animate-spin text-[var(--primary)]" />
                            <span>Memuat data perencanaan ulang tahun...</span>
                        </div>
                    ) : overview?.currentMonth.all.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] space-y-2">
                            <Cake className="w-10 h-10 mx-auto text-[var(--text-secondary)]/50" />
                            <h3 className="font-semibold text-[var(--text-primary)]">
                                Tidak ada ulang tahun di {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                            </h3>
                            <p className="text-xs">
                                Tidak ada pegawai aktif yang memiliki tanggal lahir di bulan ini.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Seksi 1: Minggu Pertama (1 - 7) */}
                            <WeekColumn
                                title="Minggu Pertama (Tgl 1 - 7)"
                                badgeText={`${overview?.currentMonth.week1.length || 0} Pegawai`}
                                badgeColor="bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200"
                                employees={overview?.currentMonth.week1 || []}
                                statuses={statuses}
                                onOpenPrep={handleOpenPrepModal}
                                onQuickStatusChange={handleQuickStatusChange}
                            />

                            {/* Seksi 2: Minggu Kedua (8 - 14) */}
                            <WeekColumn
                                title="Minggu Kedua (Tgl 8 - 14)"
                                badgeText={`${overview?.currentMonth.week2.length || 0} Pegawai`}
                                badgeColor="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200"
                                employees={overview?.currentMonth.week2 || []}
                                statuses={statuses}
                                onOpenPrep={handleOpenPrepModal}
                                onQuickStatusChange={handleQuickStatusChange}
                            />

                            {/* Seksi 3: Minggu Berikutnya (15 - Akhir) */}
                            <WeekColumn
                                title="Minggu Berikutnya (Tgl 15+)"
                                badgeText={`${overview?.currentMonth.nextWeeks.length || 0} Pegawai`}
                                badgeColor="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200"
                                employees={overview?.currentMonth.nextWeeks || []}
                                statuses={statuses}
                                onOpenPrep={handleOpenPrepModal}
                                onQuickStatusChange={handleQuickStatusChange}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 2: UPCOMING & MILESTONES ──────────────────────── */}
            {activeTab === "upcoming" && (
                <div className="space-y-4">
                    {/* Milestone Filter Chips */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium mr-1 flex items-center gap-1">
                            <Filter className="w-3.5 h-3.5" /> Filter Milestone:
                        </span>
                        {[
                            { key: "ALL", label: "Semua Terdekat" },
                            { key: "H-0", label: "Hari Ini (H-0)" },
                            { key: "H-7", label: "H-7 (Final Prep)" },
                            { key: "H-14", label: "H-14 (Monitoring)" },
                            { key: "H-30", label: "H-30 (Persiapan Awal)" },
                        ].map((chip) => (
                            <button
                                key={chip.key}
                                onClick={() => setUpcomingMilestoneFilter(chip.key)}
                                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                                    upcomingMilestoneFilter === chip.key
                                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                        : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--secondary)]"
                                }`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    {filteredUpcomingEmployees.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]">
                            <Clock className="w-10 h-10 mx-auto text-[var(--text-secondary)]/40 mb-2" />
                            <p className="text-sm font-medium">Tidak ada pegawai pada kategori milestone ini.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredUpcomingEmployees.map((emp) => (
                                <BirthdayCard
                                    key={emp.id}
                                    employee={emp}
                                    statuses={statuses}
                                    onOpenPrep={handleOpenPrepModal}
                                    onQuickStatusChange={handleQuickStatusChange}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 3: SEMUA PEGAWAI (DIREKTORI) ──────────────────── */}
            {activeTab === "directory" && (
                <div className="space-y-4">
                    {/* Search & Filter Bar */}
                    <div className="card p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="relative sm:col-span-2">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    placeholder="Cari nama pegawai, NIP, jabatan, atau departemen..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="form-input pl-10 text-xs"
                                />
                            </div>

                            <div>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="form-select text-xs"
                                >
                                    <option value="ALL">Semua Status Persiapan</option>
                                    <option value="UNPROCESSED">Belum Diproses</option>
                                    {statuses.map((st) => (
                                        <option key={st.id} value={st.id}>
                                            {st.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Table View */}
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Pegawai</th>
                                        <th className="hidden md:table-cell">Jabatan &amp; Dept</th>
                                        <th>Tanggal Lahir</th>
                                        <th className="text-center">Sisa Waktu</th>
                                        <th>Status Persiapan</th>
                                        <th className="hidden lg:table-cell">Catatan</th>
                                        <th className="text-right">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDirectoryEmployees.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-10 text-sm text-[var(--text-muted)]">
                                                Tidak ada data pegawai yang sesuai kriteria pencarian
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredDirectoryEmployees.map((emp) => (
                                            <tr key={emp.id}>
                                                <td>
                                                    <div className="flex items-center gap-2.5">
                                                        {emp.avatarUrl ? (
                                                            <div className="w-8 h-8 rounded-full relative overflow-hidden shrink-0 border border-[var(--border)]">
                                                                <Image src={emp.avatarUrl} alt={emp.name} fill className="object-cover" unoptimized />
                                                            </div>
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-bold flex items-center justify-center shrink-0 text-xs">
                                                                {emp.name.charAt(0)}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="font-semibold text-xs text-[var(--text-primary)]">{emp.name}</div>
                                                            <div className="text-[10px] text-[var(--text-muted)]">{emp.employeeId}</div>
                                                            <div className="text-[10px] text-[var(--text-muted)] md:hidden mt-0.5">
                                                                {emp.position} &bull; {emp.department}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="hidden md:table-cell">
                                                    <div className="text-xs font-semibold text-[var(--text-primary)]">{emp.position}</div>
                                                    <div className="text-[10px] text-[var(--text-muted)]">{emp.department}</div>
                                                </td>
                                                <td>
                                                    <div className="font-semibold text-xs text-[var(--primary)]">{emp.birthDateFormatted}</div>
                                                    <div className="text-[10px] text-[var(--text-muted)]">Menuju usia {emp.ageTurning} thn</div>
                                                </td>
                                                <td className="text-center">
                                                    <span className={`badge ${
                                                        emp.daysUntil === 0
                                                            ? "badge-error"
                                                            : emp.daysUntil <= 7
                                                            ? "badge-warning"
                                                            : emp.daysUntil <= 14
                                                            ? "badge-info"
                                                            : "bg-[var(--secondary)] text-[var(--text-secondary)]"
                                                    }`}>
                                                        {emp.daysUntil === 0 ? "Hari Ini" : `${emp.daysUntil} hr`}
                                                    </span>
                                                </td>
                                                <td>
                                                    <select
                                                        value={emp.preparation?.statusId || ""}
                                                        onChange={(e) => handleQuickStatusChange(emp, e.target.value)}
                                                        className="form-select text-xs py-1 px-2.5 w-auto max-w-[160px]"
                                                    >
                                                        <option value="">Belum Diproses</option>
                                                        {statuses.map((st) => (
                                                            <option key={st.id} value={st.id}>
                                                                {st.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="hidden lg:table-cell max-w-[200px] truncate text-xs text-[var(--text-muted)]">
                                                    {emp.preparation?.notes || "-"}
                                                </td>
                                                <td className="text-right">
                                                    <button
                                                        onClick={() => handleOpenPrepModal(emp)}
                                                        className="btn btn-secondary border border-[var(--border)] btn-sm"
                                                    >
                                                        Detail &amp; Catatan
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL: UPDATE PERSIAPAN PEGAWAI ──────────────────── */}
            {prepModalOpen && selectedEmployeeForPrep && (
                <AccessibleModal
                    ariaLabel="Update Persiapan Ulang Tahun"
                    onClose={closePrepModal}
                    className="max-w-lg p-0"
                >
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Cake className="w-5 h-5 text-[var(--primary)]" />
                                <h2 className="text-base font-bold text-[var(--text-primary)]">
                                    Persiapan Ulang Tahun ({selectedYear})
                                </h2>
                            </div>
                            <button
                                onClick={closePrepModal}
                                className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* Employee Summary Card */}
                            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--secondary)]/60 border border-[var(--border)]">
                                <div className="w-11 h-11 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-bold flex items-center justify-center shrink-0">
                                    {selectedEmployeeForPrep.avatarUrl ? (
                                        <Image
                                            src={selectedEmployeeForPrep.avatarUrl}
                                            alt={selectedEmployeeForPrep.name}
                                            width={44}
                                            height={44}
                                            className="rounded-full object-cover"
                                            unoptimized
                                        />
                                    ) : (
                                        selectedEmployeeForPrep.name.charAt(0)
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                                        {selectedEmployeeForPrep.name}
                                    </h3>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {selectedEmployeeForPrep.department} &bull; {selectedEmployeeForPrep.position}
                                    </p>
                                    <p className="text-xs font-semibold text-[var(--primary)] mt-0.5">
                                        {selectedEmployeeForPrep.birthDateFormatted} (Menuju {selectedEmployeeForPrep.ageTurning} thn) &bull; {selectedEmployeeForPrep.daysUntil === 0 ? "Hari Ini!" : `${selectedEmployeeForPrep.daysUntil} hari lagi`}
                                    </p>
                                </div>
                            </div>

                            {/* Status Selector */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Status Persiapan
                                </label>
                                <select
                                    value={prepStatusId}
                                    onChange={(e) => setPrepStatusId(e.target.value)}
                                    className="form-select text-xs"
                                >
                                    <option value="">-- Belum Diproses --</option>
                                    {statuses.map((st) => (
                                        <option key={st.id} value={st.id}>
                                            {st.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Status dapat dikustomisasi lebih lanjut melalui menu Kelola Status.
                                </p>
                            </div>

                            {/* Notes */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Catatan Persiapan HR
                                </label>
                                <textarea
                                    rows={3}
                                    value={prepNotes}
                                    onChange={(e) => setPrepNotes(e.target.value)}
                                    placeholder="Contoh: Pesan kue tart cokelat dari Toko X, siapkan kartu ucapan direksi, koordinasi tiup lilin pukul 13.00..."
                                    className="form-textarea text-xs"
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3.5 bg-[var(--secondary)]/20">
                            <button
                                onClick={() => setPrepModalOpen(false)}
                                className="btn btn-secondary btn-sm"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSavePreparation}
                                disabled={savingPrep}
                                className="btn btn-primary btn-sm"
                            >
                                {savingPrep ? "Menyimpan..." : "Simpan Persiapan"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}

            {/* ── MODAL: PENGATURAN EMAIL REMINDER ─────────────────── */}
            {settingsModalOpen && (
                <AccessibleModal
                    ariaLabel="Pengaturan Email Reminder"
                    onClose={closeSettingsModal}
                    className="max-w-lg p-0"
                >
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Settings className="w-5 h-5 text-[var(--primary)]" />
                                <h2 className="text-base font-bold text-[var(--text-primary)]">
                                    Pengaturan Email Reminder
                                </h2>
                            </div>
                            <button
                                onClick={closeSettingsModal}
                                className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* SMTP Status Notice */}
                            <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                                isSmtpReady
                                    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-800 dark:text-emerald-300"
                                    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-300"
                            }`}>
                                {isSmtpReady ? (
                                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                                )}
                                <div>
                                    <span className="font-bold">
                                        {isSmtpReady ? "Layanan Email (SMTP) Siap" : "SMTP Belum Terkonfigurasi"}
                                    </span>
                                    <p className="text-[11px] opacity-90 mt-0.5">
                                        {isSmtpReady
                                            ? "Sistem siap mengirimkan email reminder otomatis ke daftar penerima yang Anda tentukan."
                                            : "Konfigurasi kredensial SMTP di file .env diperlukan sebelum sistem dapat mengirimkan email."}
                                    </p>
                                </div>
                            </div>

                            {/* Switch ON/OFF */}
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--secondary)]/50 border border-[var(--border)]">
                                <div>
                                    <div className="text-xs font-bold text-[var(--text-primary)]">
                                        Aktifkan Email Reminder
                                    </div>
                                    <div className="text-[11px] text-[var(--text-muted)]">
                                        Kirim notifikasi email otomatis pada H-30, H-14, dan H-7
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editIsEmailEnabled}
                                        onChange={(e) => setEditIsEmailEnabled(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-hidden rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]" />
                                </label>
                            </div>

                            {/* Dynamic Email Recipients */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Daftar Email Penerima Notifikasi (Dinamis)
                                </label>
                                <textarea
                                    rows={3}
                                    value={editRecipientEmails}
                                    onChange={(e) => setEditRecipientEmails(e.target.value)}
                                    placeholder="Contoh: hr@wig.co.id, ga@wig.co.id, direktur@wig.co.id"
                                    className="form-textarea text-xs font-mono"
                                />
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Pisahkan beberapa alamat email dengan koma atau baris baru. HR dapat memasukkan email HR sendiri maupun pihak manajemen lain yang memerlukan laporan persiapan.
                                </p>
                            </div>

                            {/* Reminder Days Info */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Jadwal Milestone Pengingat
                                </label>
                                <input
                                    type="text"
                                    value={editReminderDays}
                                    onChange={(e) => setEditReminderDays(e.target.value)}
                                    className="form-input text-xs font-mono"
                                />
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Default: <strong>30, 14, 7</strong> (Hari H / H-0 otomatis dipantau).
                                </p>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3.5 bg-[var(--secondary)]/20 flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSettingsModalOpen(false);
                                    setTestEmailModalOpen(true);
                                }}
                                className="btn btn-ghost btn-sm text-[var(--primary)] flex items-center gap-1"
                            >
                                <Mail className="w-3.5 h-3.5" /> Uji Coba Kirim Email
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setSettingsModalOpen(false)}
                                    className="btn btn-secondary btn-sm"
                                >
                                    Batal
                                </button>
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={savingSettings}
                                    className="btn btn-primary btn-sm"
                                >
                                    {savingSettings ? "Menyimpan..." : "Simpan Pengaturan"}
                                </button>
                            </div>
                        </div>
                    </div>
                </AccessibleModal>
            )}

            {/* ── MODAL: KELOLA STATUS PERSIAPAN (CUSTOM STATUSES) ───── */}
            {statusModalOpen && (
                <AccessibleModal
                    ariaLabel="Kelola Status Persiapan"
                    onClose={closeStatusModal}
                    className="max-w-lg p-0"
                >
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Sliders className="w-5 h-5 text-[var(--primary)]" />
                                <h2 className="text-base font-bold text-[var(--text-primary)]">
                                    Kelola Status Persiapan Ulang Tahun
                                </h2>
                            </div>
                            <button
                                onClick={closeStatusModal}
                                className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* Inline Delete Confirmation Banner */}
                            {statusToDelete && (
                                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2">
                                    <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 leading-relaxed">
                                        Hapus status &ldquo;{statusToDelete.name}&rdquo;? Pegawai yang sedang menggunakan status ini akan dialihkan ke status &ldquo;Belum Diproses&rdquo;.
                                    </p>
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setStatusToDelete(null)}
                                            disabled={deletingStatus}
                                            className="btn btn-secondary btn-sm"
                                        >
                                            Batal
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmDeleteStatus}
                                            disabled={deletingStatus}
                                            className="btn btn-danger btn-sm flex items-center gap-1.5"
                                        >
                                            {deletingStatus ? (
                                                <>
                                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                                    <span>Menghapus...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Trash2 className="w-3 h-3" />
                                                    <span>Ya, Hapus</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* List of Existing Statuses */}
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Daftar Status Saat Ini:
                                </label>
                                {statuses.map((st) => (
                                    <div
                                        key={st.id}
                                        className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)]"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span
                                                className="w-3.5 h-3.5 rounded-full shrink-0"
                                                style={{ backgroundColor: st.color }}
                                            />
                                            <div>
                                                <span className="text-xs font-bold text-[var(--text-primary)]">
                                                    {st.name}
                                                </span>
                                                {st.isDefault && (
                                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--secondary)] text-[var(--text-muted)]">
                                                        Default
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingStatusId(st.id);
                                                    setNewStatusName(st.name);
                                                    setNewStatusColor(st.color);
                                                    setNewStatusOrder(st.order);
                                                }}
                                                className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                                                title="Edit Status"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStatusToDelete(st)}
                                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                                title="Hapus Status"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add / Edit Status Form */}
                            <div className="p-4 rounded-xl bg-[var(--secondary)]/40 border border-[var(--border)] space-y-3">
                                <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <Plus className="w-4 h-4 text-[var(--primary)]" />
                                    {editingStatusId ? "Edit Status Persiapan" : "Tambah Status Baru"}
                                </h4>

                                <div className="space-y-1">
                                    <label className="text-[11px] text-[var(--text-muted)] font-medium">
                                        Nama Status (misal: Hadiah Dibeli, Dekorasi Siap, Persiapan Event)
                                    </label>
                                    <input
                                        type="text"
                                        value={newStatusName}
                                        onChange={(e) => setNewStatusName(e.target.value)}
                                        placeholder="Nama status baru..."
                                        className="form-input text-xs"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] text-[var(--text-muted)] font-medium">
                                        Warna Label / Badge:
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {PRESET_COLORS.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setNewStatusColor(c)}
                                                className={`w-6 h-6 rounded-full border-2 transition-transform ${
                                                    newStatusColor === c ? "scale-125 border-black dark:border-white shadow-xs" : "border-transparent"
                                                }`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                        <input
                                            type="color"
                                            value={newStatusColor}
                                            onChange={(e) => setNewStatusColor(e.target.value)}
                                            className="w-7 h-7 p-0 rounded-full border-0 cursor-pointer"
                                            title="Warna kustom"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                    {editingStatusId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingStatusId(null);
                                                setNewStatusName("");
                                                setNewStatusColor("#0284c7");
                                            }}
                                            className="btn btn-ghost btn-sm"
                                        >
                                            Batal Edit
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSaveStatusItem}
                                        disabled={savingStatus}
                                        className="btn btn-primary btn-sm"
                                    >
                                        {savingStatus ? "Menyimpan..." : editingStatusId ? "Update Status" : "Tambah Status"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3.5 bg-[var(--secondary)]/20">
                            <button
                                onClick={() => setStatusModalOpen(false)}
                                className="btn btn-secondary btn-sm"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}

            {/* ── MODAL: KIRIM EMAIL UJI COBA (TEST EMAIL) ─────────── */}
            {testEmailModalOpen && (
                <AccessibleModal
                    ariaLabel="Kirim Test Email Reminder"
                    onClose={closeTestEmailModal}
                    className="max-w-lg p-0"
                >
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Send className="w-5 h-5 text-emerald-600" />
                                <h2 className="text-base font-bold text-[var(--text-primary)]">
                                    Kirim Email Percobaan (Test Email)
                                </h2>
                            </div>
                            <button
                                onClick={closeTestEmailModal}
                                className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                                Fitur ini mengirimkan email simulasi reminder ulang tahun pegawai untuk memastikan kredensial SMTP valid dan template email dapat diterima dengan baik di inbox penerima.
                            </p>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[var(--text-primary)]">
                                    Alamat Email Penerima Uji Coba:
                                </label>
                                <input
                                    type="text"
                                    value={testEmailRecipients}
                                    onChange={(e) => setTestEmailRecipients(e.target.value)}
                                    placeholder="Contoh: hr@wig.co.id, admin@wig.co.id"
                                    className="form-input text-xs"
                                />
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Jika kosong, akan menggunakan email penerima yang sudah disimpan di Pengaturan.
                                </p>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3.5 bg-[var(--secondary)]/20">
                            <button
                                onClick={() => setTestEmailModalOpen(false)}
                                className="btn btn-secondary btn-sm"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleSendTestEmail}
                                disabled={sendingTestEmail}
                                className="btn btn-success btn-sm flex items-center gap-1.5"
                            >
                                {sendingTestEmail ? (
                                    <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Mengirim Email...</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Send Test Email</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}

        </div>
    );
}

// ────────────────────────────────────────────────────────────────
// ─── Sub-Components ─────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────

function WeekColumn({
    title,
    badgeText,
    badgeColor,
    employees,
    statuses,
    onOpenPrep,
    onQuickStatusChange,
}: {
    title: string;
    badgeText: string;
    badgeColor: string;
    employees: BirthdayEmployeeDetail[];
    statuses: StatusItem[];
    onOpenPrep: (emp: BirthdayEmployeeDetail) => void;
    onQuickStatusChange: (emp: BirthdayEmployeeDetail, statusId: string) => void;
}) {
    return (
        <div className="card p-4 space-y-4 flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-xs font-bold text-[var(--text-primary)]">{title}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                    {badgeText}
                </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto">
                {employees.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                        Tidak ada ulang tahun pada periode ini.
                    </div>
                ) : (
                    employees.map((emp) => (
                        <BirthdayCard
                            key={emp.id}
                            employee={emp}
                            statuses={statuses}
                            onOpenPrep={onOpenPrep}
                            onQuickStatusChange={onQuickStatusChange}
                            compact
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function BirthdayCard({
    employee,
    statuses,
    onOpenPrep,
    onQuickStatusChange,
    compact = false,
}: {
    employee: BirthdayEmployeeDetail;
    statuses: StatusItem[];
    onOpenPrep: (emp: BirthdayEmployeeDetail) => void;
    onQuickStatusChange: (emp: BirthdayEmployeeDetail, statusId: string) => void;
    compact?: boolean;
}) {
    const isToday = employee.daysUntil === 0;
    const isUrgent = employee.daysUntil <= 7;

    return (
        <div className={`rounded-xl border transition-all p-3.5 space-y-3 ${
            isToday
                ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900 shadow-sm"
                : isUrgent
                ? "bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/50"
                : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--primary)]/40"
        }`}>
            {/* Header: Avatar, Name & Date Badge */}
            <div className="flex items-start gap-3">
                {employee.avatarUrl ? (
                    <div className="w-10 h-10 rounded-full relative overflow-hidden shrink-0 border border-[var(--border)]">
                        <Image src={employee.avatarUrl} alt={employee.name} fill className="object-cover" unoptimized />
                    </div>
                ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-bold flex items-center justify-center shrink-0 text-sm">
                        {employee.name.charAt(0)}
                    </div>
                )}

                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-[var(--text-primary)] truncate" title={employee.name}>
                            {employee.name}
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                            isToday
                                ? "bg-rose-600 text-white border-rose-600"
                                : isUrgent
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300"
                                : "bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]"
                        }`}>
                            {isToday ? "Hari Ini" : `${employee.daysUntil} hari lagi`}
                        </span>
                    </div>

                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                        {employee.position} &bull; {employee.department}
                    </p>

                    <p className="text-[11px] font-semibold text-[var(--primary)] mt-0.5">
                        {employee.birthDateFormatted} (Ulang Tahun ke-{employee.ageTurning})
                    </p>
                </div>
            </div>

            {/* Preparation Status & Quick Dropdown */}
            <div className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between gap-2">
                <div className="flex-1">
                    <select
                        value={employee.preparation?.statusId || ""}
                        onChange={(e) => onQuickStatusChange(employee, e.target.value)}
                        className="form-select text-xs py-1 px-2.5 font-medium"
                    >
                        <option value="">Belum Diproses</option>
                        {statuses.map((st) => (
                            <option key={st.id} value={st.id}>
                                {st.name}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={() => onOpenPrep(employee)}
                    className="btn btn-secondary border border-[var(--border)] btn-sm shrink-0"
                >
                    Catatan
                </button>
            </div>

            {/* Note Snippet if exists */}
            {employee.preparation?.notes && (
                <div className="text-[10px] text-[var(--text-secondary)] italic bg-[var(--secondary)]/50 p-1.5 rounded-md border border-[var(--border)]/40 truncate">
                    &ldquo;{employee.preparation.notes}&rdquo;
                </div>
            )}
        </div>
    );
}
