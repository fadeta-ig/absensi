import webPushLib from "web-push";

/**
 * Lazy-initialized web-push instance.
 * VAPID details are set at runtime (first call), not at module load time.
 * This prevents build-time errors when env vars are not available.
 */
let initialized = false;

function getWebPush() {
    if (!initialized) {
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        // Alamat kontak operasional untuk laporan penyalahgunaan push (RFC 8292).
        // Dapat dioverride via env VAPID_MAILTO; default ke email IT agar perilaku lama tidak berubah.
        const subject = process.env.VAPID_MAILTO ?? "mailto:it.wijayainovasigemilang@gmail.com";

        if (!publicKey || !privateKey) {
            throw new Error(
                "VAPID keys are not set. Push notification dinonaktifkan sampai kunci dikonfigurasi."
            );
        }

        webPushLib.setVapidDetails(
            subject,
            publicKey,
            privateKey
        );

        initialized = true;
    }

    return webPushLib;
}

export const webPush = {
    sendNotification: (
        ...args: Parameters<typeof webPushLib.sendNotification>
    ) => getWebPush().sendNotification(...args),
};
