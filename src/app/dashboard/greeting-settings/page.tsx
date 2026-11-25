import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import GreetingSettingsPanel from "@/components/greeting/GreetingSettingsPanel";
import { isWig001Session } from "@/lib/services/greetingSettingsService";

/**
 * /dashboard/greeting-settings — pengelolaan aturan sapaan & kurasi quotes
 * kiriman karyawan khusus untuk WIG001 (Super Admin HR). Penunjukan karyawan
 * editor tetap khusus WIG002 di portal GA.
 */
export default async function DashboardGreetingSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!isWig001Session(session)) redirect("/dashboard");

    const { tab } = await searchParams;
    const initialTab = tab === "quotes" ? "quotes" : "rules";

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-1">Sapaan Beranda</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                Kelola aturan sapaan beranda karyawan serta kurasi quotes kiriman karyawan dari Stressmeter
                untuk slot Pagi, Siang, Sore, dan Malam.
            </p>
            <GreetingSettingsPanel
                initialTab={initialTab}
                basePath="/dashboard/greeting-settings"
            />
        </div>
    );
}
