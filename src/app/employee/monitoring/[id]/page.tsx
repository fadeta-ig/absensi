import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEmployee360Data } from "@/lib/services/analyticsService";
import { getEmployeeByEmployeeId } from "@/lib/services/employeeService";
import { Employee360View } from "@/components/Employee360View";

export default async function Employee360ViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session) redirect("/login");

    // Fetch requester and data
    const requester = await getEmployeeByEmployeeId(session.employeeId);
    if (!requester) return <div>Unauthorized</div>;

    const data = await getEmployee360Data(id);
    if (!data) notFound();

    const { employee } = data;

    // RBAC check: Can session user see this employee?
    const isAllowed = requester.level === "CEO" ||
        requester.level === "HR" ||
        requester.role === "hr" ||
        (requester.level === "GM" && requester.department === employee.department) ||
        (requester.level === "MANAGER" && requester.division === employee.division) ||
        (requester.level === "SUPERVISOR" && (employee as any).managerId === requester.employeeId) ||
        requester.employeeId === employee.employeeId;

    if (!isAllowed) return <div>Forbidden</div>;

    return (
        <div className="md:py-4">
            <Employee360View
                {...data}
                backLink="/employee/monitoring"
            />
        </div>
    );
}
