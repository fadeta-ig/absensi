"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import AssetForm, { AssetFormData } from "@/features/ga/components/AssetForm";

export default function CreateAssetPage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (data: AssetFormData) => {
        setError(null);
        setSaving(true);

        const payload = {
            name: data.name,
            categoryId: data.categoryId,
            kondisi: data.kondisi,
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
            const res = await fetch("/api/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const resData = await res.json();
            if (!res.ok) throw new Error(resData.error || "Gagal membuat aset");
            
            router.push("/ga/assets");
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6 min-h-screen">
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => router.back()}
                    className="p-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">Tambah Aset Baru</h1>
                    <p className="text-sm text-slate-500 mt-1">Registrasi aset ke dalam sistem informasi.</p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium">
                    {error}
                </div>
            )}

            <AssetForm mode="create" onSubmit={handleSubmit} saving={saving} />
        </div>
    );
}
