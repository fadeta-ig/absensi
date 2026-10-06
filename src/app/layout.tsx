import type { Metadata, Viewport } from "next";
import "./globals.css";
import ConfirmModal from "@/components/ConfirmModal";
import ToastContainer from "@/components/Toast";

import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "WIG HRIS - PT Wijaya Inovasi Gemilang",
  description: "Sistem HRIS & Presensi Karyawan PT Wijaya Inovasi Gemilang",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WIG HRIS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
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
          defaultTheme="light"
          enableSystem={false}
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
