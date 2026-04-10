import webPush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;

webPush.setVapidDetails(
    "mailto:it.wijayainovasigemilang@gmail.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE,
);

export { webPush };
