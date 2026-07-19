"use client";

import { useEffect, useState } from "react";
import EmployeeForm from "@/components/EmployeeForm";
import { useParams } from "next/navigation";
import { Employee } from "@/types";
import { Loader2 } from "lucide-react";

export default function EditEmployeePage() {
    const { id } = useParams();
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/employees/${id}`, { cache: "no-store" })
            .then(async (response) => response.ok ? response.json() : null)
            .then((data: Employee | null) => setEmployee(data))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
        </div>
    );

    if (!employee) return (
        <div className="text-center py-20 text-[var(--text-muted)]">
            Karyawan tidak ditemukan.
        </div>
    );

    return (
        <div className="animate-[fadeIn_0.5s_ease]">
            <EmployeeForm initialData={employee} isEdit />
        </div>
    );
}
