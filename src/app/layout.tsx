import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConfirmModal from "@/components/ConfirmModal";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: "WIG HRIS - PT Wijaya Inovasi Gemilang",
  description: "Sistem Absensi Karyawan PT Wijaya Inovasi Gemilang",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#800020",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        {children}
        <ConfirmModal />
        <ToastContainer />
      </body>
    </html>
  );
}
