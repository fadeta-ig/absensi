import { redirect } from "next/navigation";

/**
 * GET /employee/settings → dialihkan permanen ke hub akun /employee/profile.
 * Kartu keamanan (ganti password + passkey) kini tinggal di profil (#keamanan).
 */
export default function EmployeeSettingsRedirectPage() {
    redirect("/employee/profile");
}
