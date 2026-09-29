import { redirect } from "next/navigation";

export default function AttendanceCorrectionRedirect() {
    redirect("/dashboard/attendance?tab=corrections");
}
