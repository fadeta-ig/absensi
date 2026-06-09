import { Pencil, Trash2 } from "lucide-react";
import { Position } from "../types";

interface Props {
    positions: Position[];
    onEdit: (pos: Position) => void;
    onDelete: (id: string) => void;
}

export function PositionTab({ positions, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nama Jabatan</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {positions.length === 0 ? (
                            <tr><td colSpan={4} className="text-center py-12 text-[var(--text-muted)]">Belum ada data jabatan</td></tr>
                        ) : (
                            positions.map((pos) => (
                                <tr key={pos.id}>
                                    <td>
                                        <div className="font-semibold text-[var(--text-primary)]">{pos.name}</div>
                                    </td>
                                    <td>
                                        <span className={`badge ${pos.isActive ? "badge-success" : "badge-error"}`}>
                                            {pos.isActive ? "Aktif" : "Non-aktif"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onEdit(pos)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => onDelete(pos.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
