"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { unsubscribePush } from "@/lib/pushClient";
import { notifyAuthChanged } from "@/lib/authEvents";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

/**
 * Urutan logout employee (satu-satunya definisi):
 * unsubscribe push → POST /api/auth/logout → notify → replace("/").
 * Dipakai layout portal (sidebar) dan AllMenusSheet.
 */
export function useEmployeeLogout() {
    const router = useRouter();
    const toast = useToast();
    const [loggingOut, setLoggingOut] = useState(false);
    const busyRef = useRef(false);

    const logout = useCallback(async () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setLoggingOut(true);
        toast("Memproses logout...", "info");
        try {
            void unsubscribePush();
            const res = await fetch("/api/auth/logout", { method: "POST" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal logout."));
            notifyAuthChanged("logout");
            router.replace("/");
        } catch (error) {
            reportClientError("EmployeeLogout", "Logout employee gagal", error);
            toast(error instanceof Error ? error.message : "Gagal logout.", "error");
            busyRef.current = false;
            setLoggingOut(false);
        }
    }, [router, toast]);

    return { logout, loggingOut };
}
