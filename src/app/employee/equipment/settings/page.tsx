import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import EquipmentSettingsPanel from "@/components/equipment/settings/EquipmentSettingsPanel";
import { hasEmployeePortalAccess } from "@/lib/services/equipmentAuth";
import { getActiveEquipmentSettingsScopes } from "@/lib/services/equipmentService";

/**
 * /employee/equipment/settings — panel pengaturan peralatan untuk karyawan PIC
 * yang ditunjuk WIG002. Hanya menampilkan tab sesuai scope yang didelegasikan;
 * karyawan di luar daftar diarahkan kembali ke beranda di sisi server.
 */
export default async function EmployeeEquipmentSettingsPage() {
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!hasEmployeePortalAccess(session)) redirect("/employee");

    const scopes = await getActiveEquipmentSettingsScopes(session);
    if (scopes.length === 0) redirect("/employee");

    return (
        <EquipmentSettingsPanel
            allowedScopes={scopes}
            canManageDelegates={false}
            mode="employee"
            backHref="/employee"
        />
    );
}
