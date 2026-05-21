import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConfirmModal from "@/components/ConfirmModal";
import ToastContainer from "@/components/Toast";

import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "WIG HRIS - PT Wijaya Inovasi Gemilang",
  description: "Sistem Absensi Karyawan PT Wijaya Inovasi Gemilang",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#800000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <ConfirmModal />
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
