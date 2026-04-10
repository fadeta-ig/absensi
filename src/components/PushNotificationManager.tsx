"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "@/components/Toast";

/** Convert a base64 URL string to a Uint8Array for the applicationServerKey */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export default function PushNotificationManager() {
    const toast = useToast();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

        setIsSupported(true);

        navigator.serviceWorker.ready.then(async (registration) => {
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        });
    }, []);

    const handleSubscribe = async () => {
        if (!isSupported) return;
        setLoading(true);

        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                toast("Izin notifikasi ditolak oleh browser.", "error");
                setLoading(false);
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
            });

            const res = await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription.toJSON()),
            });

            if (res.ok) {
                setIsSubscribed(true);
                toast("Notifikasi push berhasil diaktifkan! 🔔", "success");
            } else {
                toast("Gagal mendaftarkan notifikasi push.", "error");
            }
        } catch (err) {
            console.error("Push subscribe error:", err);
            toast("Terjadi kesalahan saat mengaktifkan notifikasi.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleUnsubscribe = async () => {
        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                await fetch("/api/push/subscribe", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
                await subscription.unsubscribe();
            }

            setIsSubscribed(false);
            toast("Notifikasi push dinonaktifkan.", "info");
        } catch (err) {
            console.error("Push unsubscribe error:", err);
            toast("Gagal menonaktifkan notifikasi.", "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isSupported) return null;

    return (
        <button
            onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                isSubscribed
                    ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                    : "bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100"
            } ${loading ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
            title={isSubscribed ? "Nonaktifkan notifikasi harian" : "Aktifkan notifikasi harian"}
        >
            {isSubscribed ? (
                <>
                    <Bell className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Notifikasi Aktif</span>
                </>
            ) : (
                <>
                    <BellOff className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Aktifkan Notifikasi</span>
                </>
            )}
        </button>
    );
}
