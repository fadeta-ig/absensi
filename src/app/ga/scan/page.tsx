"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, QrCode, Package, ClipboardCheck, Wrench, X } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";

function ScanContent() {
    const router = useRouter();
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    
    // Action Sheet State
    const [scannedAsset, setScannedAsset] = useState<{ id: string, name: string, code: string, status: string, kondisi: string } | null>(null);
    const [loadingAsset, setLoadingAsset] = useState(false);

    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        import("html5-qrcode").then((html5Qrcode) => {
            if (scannerRef.current) return;
            
            const scanner = new html5Qrcode.Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );
            
            scanner.render((decodedText) => {
                scanner.pause(true); // Pause scanning
                setScanResult(decodedText);
                
                try {
                    const url = new URL(decodedText);
                    if (url.origin !== window.location.origin) {
                        throw new Error("Bukan aset perusahaan (Origin Mismatch)");
                    }

                    if (url.pathname.startsWith('/scan/') || url.pathname.startsWith('/ga/assets/')) {
                        const assetId = url.pathname.split('/').pop();
                        if (!assetId) throw new Error("ID Aset tidak ditemukan di QR");
                        
                        // Fetch asset info
                        setLoadingAsset(true);
                        fetch(`/api/assets/${assetId}`)
                            .then(res => {
                                if (!res.ok) throw new Error("Aset tidak ditemukan di database");
                                return res.json();
                            })
                            .then(data => {
                                setScannedAsset({
                                    id: data.id,
                                    name: data.name,
                                    code: data.assetCode,
                                    status: data.status,
                                    kondisi: data.kondisi
                                });
                            })
                            .catch(err => {
                                setErrorMsg(err.message);
                            })
                            .finally(() => setLoadingAsset(false));
                            
                    } else {
                        throw new Error("Bukan QR Asset Perusahaan");
                    }
                } catch (e: any) {
                    setErrorMsg(e.message || "QR Code tidak valid.");
                }
            }, (error) => {});
            
            scannerRef.current = scanner;
            setScanning(true);
        });

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(console.error);
                scannerRef.current = null;
            }
        };
    }, []);

    const handleResume = () => {
        setScanResult(null);
        setScannedAsset(null);
        setErrorMsg(null);
        if (scannerRef.current) {
            scannerRef.current.resume();
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto flex flex-col items-center gap-6 min-h-screen relative">
            <div className="w-full flex items-center justify-between pb-4 border-b border-[var(--border)]">
                <button onClick={() => router.back()} className="p-2 border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--secondary)] transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div className="text-right">
                    <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">Scan QR Aset</h1>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Arahkan kamera ke label pintar.</p>
                </div>
            </div>

            <div className="w-full bg-[var(--card)] border rounded-xl overflow-hidden shadow-sm flex flex-col items-center p-6 relative z-10">
                <div className="bg-[var(--secondary)] border rounded-lg overflow-hidden w-full max-w-md aspect-square flex flex-col justify-center items-center relative">
                    <div id="reader" className="w-full h-full"></div>
                    {!scanning && !scanResult && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--secondary)] flex-col gap-3">
                            <QrCode size={40} className="text-[var(--text-muted)] animate-pulse" />
                            <span className="text-sm font-semibold text-[var(--text-secondary)]">Mempersiapkan Kamera...</span>
                        </div>
                    )}
                </div>

                {errorMsg && (
                    <div className="mt-6 p-4 w-full bg-red-50 text-red-800 border border-red-200 rounded-xl text-center">
                        <p className="text-sm font-bold mb-1">Peringatan:</p>
                        <p className="text-xs">{errorMsg}</p>
                        <button 
                            onClick={handleResume}
                            className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
                        >
                            Coba Lagi
                        </button>
                    </div>
                )}
            </div>
            
            <p className="text-xs text-center text-[var(--text-muted)] max-w-sm">Pastikan izin kamera browser telah diberikan untuk memindai QR Code.</p>

            {/* Bottom Action Sheet Modal */}
            {scannedAsset && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-[var(--foreground)] text-[var(--background)]/50 backdrop-blur-sm">
                    <div className="bg-[var(--card)] w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
                        <div className="p-6 border-b border-[var(--border)] flex items-start justify-between relative">
                            <div>
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">{scannedAsset.name}</h2>
                                <p className="text-sm font-mono text-[var(--text-secondary)] mt-1">{scannedAsset.code}</p>
                                <div className="flex gap-2 mt-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--text-secondary)]">{scannedAsset.status}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--text-secondary)]">{scannedAsset.kondisi}</span>
                                </div>
                            </div>
                            <button onClick={handleResume} className="p-2 bg-[var(--secondary)] text-[var(--text-muted)] rounded-full hover:bg-slate-200 transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-3 bg-[var(--secondary)]">
                            <button 
                                onClick={() => router.push(`/ga/assets/${scannedAsset.id}`)}
                                className="w-full flex items-center justify-between p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-slate-800 hover:ring-1 hover:ring-[var(--ring)] transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--secondary)] flex items-center justify-center text-[var(--text-secondary)] group-hover:bg-[var(--foreground)] text-[var(--background)] group-hover: transition-colors">
                                        <Package size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-[var(--text-primary)]">Lihat Detail Aset</div>
                                        <div className="text-xs text-[var(--text-secondary)]">Cek spesifikasi dan riwayat mutasi</div>
                                    </div>
                                </div>
                            </button>

                            <button 
                                onClick={() => router.push(`/ga/assets/${scannedAsset.id}?tab=inspections`)}
                                className="w-full flex items-center justify-between p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-emerald-600 hover:ring-1 hover:ring-emerald-600 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <ClipboardCheck size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-[var(--text-primary)]">Lakukan Inspeksi</div>
                                        <div className="text-xs text-[var(--text-secondary)]">Isi checklist kondisi fisik terkini</div>
                                    </div>
                                </div>
                            </button>

                            <button 
                                onClick={() => router.push(`/ga/assets/${scannedAsset.id}?tab=maintenance`)}
                                className="w-full flex items-center justify-between p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-amber-600 hover:ring-1 hover:ring-amber-600 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                        <Wrench size={20} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-[var(--text-primary)]">Catat Servis</div>
                                        <div className="text-xs text-[var(--text-secondary)]">Laporkan kerusakan atau maintenance</div>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {loadingAsset && !scannedAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--foreground)] text-[var(--background)]/50 backdrop-blur-sm">
                    <div className="bg-[var(--card)] p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
                        <div className="w-8 h-8 border-4 border-[var(--border)] border-t-slate-800 rounded-full animate-spin"></div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Mencari Data Aset...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AssetScannerPage() {
    return (
        <Suspense fallback={<div className="p-6">Loading...</div>}>
            <ScanContent />
        </Suspense>
    );
}
