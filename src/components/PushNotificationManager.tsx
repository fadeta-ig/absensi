"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useToast } from "@/components/Toast";
import { getPushStatus, subscribePush, toPushErrorMessage, type PushStatus } from "@/lib/pushClient";

export default function PushNotificationManager() {
    const toast = useToast();
    const [status, setStatus] = useState<PushStatus | "checking">("checking");
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const s = await getPushStatus();
        setStatus(s.status);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const handleEnable = useCallback(async () => {
        setBusy(true);
        try {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") {
                setStatus("denied");
                toast("Izin notifikasi ditolak. Aktifkan lewat ikon gembok di address bar.", "warning");
                return;
            }
            await subscribePush();
            setStatus("on");
            toast("Notifikasi push aktif di perangkat ini.", "success");
        } catch (error) {
            reportClientError("PushNotificationManager", "Gagal mengaktifkan notifikasi", error);
            setStatus("error");
            toast(toPushErrorMessage(error), "error");
        } finally {
            setBusy(false);
        }
    }, [toast]);

    if (status === "checking") return null;
    if (status !== "off") return null;

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => { void handleEnable(); }}
                disabled={busy}
                className="btn btn-secondary btn-sm"
            >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3 h-3" />}
                {busy ? "Mengaktifkan…" : "Aktifkan Notifikasi"}
            </button>
        </div>
    );
}
