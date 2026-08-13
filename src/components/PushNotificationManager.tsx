"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

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
    const notifiedRef = useRef(false);

    useEffect(() => {
        const notifyOnce = (message: string, variant: "warning" | "error") => {
            if (notifiedRef.current) return;
            notifiedRef.current = true;
            toast(message, variant);
        };

        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            notifyOnce("Browser tidak mendukung notifikasi push.", "warning");
            return;
        }

        if (!VAPID_PUBLIC_KEY) {
            notifyOnce("Konfigurasi notifikasi push belum tersedia.", "warning");
            return;
        }

        const autoSubscribe = async () => {
            try {
                // Request permission quietly; it might pop up browser's native prompt if not decided yet
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                    notifyOnce("Notifikasi browser belum diizinkan. Aktifkan izin notifikasi untuk menerima pemberitahuan.", "warning");
                    return;
                }

                let swReg = await navigator.serviceWorker.getRegistration();
                if (!swReg) {
                    swReg = await navigator.serviceWorker.register('/sw.js');
                }

                const registration = await navigator.serviceWorker.ready;
                let subscription = await registration.pushManager.getSubscription();
                
                if (!subscription) {
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
                    });

                    const res = await fetch("/api/push/subscribe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(subscription.toJSON()),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengaktifkan notifikasi push."));
                }
            } catch (err) {
                reportClientError("PushNotificationManager", "Gagal mengaktifkan notifikasi push", err);
                notifyOnce(err instanceof Error ? err.message : "Gagal mengaktifkan notifikasi push.", "error");
            }
        };

        autoSubscribe();
    }, [toast]);

    return null;
}

