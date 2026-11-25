import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import GreetingSettingsPanel from "@/components/greeting/GreetingSettingsPanel";
import { canManageGreeting } from "@/lib/services/greetingSettingsService";

/**
 * /employee/greeting-settings — editor teks sapaan & kurasi quotes karyawan
 * untuk karyawan yang ditunjuk WIG002. Karyawan lain diarahkan kembali ke beranda.
 */
export default async function EmployeeGreetingSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const session = await getActiveSession();
    if (!session?.employeeId) redirect("/");

    const allowed = await canManageGreeting(session);
    if (!allowed) redirect("/employee");

    const { tab } = await searchParams;
    const initialTab = tab === "quotes" ? "quotes" : "rules";

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
            <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">Sapaan Beranda</h1>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Atur aturan sapaan beranda serta kurasi quotes kiriman karyawan dari Stressmeter
                    untuk slot Pagi, Siang, Sore, dan Malam. Perubahan berlaku maksimal 60 detik setelah disimpan.
                </p>
            </div>
            <GreetingSettingsPanel
                initialTab={initialTab}
                basePath="/employee/greeting-settings"
            />
        </div>
    );
}
