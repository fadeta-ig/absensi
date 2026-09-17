"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GreenMeetingRootPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/ga/green-meeting/attendance");
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-2">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground font-medium">Memuat Presensi Green Meeting...</p>
            </div>
        </div>
    );
}
