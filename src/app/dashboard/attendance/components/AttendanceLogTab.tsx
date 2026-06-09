import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { AttendanceRecord, Employee } from "../types";

interface Props {
    paginatedRecords: AttendanceRecord[];
    filteredLength: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    getEmpInfo: (id: string) => { name: string; department: string; division: string };
    formatTime: (time?: string) => string;
    statusLabel: (status: string) => string;
    setPhotoPreview: (val: { url: string; label: string } | null) => void;
}

export function AttendanceLogTab({
    paginatedRecords, filteredLength, currentPage, itemsPerPage, totalPages,
    setCurrentPage, getEmpInfo, formatTime, statusLabel, setPhotoPreview
}: Props) {
    return (
        <div className="card overflow-hidden border border-[var(--border)] shadow-sm">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead className="bg-[#F9FAFB]">
                        <tr>
                            <th className="w-32">ID Karyawan</th>
                            <th>Nama</th>
                            <th className="hidden lg:table-cell">Departemen</th>
                            <th className="w-32">Tanggal</th>
                            <th className="w-24">Clock In</th>
                            <th className="w-24">Clock Out</th>
                            <th className="w-20 text-center hidden md:table-cell">Foto</th>
                            <th className="w-32 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {paginatedRecords.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center py-12 text-[var(--text-muted)] italic">
                                    Tidak ada data absensi ditemukan untuk kriteria ini.
                                </td>
                            </tr>
                        ) : (
                            paginatedRecords.map((r) => {
                                const info = getEmpInfo(r.employeeId);
                                return (
                                    <tr key={r.id} className="hover:bg-[var(--secondary)]/50 transition-colors">
                                        <td className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                                            {r.employeeId}
                                        </td>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            {info.name}
                                        </td>
                                        <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)]">
                                            {info.department}
                                        </td>
                                        <td className="text-sm text-[var(--text-secondary)]">
                                            {r.date}
                                        </td>
                                        <td className="text-sm font-medium text-blue-600">
                                            {formatTime(r.clockIn)}
                                        </td>
                                        <td className="text-sm font-medium text-orange-600">
                                            {formatTime(r.clockOut)}
                                        </td>
                                        <td className="hidden md:table-cell">
                                            <div className="flex items-center justify-center gap-1">
                                                {r.clockInPhoto ? (
                                                    <button
                                                        onClick={() => setPhotoPreview({ url: r.clockInPhoto!, label: `Clock In — ${info.name} (${r.date})` })}
                                                        className="w-8 h-8 rounded-md overflow-hidden border border-blue-200 hover:border-blue-400 transition-colors cursor-pointer"
                                                        title="Lihat foto masuk"
                                                    >
                                                        <img src={r.clockInPhoto} alt="In" className="w-full h-full object-cover" />
                                                    </button>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-md bg-[var(--secondary)] flex items-center justify-center">
                                                        <Camera className="w-3 h-3 text-gray-300" />
                                                    </div>
                                                )}
                                                {r.clockOutPhoto ? (
                                                    <button
                                                        onClick={() => setPhotoPreview({ url: r.clockOutPhoto!, label: `Clock Out — ${info.name} (${r.date})` })}
                                                        className="w-8 h-8 rounded-md overflow-hidden border border-orange-200 hover:border-orange-400 transition-colors cursor-pointer"
                                                        title="Lihat foto pulang"
                                                    >
                                                        <img src={r.clockOutPhoto} alt="Out" className="w-full h-full object-cover" />
                                                    </button>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-md bg-[var(--secondary)] flex items-center justify-center">
                                                        <Camera className="w-3 h-3 text-gray-300" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${r.status === "present" ? "bg-green-100 text-green-700" :
                                                r.status === "late" ? "bg-orange-100 text-orange-700" :
                                                    r.status === "absent" ? "bg-red-100 text-red-700" :
                                                        "bg-blue-100 text-blue-700"
                                                }`}>
                                                {statusLabel(r.status)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-6 py-4 bg-[#F9FAFB] border-t border-[var(--border)] flex items-center justify-between">
                <div className="text-xs font-medium text-[var(--text-muted)]">
                    Menampilkan <span className="text-[var(--text-primary)]">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-[var(--text-primary)]">{Math.min(currentPage * itemsPerPage, filteredLength)}</span> dari <span className="text-[var(--text-primary)] font-bold">{filteredLength}</span> data
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-md hover:bg-[var(--card)] hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent transition-all border border-transparent hover:border-[var(--border)]"
                            title="Halaman Sebelumnya"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center">
                            {[...Array(totalPages)].map((_, i) => {
                                const page = i + 1;
                                // Only show current, first, last, and neighbors
                                if (
                                    page === 1 ||
                                    page === totalPages ||
                                    (page >= currentPage - 1 && page <= currentPage + 1)
                                ) {
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-sm font-bold transition-all ${currentPage === page
                                                ? "bg-[var(--primary)] text-white shadow-md"
                                                : "text-[var(--text-muted)] hover:bg-[var(--card)] hover:text-[var(--primary)] border border-transparent hover:border-[var(--border)]"
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    );
                                } else if (
                                    page === currentPage - 2 ||
                                    page === currentPage + 2
                                ) {
                                    return <span key={page} className="px-1 text-[var(--text-muted)]">...</span>;
                                }
                                return null;
                            })}
                        </div>

                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-md hover:bg-[var(--card)] hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent transition-all border border-transparent hover:border-[var(--border)]"
                            title="Halaman Selanjutnya"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
