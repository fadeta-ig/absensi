import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getEmployee360Data } from "@/lib/services/analyticsService";
import { Employee360View } from "@/components/Employee360View";

export default async function Employee360ViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session) redirect("/login");
    if (session.role !== "hr") redirect("/employee");

    const data = await getEmployee360Data(id);
    if (!data) notFound();

    return (
        <div className="md:py-8">
            <Employee360View
                {...data}
                backLink="/dashboard/employees"
            />
        </div>
    );
}
