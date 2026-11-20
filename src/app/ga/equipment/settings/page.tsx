import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import EquipmentSettingsPanel from "@/components/equipment/settings/EquipmentSettingsPanel";
import {
    EQUIPMENT_SETTINGS_SCOPES,
    isEquipmentMasterAdmin,
} from "@/lib/services/equipmentAuth";

/**
 * /ga/equipment/settings — pengaturan master peralatan (Template, Unit, Produk,
 * Penugasan, Atasan, dan Delegasi PIC). Khusus WIG002 + ga.manage; karyawan PIC
 * yang ditunjuk memakai route /employee/equipment/settings.
 */
export default async function GaEquipmentSettingsPage() {
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!isEquipmentMasterAdmin(session)) redirect("/ga");

    return (
        <EquipmentSettingsPanel
            allowedScopes={EQUIPMENT_SETTINGS_SCOPES}
            canManageDelegates
            mode="ga"
        />
    );
}
