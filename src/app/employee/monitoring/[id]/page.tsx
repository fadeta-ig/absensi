import { getActiveSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEmployee360Data } from "@/lib/services/analyticsService";
import { getVisibleEmployees } from "@/lib/services/employeeService";
import { Employee360View } from "@/components/Employee360View";
import { AlertCircle } from "lucide-react";

export default async function Employee360ViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!session.employeeId) redirect("/");

    const data = await getEmployee360Data(id);
    if (!data) notFound();

    const { employee } = data;

    // RBAC check: Can session user see this employee?
    const visibleEmployees = await getVisibleEmployees(session);
    const isAllowed = visibleEmployees.some((e) => e.id === employee.id);

    if (!isAllowed) {
        return (
            <div>
                <div className="emp-surface p-8 text-center">
                    <AlertCircle className="w-10 h-10 text-[var(--destructive-text)] opacity-70 mx-auto mb-3" />
                    <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">Akses monitoring tidak tersedia</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                        Profil ini tidak termasuk dalam daftar anggota tim yang dapat Anda monitor.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Employee360View
                {...data}
                backLink="/employee/monitoring"
                compact={true}
            />
        </div>
    );
}
