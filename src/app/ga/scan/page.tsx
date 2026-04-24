"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, QrCode } from "lucide-react";

import { Html5QrcodeScanner } from "html5-qrcode";

export default function AssetScannerPage() {
    const router = useRouter();
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        // Only run on client after mount to avoid SSR issues with html5-qrcode
        import("html5-qrcode").then((html5Qrcode) => {
            if (scannerRef.current) return;
            
            const scanner = new html5Qrcode.Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );
            
            scanner.render((decodedText) => {
                setScanResult(decodedText);
                scanner.clear(); // Stop scanning once successfully decoded
                
                // Parse URL safely
                try {
                    const url = new URL(decodedText);
                    
                    // Security Validation: Prevent spoofing by ensuring the origin matches our internal portal
                    if (url.origin !== window.location.origin) {
                        throw new Error("Bukan aset perusahaan (Origin Mismatch)");
                    }

                    // Mendukung path baru /scan/ dan path lama /ga/assets/ (backward-compatibility)
                    if (url.pathname.startsWith('/scan/') || url.pathname.startsWith('/ga/assets/')) {
                        router.push(url.pathname);
                    } else {
                        throw new Error("Bukan QR Asset Perusahaan");
                    }
                } catch (e: unknown) {
                    setErrorMsg((e as Error).message || "QR Code tidak valid atau bukan aset perusahaan.");
                    // Let user rescan by reloading or clicking a button
                }
            }, (error) => {
                // Ignore frequent scan errors when no QR is in frame
            });
            
            scannerRef.current = scanner;
            setScanning(true);
        });

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
                scannerRef.current = null;
            }
        };
    }, [router]);

    return (
        <div className="p-6 max-w-2xl mx-auto flex flex-col items-center gap-6 min-h-screen">
            <div className="w-full flex items-center justify-between pb-4 border-b border-slate-200">
                <button onClick={() => router.back()} className="p-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div className="text-right">
                    <h1 className="text-xl font-bold tracking-tight text-slate-800">Scan QR Aset</h1>
                    <p className="text-xs text-slate-500 mt-1">Arahkan kamera ke label pintar.</p>
                </div>
            </div>

            <div className="w-full bg-white border rounded-xl overflow-hidden shadow-sm flex flex-col items-center p-6">
                <div className="bg-slate-50 border rounded-lg overflow-hidden w-full max-w-md aspect-square flex flex-col justify-center items-center relative">
                    <div id="reader" className="w-full h-full"></div>
                    {!scanning && !scanResult && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 flex-col gap-3">
                            <QrCode size={40} className="text-slate-300 animate-pulse" />
                            <span className="text-sm font-semibold text-slate-500">Mempersiapkan Kamera...</span>
                        </div>
                    )}
                </div>

                {scanResult && (
                    <div className="mt-6 p-4 w-full bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-center">
                        <p className="text-sm font-bold mb-1">Berhasil Memindai:</p>
                        <p className="text-xs font-mono break-all">{scanResult}</p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="mt-3 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                        >
                            Scan Ulang
                        </button>
                    </div>
                )}
                
                {errorMsg && (
                    <div className="mt-6 p-4 w-full bg-red-50 text-red-800 border border-red-200 rounded-xl text-center">
                        <p className="text-sm font-bold mb-1">Peringatan:</p>
                        <p className="text-xs">{errorMsg}</p>
                        <button 
                            onClick={() => { setErrorMsg(null); window.location.reload(); }}
                            className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
                        >
                            Coba Lagi
                        </button>
                    </div>
                )}
            </div>
            
            <p className="text-xs text-center text-slate-400 max-w-sm">Pastikan izin kamera browser telah diberikan untuk memindai QR Code.</p>
        </div>
    );
}
