"use client";

import { Suspense } from "react";
import EmployeeForm from "@/components/EmployeeForm";
import { Loader2 } from "lucide-react";

export default function CreateEmployeePage() {
    return (
        <div className="animate-[fadeIn_0.5s_ease]">
            <Suspense
                fallback={
                    <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)] animate-pulse">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <p className="text-sm font-medium">Memuat formulir karyawan...</p>
                    </div>
                }
            >
                <EmployeeForm />
            </Suspense>
        </div>
    );
}
