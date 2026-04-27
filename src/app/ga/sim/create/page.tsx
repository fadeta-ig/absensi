"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SimCardForm, { SimCardFormData } from "@/features/ga/components/SimCardForm";

export default function SimCardCreatePage() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (data: SimCardFormData) => {
        setSaving(true);
        try {
            const res = await fetch("/api/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                router.push("/ga/sim");
                router.refresh();
            } else {
                const err = await res.json();
                alert(err.error || "Gagal menyimpan SIM Card");
            }
        } catch (error) {
            console.error(error);
            alert("Terjadi kesalahan sistem saat menyimpan sim card.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">Registrasi Kartu SIM Baru</h1>
                <p className="text-sm text-slate-500 mt-1">Tambahkan nomor baru ke dalam inventaris IT & GA.</p>
            </div>
            
            <SimCardForm 
                mode="create" 
                onSubmit={handleSubmit} 
                saving={saving} 
            />
        </div>
    );
}
