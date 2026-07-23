"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, QrCode, Package, ClipboardCheck, Wrench, X, Loader2 } from "lucide-react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import AccessibleModal from "@/components/ui/AccessibleModal";

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
                            .then(async (res) => {
                                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Aset tidak ditemukan di database"));
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
                                reportClientError("AssetScannerPage", "Gagal mengambil data aset hasil scan", err, { assetId });
                                setErrorMsg(err.message);
                            })
                            .finally(() => setLoadingAsset(false));
                            
                    } else {
                        throw new Error("Bukan QR Asset Perusahaan");
                    }
                } catch (error: unknown) {
                    setErrorMsg(error instanceof Error ? error.message : "QR Code tidak valid.");
                }
            }, (error) => {
                const message = String(error).toLowerCase();
                const isCameraRuntimeError =
                    message.includes("permission") ||
                    message.includes("notallowed") ||
                    message.includes("notfound") ||
                    message.includes("camera") ||
                    message.includes("overconstrained") ||
                    message.includes("notreadable");

                if (isCameraRuntimeError) {
                    setScanning(false);
                    setErrorMsg("Kamera tidak dapat diakses. Periksa izin kamera browser dan coba lagi.");
                }
            });
            
            scannerRef.current = scanner;
            setScanning(true);
        }).catch((error) => {
            reportClientError("AssetScannerPage", "Scanner QR gagal dimuat", error);
            setScanning(false);
            setErrorMsg("Scanner QR gagal dimuat. Muat ulang halaman lalu coba lagi.");
        });

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch((error) => {
                    reportClientError("AssetScannerPage", "Gagal membersihkan scanner QR", error);
                });
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
                    <FeedbackMessage variant="error" title="Pemindaian terhenti" className="mt-6 w-full">
                        <p className="text-xs">{errorMsg}</p>
                        <button 
                            onClick={handleResume}
                            className="mt-3 px-4 py-1.5 bg-[var(--destructive)] text-[var(--destructive-foreground)] rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                        >
                            Coba Lagi
                        </button>
                    </FeedbackMessage>
                )}
            </div>
            
            <p className="text-xs text-center text-[var(--text-muted)] max-w-sm">Pastikan izin kamera browser telah diberikan untuk memindai QR Code.</p>

            {/* Bottom Action Sheet Modal */}
            {scannedAsset && (
                <AccessibleModal
                    ariaLabel={`Aksi untuk aset ${scannedAsset.name}`}
                    onClose={handleResume}
                    className="w-full max-w-md !p-0 rounded-t-3xl sm:rounded-2xl overflow-hidden"
                    overlayClassName="items-end sm:items-center"
                >
                        <div className="p-6 border-b border-[var(--border)] flex items-start justify-between relative">
                            <div>
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">{scannedAsset.name}</h2>
                                <p className="text-sm font-mono text-[var(--text-secondary)] mt-1">{scannedAsset.code}</p>
                                <div className="flex gap-2 mt-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--text-secondary)]">{scannedAsset.status}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--text-secondary)]">{scannedAsset.kondisi}</span>
                                </div>
                            </div>
                            <button onClick={handleResume} className="p-2 bg-[var(--secondary)] text-[var(--text-muted)] rounded-full hover:bg-[var(--border)] transition-colors" aria-label="Tutup pilihan aksi aset">
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
                </AccessibleModal>
            )}
            
            {loadingAsset && !scannedAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="status" aria-live="polite">
                    <div className="bg-[var(--card)] p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Mencari data aset...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AssetScannerPage() {
    return (
        <Suspense fallback={<div className="p-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 className="w-4 h-4 animate-spin" />Memuat pemindai QR...</div>}>
            <ScanContent />
        </Suspense>
    );
}
