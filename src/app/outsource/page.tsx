"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    Eye,
    FileCheck2,
    Loader2,
    SprayCan,
    Wrench,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import PageHeader from "@/components/ui/PageHeader";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface OutsourceCaps {
    canExecuteCleaning: boolean;
    cleaningRoomsCount: number;
    canOverviewCleaning: boolean;
    canExecuteEquipment: boolean;
    hasEquipmentExecutePerm: boolean;
    canQcEquipment: boolean;
    hasEquipmentQcPerm: boolean;
    canApproveEquipment: boolean;
    hasEquipmentApprovePerm: boolean;
    canOverviewEquipment: boolean;
    executeCompanies: string[];
    qcCompanies: string[];
    approveCompanies: string[];
}

interface ModuleCard {
    href: string;
    title: string;
    description: string;
    badge?: string;
    icon: typeof SprayCan;
}

export default function OutsourceHomePage() {
    const [caps, setCaps] = useState<OutsourceCaps | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/outsource/capabilities");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat kapabilitas akun."));
                const json = await res.json();
                if (!cancelled) setCaps(json.data);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat portal.";
                if (!cancelled) setError(msg);
                reportClientError("OutsourceHomePage", msg, err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const cards: ModuleCard[] = [];
    if (caps) {
        if (caps.canExecuteCleaning) {
            cards.push({
                href: "/outsource/cleaning",
                title: "Checklist Kebersihan Harian",
                description: "Isi item kebersihan ruangan dan unggah foto bukti untuk ruangan yang ditugaskan hari ini.",
                badge:
                    caps.cleaningRoomsCount > 0
                        ? `${caps.cleaningRoomsCount} ruang aktif`
                        : "Belum ada penugasan ruang",
                icon: SprayCan,
            });
        }
        if (caps.canOverviewCleaning) {
            cards.push({
                href: "/outsource/cleaning/overview",
                title: "Pantau Rekap Kebersihan",
                description: "Lihat progres bulanan, detail checklist harian, status paraf, dan foto bukti (read-only).",
                badge: "Read-only",
                icon: Eye,
            });
        }
        if (caps.hasEquipmentExecutePerm) {
            cards.push({
                href: "/outsource/equipment",
                title: "Inspeksi Alat Produksi",
                description: "Mulai checklist unit yang ditugaskan, nilai setiap item, unggah foto bukti, dan kirim ke QC.",
                badge: caps.canExecuteEquipment
                    ? caps.executeCompanies.length > 0
                        ? caps.executeCompanies.join(" · ")
                        : "Aktif"
                    : "Belum ada penugasan unit",
                icon: Wrench,
            });
        }
        if (caps.hasEquipmentQcPerm) {
            cards.push({
                href: "/outsource/equipment/approvals",
                title: "Antrean QC Inspeksi Alat",
                description: "Periksa hasil inspeksi yang disubmit operator, unggah foto QC opsional, dan tandai selesai.",
                badge: caps.canQcEquipment
                    ? `QC ${caps.qcCompanies.join(" · ")}`
                    : "Belum masuk daftar QC WIG/MKI",
                icon: FileCheck2,
            });
        }
        if (caps.hasEquipmentApprovePerm) {
            cards.push({
                href: "/outsource/equipment/approval-queue",
                title: "Approval Final Peralatan",
                description: "Tinjau inspeksi berstatus DONE dari QC dan berikan persetujuan final.",
                badge: caps.canApproveEquipment
                    ? `Approver ${caps.approveCompanies.join(" · ")}`
                    : "Belum masuk daftar Approver WIG/MKI",
                icon: CheckCircle2,
            });
        }
        if (caps.canOverviewEquipment) {
            cards.push({
                href: "/outsource/equipment/overview",
                title: "Pantau Rekap Inspeksi Alat",
                description: "Pantau rekap status inspeksi lintas unit beserta detail dan foto dokumentasi (read-only).",
                badge: "Read-only",
                icon: Eye,
            });
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                icon={ClipboardList}
                title="Portal E-Checklist Outsource"
                subtitle="Pilih modul E-Checklist yang telah diberikan oleh admin GA (WIG002)."
            />

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

            {loading ? (
                <div className="emp-surface p-8 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memuat modul E-Checklist…
                </div>
            ) : cards.length === 0 ? (
                <EmptyState
                    icon={ClipboardList}
                    title="Belum ada modul E-Checklist yang aktif"
                    description="Hubungi admin GA (WIG002) untuk mengaktifkan hak akses modul E-Checklist pada akun Anda."
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <Link
                                key={card.href}
                                href={card.href}
                                className="emp-surface emp-surface-hover p-4 flex items-start gap-3 transition-colors"
                            >
                                <span className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] flex items-center justify-center shrink-0">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                                            {card.title}
                                        </p>
                                        <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                                        {card.description}
                                    </p>
                                    {card.badge && (
                                        <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--secondary)] text-[var(--text-secondary)]">
                                            {card.badge}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
