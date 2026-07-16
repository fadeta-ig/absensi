import { getActiveSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEmployee360Data } from "@/lib/services/analyticsService";
import { getEmployeeStatusOverview } from "@/lib/services/employeeStatusService";
import { Employee360View } from "@/components/Employee360View";
import { canManageHr } from "@/lib/permissions";

export default async function Employee360ViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!canManageHr(session)) redirect("/employee");

    const [data, statusOverview] = await Promise.all([
        getEmployee360Data(id),
        getEmployeeStatusOverview(id),
    ]);
    if (!data) notFound();

    return (
        <div className="md:py-8">
            <Employee360View
                {...data}
                statusHistory={(statusOverview?.history ?? []).map((item) => ({
                    ...item,
                    effectiveDate: item.effectiveDate.toISOString(),
                    createdAt: item.createdAt.toISOString(),
                }))}
                backLink="/dashboard/employees"
            />
        </div>
    );
}
