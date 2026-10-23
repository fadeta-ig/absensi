"use client";

import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export type PushStatus = "unsupported" | "denied" | "off" | "on" | "error";

export async function getPushStatus(): Promise<{ status: PushStatus; detail?: string }> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return { status: "unsupported", detail: "Browser tidak mendukung push notification." };
    }
    if (!VAPID_PUBLIC_KEY) {
        return { status: "error", detail: "Kunci VAPID belum dikonfigurasi." };
    }
    if (Notification.permission === "denied") {
        return { status: "denied", detail: "Izin notifikasi diblokir di pengaturan browser." };
    }
    try {
        const reg = await getRegistration();
        const sub = await reg.pushManager.getSubscription();
        if (sub) return { status: "on" };
        return { status: Notification.permission === "granted" ? "error" : "off" };
    } catch (error) {
        reportClientError("pushClient", "Gagal cek status push", error);
        return { status: "error", detail: "Gagal memeriksa status langganan." };
    }
}

function toPushErrorMessage(error: unknown): string {
    const name = error instanceof Error ? error.name : "";
    if (name === "InvalidAccessError") return "Kunci VAPID tidak valid. Hubungi admin IT.";
    if (name === "NotAllowedError") return "Izin notifikasi ditolak. Aktifkan lewat ikon gembok di address bar.";
    if (name === "AbortError") return "Pendaftaran dibatalkan. Coba lagi.";
    if (name === "NotSupportedError") return "Perangkat ini tidak mendukung push notification.";
    return error instanceof Error ? error.message : "Gagal mengaktifkan notifikasi.";
}

export async function subscribePush(): Promise<void> {
    const reg = await getRegistration();
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey.buffer.slice(applicationServerKey.byteOffset, applicationServerKey.byteOffset + applicationServerKey.byteLength) as ArrayBuffer }));
    const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan langganan."));
}

export async function unsubscribePush(): Promise<void> {
    try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (sub) await sub.unsubscribe();
        if (endpoint) {
            await fetch("/api/push/subscribe", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint }),
            }).catch(() => undefined);
        }
    } catch (error) {
        reportClientError("pushClient", "Gagal berhenti langganan push", error);
    }
}

export { toPushErrorMessage, VAPID_PUBLIC_KEY };
