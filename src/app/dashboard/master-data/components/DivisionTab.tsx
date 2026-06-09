import { Pencil, Trash2 } from "lucide-react";
import { Division } from "../types";

interface Props {
    divisions: Division[];
    onEdit: (div: Division) => void;
    onDelete: (id: string) => void;
}

export function DivisionTab({ divisions, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nama Divisi</th>
                            <th>Departemen</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {divisions.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-12 text-[var(--text-muted)]">Belum ada data divisi</td></tr>
                        ) : (
                            divisions.map((div) => (
                                <tr key={div.id}>
                                    <td>
                                        <div className="font-semibold text-[var(--text-primary)]">{div.name}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                            {div._count?.departments || 0} Departemen
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${div.isActive ? "badge-success" : "badge-error"}`}>
                                            {div.isActive ? "Aktif" : "Non-aktif"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onEdit(div)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => onDelete(div.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
