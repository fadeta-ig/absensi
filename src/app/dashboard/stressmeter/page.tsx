"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    BarChart3,
    HeartPulse,
    Loader2,
    MessageSquareHeart,
    Users,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import { addCalendarDays, toWIBDateString } from "@/lib/timezone";
import OverviewTab from "@/components/stressmeter/OverviewTab";
import AttentionAndLogsTab from "@/components/stressmeter/AttentionAndLogsTab";
import AnonymousSharesTab from "@/components/stressmeter/AnonymousSharesTab";
import type {
    AnonymousSharesData,
    StressmeterOverviewData,
} from "@/components/stressmeter/types";

type HrTab = "overview" | "attention" | "shares";
type RangePreset = "7d" | "14d" | "30d" | "custom";

export default function HrStressmeterPage() {
    const toast = useToast();
    const todayWib = toWIBDateString();

    const [activeTab, setActiveTab] = useState<HrTab>("overview");
    const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
    const [fromDate, setFromDate] = useState(() => addCalendarDays(todayWib, -29));
    const [toDate, setToDate] = useState(todayWib);
    const [departmentId, setDepartmentId] = useState("");

    // Log filters
    const [logSearch, setLogSearch] = useState("");
    const [logRatingFilter, setLogRatingFilter] = useState("ALL");
    const [logPage, setLogPage] = useState(1);

    // Anonymous shares filters
    const [shareStatusFilter, setShareStatusFilter] = useState("ALL");
    const [shareTopicFilter, setShareTopicFilter] = useState("ALL");
    const [sharePage, setSharePage] = useState(1);

    // Data state
    const [overview, setOverview] = useState<StressmeterOverviewData | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [overviewError, setOverviewError] = useState<string | null>(null);

    const [shares, setShares] = useState<AnonymousSharesData | null>(null);
    const [loadingShares, setLoadingShares] = useState(false);

    const [togglingEnabled, setTogglingEnabled] = useState(false);

    const applyPreset = (preset: "7d" | "14d" | "30d") => {
        const nowWib = toWIBDateString();
        const offset = preset === "7d" ? -6 : preset === "14d" ? -13 : -29;
        setRangePreset(preset);
        setFromDate(addCalendarDays(nowWib, offset));
        setToDate(nowWib);
        setLogPage(1);
        setSharePage(1);
    };

    const fetchOverview = useCallback(async () => {
        setLoadingOverview(true);
        setOverviewError(null);
        try {
            const qs = new URLSearchParams({
                from: fromDate,
                to: toDate,
                page: String(logPage),
                limit: "20",
            });
            if (departmentId) qs.set("departmentId", departmentId);
            if (logRatingFilter !== "ALL") qs.set("rating", logRatingFilter);
            if (logSearch.trim()) qs.set("search", logSearch.trim());

            const res = await fetch(`/api/stressmeter?${qs.toString()}`);
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal memuat data Stressmeter.")
                );
            }
            const json = await res.json();
            setOverview(json.data as StressmeterOverviewData);
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal memuat data Stressmeter. Periksa koneksi Anda lalu coba lagi."
            );
            setOverviewError(msg);
            reportClientError("HrStressmeterPage", msg, err);
        } finally {
            setLoadingOverview(false);
        }
    }, [fromDate, toDate, departmentId, logRatingFilter, logSearch, logPage]);

    const fetchShares = useCallback(async () => {
        setLoadingShares(true);
        try {
            const qs = new URLSearchParams({
                from: fromDate,
                to: toDate,
                page: String(sharePage),
                limit: "15",
            });
            if (shareStatusFilter !== "ALL") qs.set("status", shareStatusFilter);
            if (shareTopicFilter !== "ALL") qs.set("topic", shareTopicFilter);

            const res = await fetch(`/api/stressmeter/shares?${qs.toString()}`);
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal memuat kotak curhat anonim.")
                );
            }
            const json = await res.json();
            setShares(json.data as AnonymousSharesData);
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal memuat kotak curhat anonim. Periksa koneksi Anda lalu coba lagi."
            );
            toast(msg, "error");
            reportClientError("HrStressmeterShares", msg, err);
        } finally {
            setLoadingShares(false);
        }
    }, [fromDate, toDate, shareStatusFilter, shareTopicFilter, sharePage, toast]);

    useEffect(() => {
        void fetchOverview();
    }, [fetchOverview]);

    useEffect(() => {
        if (activeTab === "shares") {
            void fetchShares();
        }
    }, [activeTab, fetchShares]);

    const handleToggleEnabled = async () => {
        if (!overview || togglingEnabled) return;
        const nextEnabled = !overview.enabled;
        setTogglingEnabled(true);
        try {
            const res = await fetch("/api/stressmeter/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: nextEnabled }),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal mengubah status pop-up Stressmeter.")
                );
            }
            setOverview((prev) => (prev ? { ...prev, enabled: nextEnabled } : prev));
            toast(
                nextEnabled
                    ? "Pop-up Stressmeter pasca Clock In diaktifkan."
                    : "Pop-up Stressmeter pasca Clock In dijeda sementara.",
                "success"
            );
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal mengubah status pop-up. Periksa koneksi Anda lalu coba lagi."
            );
            toast(msg, "error");
            reportClientError("HrStressmeterToggle", msg, err);
        } finally {
            setTogglingEnabled(false);
        }
    };

    const handleShareUpdated = async () => {
        await Promise.all([fetchShares(), fetchOverview()]);
    };

    const isPopupEnabled = overview?.enabled ?? true;

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
            {/* Header + Switch Aktif/Nonaktif */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                        <HeartPulse className="w-6 h-6 text-primary shrink-0" />
                        Stressmeter
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Pantau tren perasaan harian karyawan, deteksi dini kelelahan kerja, dan kelola kotak curhat anonim.
                    </p>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 shrink-0">
                    <div className="text-right">
                        <p className="text-xs font-semibold text-foreground">
                            Pop-Up Pasca Clock In
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            {isPopupEnabled ? "Aktif untuk karyawan" : "Sedang dijeda"}
                        </p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={isPopupEnabled}
                        aria-label="Aktifkan atau jeda pop-up Stressmeter pasca Clock In"
                        disabled={togglingEnabled || !overview}
                        onClick={() => void handleToggleEnabled()}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
                            isPopupEnabled ? "bg-emerald-600" : "bg-muted-foreground/30"
                        }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                                isPopupEnabled ? "translate-x-5" : "translate-x-0"
                            }`}
                        />
                    </button>
                </div>
            </div>

            {/* Filter Periode & Departemen */}
            <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                        {(
                            [
                                ["7d", "7 Hari"],
                                ["14d", "14 Hari"],
                                ["30d", "30 Hari"],
                            ] as Array<["7d" | "14d" | "30d", string]>
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => applyPreset(key)}
                                className={`px-2.5 py-1.5 rounded font-medium min-h-[32px] transition-colors ${
                                    rangePreset === key
                                        ? "bg-background text-primary shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                        <input
                            type="date"
                            aria-label="Tanggal mulai"
                            value={fromDate}
                            onChange={(e) => {
                                setRangePreset("custom");
                                setFromDate(e.target.value);
                                setLogPage(1);
                                setSharePage(1);
                            }}
                            className="px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs"
                        />
                        <span className="text-muted-foreground">s.d.</span>
                        <input
                            type="date"
                            aria-label="Tanggal selesai"
                            value={toDate}
                            onChange={(e) => {
                                setRangePreset("custom");
                                setToDate(e.target.value);
                                setLogPage(1);
                                setSharePage(1);
                            }}
                            className="px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs"
                        />
                    </div>
                </div>

                {activeTab !== "shares" && (
                    <select
                        aria-label="Filter departemen"
                        value={departmentId}
                        onChange={(e) => {
                            setDepartmentId(e.target.value);
                            setLogPage(1);
                        }}
                        className="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 lg:w-60"
                    >
                        <option value="">Semua Departemen</option>
                        {(overview?.departments ?? []).map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Sticky Tabs */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur -mx-4 px-4 border-b border-border">
                <div className="flex gap-1 overflow-x-auto no-scrollbar -mb-px">
                    {(
                        [
                            {
                                key: "overview" as const,
                                label: "Ringkasan & Tren",
                                icon: BarChart3,
                                badge: null,
                            },
                            {
                                key: "attention" as const,
                                label: "Deteksi Dini & Log",
                                icon: Users,
                                badge: overview?.attentionList.length
                                    ? String(overview.attentionList.length)
                                    : null,
                            },
                            {
                                key: "shares" as const,
                                label: "Kotak Curhat Anonim",
                                icon: MessageSquareHeart,
                                badge: overview?.kpi.newAnonymousShares
                                    ? `${overview.kpi.newAnonymousShares} baru`
                                    : null,
                            },
                        ] as const
                    ).map(({ key, label, icon: Icon, badge }) => {
                        const active = activeTab === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveTab(key)}
                                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
                                    active
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span>{label}</span>
                                {badge && (
                                    <span
                                        className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-full leading-none ${
                                            key === "shares"
                                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                                : active
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

            {/* Konten Tab */}
            {loadingOverview && !overview ? (
                <div className="flex items-center justify-center min-h-[40vh]">
                    <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
                </div>
            ) : overviewError && !overview ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
                    <p className="text-sm text-destructive">{overviewError}</p>
                    <button
                        type="button"
                        onClick={() => void fetchOverview()}
                        className="text-sm font-medium text-primary hover:underline"
                    >
                        Coba lagi
                    </button>
                </div>
            ) : (
                <>
                    {activeTab === "overview" && overview && (
                        <OverviewTab
                            data={overview}
                            onOpenSharesTab={() => setActiveTab("shares")}
                            onOpenAttentionTab={() => setActiveTab("attention")}
                        />
                    )}

                    {activeTab === "attention" && overview && (
                        <AttentionAndLogsTab
                            data={overview}
                            search={logSearch}
                            onSearchChange={(val) => {
                                setLogSearch(val);
                                setLogPage(1);
                            }}
                            ratingFilter={logRatingFilter}
                            onRatingFilterChange={(val) => {
                                setLogRatingFilter(val);
                                setLogPage(1);
                            }}
                            onPageChange={setLogPage}
                        />
                    )}

                    {activeTab === "shares" && (
                        <AnonymousSharesTab
                            data={shares}
                            loading={loadingShares}
                            statusFilter={shareStatusFilter}
                            onStatusFilterChange={(val) => {
                                setShareStatusFilter(val);
                                setSharePage(1);
                            }}
                            topicFilter={shareTopicFilter}
                            onTopicFilterChange={(val) => {
                                setShareTopicFilter(val);
                                setSharePage(1);
                            }}
                            onPageChange={setSharePage}
                            onUpdated={handleShareUpdated}
                        />
                    )}
                </>
            )}
        </div>
    );
}
