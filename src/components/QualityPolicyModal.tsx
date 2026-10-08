"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";

type QualityPolicyModalProps = {
    open: boolean;
    onAgree: () => void;
};

const MKI_POLICY = [
    "Mutu produk dan layanan secara konsisten, andal, serta sesuai dengan kebutuhan dan harapan pelanggan menjadi jaminan utama.",
    "Kepatuhan terhadap seluruh peraturan, standar, dan persyaratan yang berlaku sebagai wujud komitmen terhadap integritas, keselamatan, dan tanggung jawab perusahaan.",
    "Inovasi dan perbaikan berkesinambungan dalam setiap proses kerja guna meningkatkan efisiensi, efektivitas, dan daya saing perusahaan.",
];

const WIG_POLICY = [
    "Worth Quality menjadi dasar utama layanan dalam mewujudkan kepuasan pelanggan.",
    "Integrity Compliance terhadap regulasi merupakan komitmen utama tanggung jawab perusahaan.",
    "Growth Improvement menjadi dorongan kuat dalam perbaikan dan peningkatan kinerja organisasi di seluruh tingkatan.",
];

export default function QualityPolicyModal({ open, onAgree }: QualityPolicyModalProps) {
    const [agreed, setAgreed] = useState(false);
    const [hasReadAll, setHasReadAll] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Jika konten muat tanpa scroll (layar tinggi), langsung anggap sudah dibaca.
    useEffect(() => {
        if (!open) return;
        const el = contentRef.current;
        if (el && el.scrollHeight <= el.clientHeight + 24) {
            setHasReadAll(true);
        }
    }, [open ]);

    const handleScroll = () => {
        const el = contentRef.current;
        if (!el || hasReadAll) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight <= 24) {
            setHasReadAll(true);
        }
    };

    if (!open) return null;

    return (
        <AccessibleModal
            ariaLabel="Kebijakan Mutu Perusahaan"
            onClose={() => {}}
            disableClose
            closeOnBackdrop={false}
            className="max-w-lg"
        >
            <div className="modal-header">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[var(--primary)]" />
                    <h2 className="modal-title">Kebijakan Mutu</h2>
                </div>
            </div>

            <div
                ref={contentRef}
                onScroll={handleScroll}
                className="max-h-[50vh] overflow-y-auto px-5 py-4 space-y-5 text-sm"
            >
                <section>
                    <h3 className="font-semibold text-[var(--text-primary)] mb-2">
                        Kebijakan Mutu PT Mahakarya Kosmetika Indonesia
                    </h3>
                    <ol className="list-decimal list-outside ml-5 space-y-1.5 text-[var(--text-secondary)]">
                        {MKI_POLICY.map((item, i) => (
                            <li key={i}>
                                <strong className="text-[var(--text-primary)]">
                                    {i === 0 ? "Mutu: " : i === 1 ? "Kepatuhan: " : "Inovasi Berkelanjutan: "}
                                </strong>
                                {item}
                            </li>
                        ))}
                    </ol>
                </section>

                <section>
                    <h3 className="font-semibold text-[var(--text-primary)] mb-2">
                        Kebijakan Mutu PT Wijaya Inovasi Gemilang
                    </h3>
                    <ol className="list-decimal list-outside ml-5 space-y-1.5 text-[var(--text-secondary)]">
                        {WIG_POLICY.map((item, i) => (
                            <li key={i}>
                                <strong className="text-[var(--text-primary)]">
                                    {i === 0 ? "Worth Quality: " : i === 1 ? "Integrity Compliance: " : "Growth Improvement: "}
                                </strong>
                                {item}
                            </li>
                        ))}
                    </ol>
                </section>
            </div>

            <div className="px-5 pb-5 pt-1 space-y-4">
                <label className={`flex items-start gap-2.5 select-none ${hasReadAll ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                    <input
                        type="checkbox"
                        checked={agreed}
                        disabled={!hasReadAll}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 text-[var(--primary)] bg-[var(--secondary)] border-[var(--border)] rounded focus:ring-[var(--primary)] focus:ring-2 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-[var(--text-secondary)]">
                        {hasReadAll
                            ? "Saya telah membaca dan memahami Kebijakan Mutu di atas."
                            : "Gulir ke bawah hingga selesai untuk membaca seluruh Kebijakan Mutu."}
                    </span>
                </label>

                <button
                    type="button"
                    onClick={onAgree}
                    disabled={!agreed}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-light,#9B1B30)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                    Lanjut ke Login
                </button>
            </div>
        </AccessibleModal>
    );
}
