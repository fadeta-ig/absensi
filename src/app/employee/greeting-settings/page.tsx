import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import GreetingSettingsPanel from "@/components/greeting/GreetingSettingsPanel";
import { canManageGreeting } from "@/lib/services/greetingSettingsService";

/**
 * /employee/greeting-settings — editor teks sapaan untuk karyawan yang
 * ditunjuk WIG002. Karyawan lain diarahkan kembali ke beranda.
 */
export default async function EmployeeGreetingSettingsPage() {
    const session = await getActiveSession();
    if (!session?.employeeId) redirect("/");

    const allowed = await canManageGreeting(session);
    if (!allowed) redirect("/employee");

    return (
        <div className="max-w-md mx-auto px-4 py-6 space-y-4">
            <div>
                <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">Sapaan Beranda</h1>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Atur aturan sapaan yang tampil di beranda karyawan: teks, jam, hari atau tanggal, dan prioritas.
                    Perubahan berlaku maksimal 60 detik setelah disimpan.
                </p>
            </div>
            <GreetingSettingsPanel />
        </div>
    );
}
