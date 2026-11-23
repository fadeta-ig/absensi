import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth";
import { isWig002Session } from "@/lib/services/outsourceUserService";
import OutsourceUsersPanel from "@/components/ga/OutsourceUsersPanel";

/**
 * /ga/outsource-users — Modul manajemen akun Outsource (OS) & RBAC E-Checklist.
 * Ketat WIG002-only (dicek server-side sebelum halaman dirender).
 */
export default async function GaOutsourceUsersPage() {
    const session = await getActiveSession();
    if (!session) redirect("/");
    if (!isWig002Session(session)) redirect("/ga");

    return <OutsourceUsersPanel />;
}
