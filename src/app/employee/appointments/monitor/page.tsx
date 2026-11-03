import { redirect } from "next/navigation";

/** Route lama Pantau E-Meeting: monitoring pindah ke Pantau Tugas. */
export default function EmployeeMeetingMonitorRedirectPage() {
    redirect("/employee/my-tasks/monitoring");
}
