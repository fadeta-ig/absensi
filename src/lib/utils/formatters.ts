export function formatRupiah(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

const GELAR_DEPAN = ["ir", "drs", "dra", "dr", "drg", "prof", "h", "hj", "kh", "hjh", "hja", "ust", "usts", "ustadz", "apt", "mgr", "rm", "br", "sr"];

const GELAR_BELAKANG = [
    "st", "mt", "ipm", "mba", "sh", "mm", "se", "skom", "sfarm", "sm", "macc", "amd",
    "cfrm", "csba", "ciomp", "cscm", "asean eng",
];

function isGelarBelakangToken(token: string, dotted: boolean): boolean {
    const clean = token.replace(/\./g, "").trim();
    if (!clean) return true;
    const lower = clean.toLowerCase();
    if (GELAR_BELAKANG.includes(lower)) return true;
    // Inisial tunggal kapital di posisi gelar (S.H. -> S, H).
    if (/^[A-Z]$/.test(clean)) return true;
    if (!dotted) {
        // Tanpa titik: hanya akronim kapital (RT, SE) — kata biasa ("Anak") ditolak.
        return /^[A-Z&]{2,5}$/.test(clean);
    }
    // Bagian dari chunk bertitik (S.Hum -> Hum, A.Md.PJK -> Md, CPPIM. -> CPPIM): 1-5 huruf.
    return /^[A-Za-z]{1,5}$/.test(clean);
}

/**
 * Hilangkan gelar akademik dari nama karyawan untuk tampilan UI.
 * Contoh: "Ir. Anang Siswanto, ST.,MT." -> "Anang Siswanto".
 * Aman: inisial depan ("A. Yani") dipertahankan; segmen koma yang bukan
 * gelar membatalkan stripping belakang ("Budi, Anak Pak RT" utuh).
 */
export function stripGelar(fullName: string | null | undefined): string {
    if (!fullName) return "";
    let rest = fullName.trim().replace(/\s+/g, " ");
    if (!rest) return "";

    // Gelar depan (allowlist ketat, titik opsional, berulang)
    for (;;) {
        const match = rest.match(/^([A-Za-z]{1,6})\.?\s+/);
        if (!match) break;
        if (!GELAR_DEPAN.includes(match[1].toLowerCase())) break;
        rest = rest.slice(match[0].length);
    }
    if (!rest) return "";

    const commaIndex = rest.indexOf(",");
    if (commaIndex === -1) return rest;

    const head = rest.slice(0, commaIndex).trim();
    const tailSegments = rest.slice(commaIndex + 1).split(",");
    const allGelar = tailSegments.every((seg) =>
        seg.trim().split(/\s+/).filter(Boolean).every((chunk) => {
            const dotted = chunk.includes(".");
            return chunk.split(/[.]+/).filter(Boolean).every((token) => isGelarBelakangToken(token, dotted));
        })
    );
    if (!allGelar || !head) return rest;
    return head;
}
