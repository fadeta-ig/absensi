import { redirect } from "next/navigation";

/** Route lama Task Meeting: pengelolaan task pindah ke modul Tugas Saya. */
export default function EmployeeMeetingTasksRedirectPage() {
    redirect("/employee/my-tasks");
}
