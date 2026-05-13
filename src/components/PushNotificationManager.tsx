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
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_15px_-4px_rgba(0,0,0,0.05)] border border-slate-100 mb-2">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-2 tracking-tight flex items-baseline gap-2">
                {greeting} 
                <span className="font-serif italic font-normal text-slate-500 text-[13px] tracking-wide">
                    Happy Shine On You
                </span>
            </h3>
            <p className="text-[13px] text-slate-600 leading-loose font-medium opacity-90">
                {motivation}
            </p>
        </div>
    );
}

