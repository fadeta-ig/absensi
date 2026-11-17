import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import GreetingSettingsPanel from "@/components/greeting/GreetingSettingsPanel";
import { isWig002Session } from "@/lib/services/greetingSettingsService";

/**
 * /ga/greeting-settings — pengaturan teks sapaan beranda employee.
 * Hanya WIG002 dengan ga.manage; karyawan terpilih memakai route /employee.
 */
export default async function GaGreetingSettingsPage() {
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!isWig002Session(session)) redirect("/ga");

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Sapaan Beranda</h1>
            <p className="text-sm text-muted-foreground mb-6">
                Kelola aturan sapaan beranda employee: teks, jendela jam, hari atau tanggal, prioritas, dan status aktif.
                Anda juga dapat menunjuk satu karyawan yang boleh ikut mengedit.
            </p>
            <GreetingSettingsPanel canManageEditor />
        </div>
    );
}
