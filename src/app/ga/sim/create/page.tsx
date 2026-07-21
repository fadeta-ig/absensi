"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SimCardForm, { SimCardFormData } from "@/features/ga/components/SimCardForm";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage } from "@/lib/clientErrors";

export default function SimCardCreatePage() {
    const router = useRouter();
    const toast = useToast();
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (data: SimCardFormData) => {
        setSaving(true);
        try {
            const res = await fetch("/api/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan SIM Card."));
            }

            toast("SIM Card berhasil disimpan.", "success");
            router.push("/ga/sim");
            router.refresh();
        } catch (error) {
            console.error(error);
            toast(error instanceof Error ? error.message : "SIM Card belum tersimpan. Periksa data lalu coba lagi.", "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Registrasi Kartu SIM Baru</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Tambahkan nomor baru ke dalam inventaris IT & GA.</p>
            </div>
            
            <SimCardForm 
                mode="create" 
                onSubmit={handleSubmit} 
                saving={saving} 
            />
        </div>
    );
}
