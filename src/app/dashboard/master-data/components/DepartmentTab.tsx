import { Layers, Pencil, Trash2 } from "lucide-react";
import { Department } from "../types";

interface Props {
    departments: Department[];
    onEdit: (dept: Department) => void;
    onDelete: (id: string) => void;
}

export function DepartmentTab({ departments, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Kode</th>
                            <th>Nama Departemen</th>
                            <th>Divisi</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {departments.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data departemen</td></tr>
                        ) : (
                            departments.map((dept) => (
                                <tr key={dept.id}>
                                    <td className="font-mono text-xs font-bold text-[var(--primary)]">{dept.code || "-"}</td>
                                    <td>
                                        <div className="font-semibold text-[var(--text-primary)]">{dept.name}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                            <Layers className="w-3.5 h-3.5 opacity-50" />
                                            {dept.division?.name || "-"}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`badge ${dept.isActive ? "badge-success" : "badge-error"}`}>
                                            {dept.isActive ? "Aktif" : "Non-aktif"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onEdit(dept)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => onDelete(dept.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
