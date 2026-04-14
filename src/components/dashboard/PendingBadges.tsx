"use client";

import { useRouter } from "next/navigation";
import { CalendarOff, MapPinned, Clock4 } from "lucide-react";

interface PendingBadgesProps {
    pendingLeaves: number;
    pendingVisits: number;
    pendingOvertime: number;
}

export default function PendingBadges({ pendingLeaves, pendingVisits, pendingOvertime }: PendingBadgesProps) {
    const router = useRouter();

    if (pendingLeaves === 0 && pendingVisits === 0 && pendingOvertime === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {pendingLeaves > 0 && (
                <button onClick={() => router.push("/dashboard/leave")} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors">
                    <CalendarOff className="w-3.5 h-3.5" /> {pendingLeaves} cuti menunggu
                </button>
            )}
            {pendingVisits > 0 && (
                <button onClick={() => router.push("/dashboard/visits")} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                    <MapPinned className="w-3.5 h-3.5" /> {pendingVisits} kunjungan menunggu
                </button>
            )}
            {pendingOvertime > 0 && (
                <button onClick={() => router.push("/dashboard/overtime")} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors">
                    <Clock4 className="w-3.5 h-3.5" /> {pendingOvertime} lembur menunggu
                </button>
            )}
        </div>
    );
}
