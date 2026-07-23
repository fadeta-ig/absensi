"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import SimCardForm, { SimCardFormData } from "@/features/ga/components/SimCardForm";
import { useToast } from "@/components/Toast";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { reportClientError } from "@/lib/clientErrors";

export default function SimCardEditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const toast = useToast();
    const [initialData, setInitialData] = useState<Partial<SimCardFormData> | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const res = await fetch(`/api/sim-cards/${id}`);
                if (!res.ok) throw new Error("SIM Card tidak ditemukan");
                
                const asset = await res.json();

                setInitialData({
                    provider: asset.provider,
                    assignedToId: asset.assignedToId || "",
                    notes: asset.notes || "",
                    phoneNumber: asset.phoneNumber || "",
                    expiredDate: asset.expiredDate ? asset.expiredDate.split('T')[0] : "",
                });

            } catch (err) {
                reportClientError("SimCardEditPage", "Gagal load SIM Card", err, { simId: id });
                setError(err instanceof Error ? err.message : "Data SIM Card tidak dapat dimuat. Muat ulang halaman atau coba lagi nanti.");
            }
        };
        fetchInitialData();
    }, [id]);

    const handleSubmit = async (data: SimCardFormData) => {
        setError(null);
        setSaving(true);

        const payload = {
            provider: data.provider,
            phoneNumber: data.phoneNumber,
            expiredDate: data.expiredDate || null,
            assignedToId: data.assignedToId || null,
            notes: data.notes || null,
        };

        try {
            const res = await fetch(`/api/sim-cards/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error || "Gagal mengupdate SIM Card");

            toast("Perubahan SIM Card berhasil disimpan.", "success");
            router.push(`/ga/sim`);
        } catch (err: unknown) {
            reportClientError("SimCardEditPage", "Gagal menyimpan perubahan SIM Card", err, { simId: id });
            setError(err instanceof Error ? err.message : "Perubahan SIM Card belum tersimpan. Periksa data lalu coba lagi.");
        } finally {
            setSaving(false);
        }
    };

    if (!initialData && !error) return <div className="p-6 text-sm text-[var(--text-secondary)]" role="status">Memuat konfigurasi SIM Card...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6 min-h-screen">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--secondary)] transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Edit Kartu SIM</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Lakukan pembaruan nomor, paket data, dan masa aktif.</p>
                </div>
            </div>

            {error ? (
                <FeedbackMessage variant="error">
                    {error}
                </FeedbackMessage>
            ) : initialData && (
                <SimCardForm mode="edit" initialData={initialData} onSubmit={handleSubmit} saving={saving} />
            )}
        </div>
    );
}
