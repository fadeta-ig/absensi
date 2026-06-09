import { Check, ChevronLeft, ChevronRight, Eye, FileText, Loader2 } from "lucide-react";
import { LetterRequest, TYPE_CONFIG, STATUS_CONFIG } from "../types";

interface Props {
    loading: boolean;
    filteredLength: number;
    paginated: LetterRequest[];
    currentPage: number;
    totalPages: number;
    ITEMS_PER_PAGE: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    setDetail: (req: LetterRequest) => void;
    openAction: (req: LetterRequest, type: "PROCESSING" | "READY" | "REJECTED") => void;
    fmtDate: (iso: string) => string;
}

export function LetterRequestTable({
    loading, filteredLength, paginated, currentPage, totalPages, ITEMS_PER_PAGE,
    setCurrentPage, setDetail, openAction, fmtDate
}: Props) {
    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-40" />
            </div>
        );
    }

    if (filteredLength === 0) {
        return (
            <div className="card p-12 text-center">
                <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-20 mx-auto mb-3" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada permintaan surat ditemukan</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Coba ubah filter pencarian Anda</p>
            </div>
        );
    }

    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Karyawan</th>
                            <th>Jenis Surat</th>
                            <th className="hidden lg:table-cell">Tujuan</th>
                            <th>Tanggal</th>
                            <th>Status</th>
                            <th className="text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((req) => {
                            const typeCfg = TYPE_CONFIG[req.type];
                            const statusCfg = STATUS_CONFIG[req.status];
                            const TypeIcon = typeCfg.icon;
                            const StatusIcon = statusCfg.icon;

                            return (
                                <tr key={req.id} className="hover:bg-[var(--secondary)]/50 transition-colors">
                                    <td className="font-medium">
                                        <div>
                                            <p className="text-[var(--text-primary)]">{req.employeeName ?? req.employeeId}</p>
                                            <p className="text-[10px] text-[var(--text-muted)]">{req.employeeId}</p>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${typeCfg.bg}`}>
                                                <TypeIcon className={`w-3.5 h-3.5 ${typeCfg.color}`} />
                                            </div>
                                            <span className="text-sm font-medium text-[var(--text-primary)]">{typeCfg.label}</span>
                                        </div>
                                    </td>
                                    <td className="hidden lg:table-cell">
                                        <p className="text-sm text-[var(--text-secondary)] line-clamp-2 max-w-[300px]">{req.purpose}</p>
                                    </td>
                                    <td className="text-sm text-[var(--text-secondary)]">
                                        {fmtDate(req.createdAt)}
                                    </td>
                                    <td>
                                        <span className={`badge ${statusCfg.badge} flex items-center gap-1 !w-fit`}>
                                            <StatusIcon className={`w-3 h-3 ${req.status === "PROCESSING" ? "animate-spin" : ""}`} />
                                            {statusCfg.label}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => setDetail(req)}
                                                className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]"
                                                title="Lihat Detail"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>

                                            {req.status === "PENDING" && (
                                                <>
                                                    <button
                                                        onClick={() => openAction(req, "PROCESSING")}
                                                        className="btn btn-sm bg-blue-500 text-white hover:bg-blue-600 !py-1 !px-2 text-[10px]"
                                                    >
                                                        Proses
                                                    </button>
                                                    <button
                                                        onClick={() => openAction(req, "REJECTED")}
                                                        className="btn btn-sm bg-red-500 text-white hover:bg-red-600 !py-1 !px-2 text-[10px]"
                                                    >
                                                        Tolak
                                                    </button>
                                                </>
                                            )}

                                            {req.status === "PROCESSING" && (
                                                <button
                                                    onClick={() => openAction(req, "READY")}
                                                    className="btn btn-sm bg-green-500 text-white hover:bg-green-600 !py-1 !px-2 text-[10px]"
                                                >
                                                    <Check className="w-3 h-3" /> Selesai
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {filteredLength > ITEMS_PER_PAGE && (
                <div className="px-6 py-3 border-t border-[var(--border)] bg-[#F9FAFB] flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-muted)]">
                        Hal {currentPage} dari {totalPages} ({filteredLength} data)
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            className="btn btn-ghost btn-sm !p-1.5"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            className="btn btn-ghost btn-sm !p-1.5"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
