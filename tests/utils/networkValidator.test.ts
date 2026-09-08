import { describe, it, expect } from "vitest";
import { isOfficeWifiNetwork, extractClientIp } from "@/lib/networkValidator";
import { NextRequest } from "next/server";

describe("Network Validator - Office Wi-Fi WIG", () => {
    describe("isOfficeWifiNetwork", () => {
        it("harus meloloskan IP gateway MikroTik Hairpin NAT (192.168.20.1)", () => {
            expect(isOfficeWifiNetwork("192.168.20.1")).toBe(true);
        });

        it("harus meloloskan IP subnet Wi-Fi kantor (192.168.20.x)", () => {
            expect(isOfficeWifiNetwork("192.168.20.55")).toBe(true);
            expect(isOfficeWifiNetwork("192.168.20.102")).toBe(true);
        });

        it("harus meloloskan IP publik statis Citranet (202.152.141.27)", () => {
            expect(isOfficeWifiNetwork("202.152.141.27")).toBe(true);
        });

        it("harus menolak IP paket data seluler Telkomsel (182.4.102.12)", () => {
            expect(isOfficeWifiNetwork("182.4.102.12")).toBe(false);
        });

        it("harus menolak IP acak / IP rumah lain", () => {
            expect(isOfficeWifiNetwork("114.124.50.21")).toBe(false);
            expect(isOfficeWifiNetwork("192.168.1.1")).toBe(false);
            expect(isOfficeWifiNetwork("10.0.0.1")).toBe(false);
            expect(isOfficeWifiNetwork("")).toBe(false);
        });
    });

    describe("extractClientIp", () => {
        it("harus membaca IP pertama dari x-forwarded-for", () => {
            const req = new NextRequest("http://localhost:3000/api/attendance", {
                headers: {
                    "x-forwarded-for": "192.168.20.1, 103.112.45.1",
                },
            });
            expect(extractClientIp(req)).toBe("192.168.20.1");
        });

        it("harus membaca x-real-ip jika x-forwarded-for tidak ada", () => {
            const req = new NextRequest("http://localhost:3000/api/attendance", {
                headers: {
                    "x-real-ip": "192.168.20.55",
                },
            });
            expect(extractClientIp(req)).toBe("192.168.20.55");
        });
    });
});
