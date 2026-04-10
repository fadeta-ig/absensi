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

            const swReg = await navigator.serviceWorker.getRegistration();
            if (!swReg) {
                toast("Service worker belum siap. Harap refresh halaman.", "error");
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

    if (isSubscribed) {
        return (
            <div className="bg-white/50 border border-green-200 rounded-xl p-4 flex items-center justify-between shadow-sm cursor-default">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Bell className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-green-800">Sapaan Pagi Aktif ☀️</h3>
                        <p className="text-xs text-green-700 mt-0.5">Notifikasi pengingat absen akan dikirim setiap jam 7 pagi.</p>
                    </div>
                </div>
                <button
                    onClick={handleUnsubscribe}
                    disabled={loading}
                    className="shrink-0 px-3 py-1.5 text-xs font-semibold text-green-700 bg-transparent border border-green-300 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                    {loading ? "Menonaktifkan..." : "Nonaktifkan"}
                </button>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-orange-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
            {/* Decorative background circle */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-200/40 rounded-full blur-2xl"></div>
            
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0 shadow-inner">
                        <BellOff className="w-6 h-6 text-orange-500" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-orange-800">Aktifkan Sapaan Pagi! ☀️</h3>
                        <p className="text-xs text-orange-700 mt-1 max-w-sm">
                            Dapatkan pengingat absen dan pesan semangat spesial setiap hari jam 7 pagi langsung di layarmu. Jangan sampai lupa absen!
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleSubscribe}
                    disabled={loading}
                    className="shrink-0 w-full sm:w-auto px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                >
                    {loading ? "Menghubungkan..." : "Aktifkan Sekarang"}
                </button>
            </div>
        </div>
    );
}
