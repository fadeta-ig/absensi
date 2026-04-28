"use client";

import { useEffect, useState } from "react";
import { Sun, Sparkles } from "lucide-react";

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
    const [greeting, setGreeting] = useState("Halo!");
    const [motivation, setMotivation] = useState("");

    useEffect(() => {
        // Set greeting message based on current time on client side
        const hour = new Date().getHours();
        if (hour < 12) {
            setGreeting("Selamat Pagi!");
            setMotivation("Awali hari dengan energi positif dan fokus penuh. Jadikan setiap detik sebagai peluang untuk menciptakan mahakarya terbaikmu.");
        } else if (hour < 15) {
            setGreeting("Selamat Siang!");
            setMotivation("Jaga momentum produktivitasmu! Hambatan hanyalah batu loncatan menuju inovasi dan kesuksesan.");
        } else if (hour < 18) {
            setGreeting("Selamat Sore!");
            setMotivation("Terus melangkah walau lelah mulai terasa. Selesaikan tugas hari ini dengan standar kualitas tertinggi dan dedikasi penuh!");
        } else {
            setGreeting("Selamat Malam!");
            setMotivation("Waktunya untuk beristirahat dan memulihkan energi setelah seharian bekerja keras. Banggalah pada setiap progres yang sudah kamu capai hari ini.");
        }

        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

        const autoSubscribe = async () => {
            try {
                // Request permission quietly; it might pop up browser's native prompt if not decided yet
                const permission = await Notification.requestPermission();
                if (permission !== "granted") return;

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

                    await fetch("/api/push/subscribe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(subscription.toJSON()),
                    });
                }
            } catch (err) {
                console.error("Auto push subscribe background error:", err);
            }
        };

        autoSubscribe();
    }, []);

    return (
        <div className="bg-gradient-to-br from-amber-50 to-orange-100 border border-orange-200 rounded-xl p-5 shadow-sm relative overflow-hidden">
            {/* Decorative background circle */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-300/30 rounded-full blur-3xl"></div>
            
            <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-200/60 flex items-center justify-center shrink-0 shadow-inner">
                    <Sun className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                    <h3 className="text-base font-bold text-orange-900 flex items-center gap-2">
                        {greeting} - Happy Shine On You <Sparkles className="w-4 h-4 text-orange-500" />
                    </h3>
                    <p className="text-xs text-orange-800 mt-1 leading-relaxed max-w-md">
                        {motivation}
                    </p>
                </div>
            </div>
        </div>
    );
}

