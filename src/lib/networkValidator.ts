import { NextRequest } from "next/server";

/**
 * Daftar IP dan subnet resmi jaringan Wi-Fi Kantor WIG & MKI:
 * - 192.168.20.1  : IP Gateway MikroTik RB4011 untuk interface '10-Jaringan' (Hairpin NAT)
 * - 192.168.20.0/24 : Subnet lokal perangkat Wi-Fi kantor
 * - 202.152.141.27: IP Publik Statis Citranet Kantor WIG
 */
export const OFFICE_ALLOWED_IPS = [
    "192.168.20.1",
    "202.152.141.27",
];

export const OFFICE_SUBNET_PREFIXES = [
    "192.168.20.",
];

/**
 * Mengekstrak IP klien sebenarnya dari request headers HTTP.
 * Membaca 'x-forwarded-for' (prioritas IP pertama jika melalui reverse proxy Nginx)
 * atau fallback ke 'x-real-ip'.
 */
export function extractClientIp(request: NextRequest): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        const firstIp = forwarded.split(",")[0].trim();
        if (firstIp) return firstIp;
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();

    return "";
}

/**
 * Memvalidasi apakah IP pengirim berasal dari jaringan Wi-Fi resmi kantor WIG.
 */
export function isOfficeWifiNetwork(ip: string): boolean {
    if (!ip) return false;

    // Toleransi environment lokal / test development
    if (process.env.NODE_ENV !== "production") {
        if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
            return true;
        }
    }

    if (OFFICE_ALLOWED_IPS.includes(ip)) {
        return true;
    }

    for (const prefix of OFFICE_SUBNET_PREFIXES) {
        if (ip.startsWith(prefix)) {
            return true;
        }
    }

    return false;
}
