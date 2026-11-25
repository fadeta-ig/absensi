import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import GreetingSettingsPanel from "@/components/greeting/GreetingSettingsPanel";
import { isWig002Session } from "@/lib/services/greetingSettingsService";

/**
 * /ga/greeting-settings — pengaturan teks sapaan beranda employee & kurasi
 * quotes karyawan. Hanya WIG002 dengan ga.manage; WIG001 memakai /dashboard
 * dan karyawan editor terpilih memakai /employee.
 */
export default async function GaGreetingSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!isWig002Session(session)) redirect("/ga");

    const { tab } = await searchParams;
    const initialTab = tab === "quotes" ? "quotes" : "rules";

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-1">Sapaan Beranda</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
                Kelola aturan sapaan beranda employee, kurasi quotes kiriman karyawan dari Stressmeter,
                dan tunjuk satu karyawan yang boleh ikut mengedit.
            </p>
            <GreetingSettingsPanel
                canManageEditor
                initialTab={initialTab}
                basePath="/ga/greeting-settings"
            />
        </div>
    );
}
