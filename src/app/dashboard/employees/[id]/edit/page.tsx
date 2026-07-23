"use client";

import { useEffect, useState } from "react";
import EmployeeForm from "@/components/EmployeeForm";
import { useParams } from "next/navigation";
import { Employee } from "@/types";
import { Loader2 } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

export default function EditEmployeePage() {
    const { id } = useParams();
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadEmployee() {
            setLoading(true);
            try {
                const response = await fetch(`/api/employees/${id}`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(await getResponseErrorMessage(response, "Karyawan tidak ditemukan."));
                }

                const data = await response.json() as Employee;
                setEmployee(data);
            } catch (error) {
                reportClientError("EditEmployeePage", "Gagal memuat data edit karyawan", error, { employeeId: String(id) });
                setEmployee(null);
            } finally {
                setLoading(false);
            }
        }

        void loadEmployee();
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
