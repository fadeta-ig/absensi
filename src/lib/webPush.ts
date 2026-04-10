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

        if (!publicKey || !privateKey) {
            throw new Error(
                "VAPID keys are not set. Please configure NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment."
            );
        }

        webPushLib.setVapidDetails(
            "mailto:it.wijayainovasigemilang@gmail.com",
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
