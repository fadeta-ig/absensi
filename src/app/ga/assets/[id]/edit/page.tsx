"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AssetForm, { AssetFormData } from "@/features/ga/components/AssetForm";
import { AssetWithHistory } from "@/lib/types/asset";
import { useToast } from "@/components/Toast";
import FeedbackMessage from "@/components/ui/FeedbackMessage";

export default function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const toast = useToast();
    const [initialData, setInitialData] = useState<Partial<AssetFormData> | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const res = await fetch(`/api/assets/${id}`);
                if (!res.ok) throw new Error("Aset tidak ditemukan");
                
                const asset: AssetWithHistory = await res.json();
                
                setInitialData({
                    name: asset.name,
                    categoryId: asset.categoryId,
                    kondisi: asset.kondisi,
                    status: asset.status,
                    holderType: asset.holderType,
                    assignedToId: asset.assignedToId || "",
                    assignedToName: asset.assignedToName || "",
                    serialNumber: asset.serialNumber || "",
                    imei: asset.imei || "",
                    manufacturer: asset.manufacturer || "",
                    modelName: asset.modelName || "",
                    purchaseDate: asset.purchaseDate ? asset.purchaseDate.split('T')[0] : "",
                    purchasePrice: asset.purchasePrice ? String(asset.purchasePrice) : "",
                    warrantyExpiry: asset.warrantyExpiry ? asset.warrantyExpiry.split('T')[0] : "",
                    keterangan: asset.keterangan || "",
                });

            } catch (err) {
                console.error("Gagal load aset", err);
                setError(err instanceof Error ? err.message : "Data aset tidak dapat dimuat. Muat ulang halaman atau coba lagi nanti.");
            }
        };
        fetchInitialData();
    }, [id]);

    const handleSubmit = async (data: AssetFormData) => {
        setError(null);
        setSaving(true);

        const payload = {
            name: data.name,
            categoryId: data.categoryId,
            kondisi: data.kondisi,
            status: data.status,
            holderType: data.holderType,
            assignedToId: data.holderType === "EMPLOYEE" ? data.assignedToId : null,
            assignedToName: data.holderType === "GA_POOL" ? null : data.assignedToName,
            keterangan: data.keterangan || null,
            serialNumber: data.serialNumber || null,
            imei: data.imei || null,
            manufacturer: data.manufacturer || null,
            modelName: data.modelName || null,
            purchaseDate: data.purchaseDate || null,
            purchasePrice: data.purchasePrice ? parseFloat(data.purchasePrice) : null,
            warrantyExpiry: data.warrantyExpiry || null,
        };

        try {
            const res = await fetch(`/api/assets/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error || "Gagal mengupdate aset");

            toast("Perubahan aset berhasil disimpan.", "success");
            router.push(`/ga/assets/${id}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Perubahan aset belum tersimpan. Periksa data lalu coba lagi.");
        } finally {
            setSaving(false);
        }
    };

    if (!initialData && !error) return <div className="p-6 text-sm text-[var(--text-secondary)]" role="status">Memuat konfigurasi form...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6 min-h-screen">
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="p-2 border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--secondary)] transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Edit Aset</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Lakukan pembaruan spesifikasi dan informasi aset.</p>
                </div>
            </div>

            {error ? (
                <FeedbackMessage variant="error">
                    {error}
                </FeedbackMessage>
            ) : initialData && (
                <AssetForm mode="edit" initialData={initialData} onSubmit={handleSubmit} saving={saving} />
            )}
        </div>
    );
}
