import { Pencil, Trash2 } from "lucide-react";
import { Location } from "../types";

interface Props {
    locations: Location[];
    onEdit: (loc: Location) => void;
    onDelete: (id: string) => void;
}

export function LocationTab({ locations, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nama Lokasi</th>
                            <th>Koordinat</th>
                            <th>Radius</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {locations.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data lokasi</td></tr>
                        ) : (
                            locations.map((loc) => (
                                <tr key={loc.id}>
                                    <td>
                                        <div className="font-semibold text-[var(--text-primary)]">{loc.name}</div>
                                    </td>
                                    <td>
                                        <div className="text-xs font-mono text-[var(--text-secondary)]">
                                            {loc.latitude}, {loc.longitude}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] rounded-full font-medium">
                                            {loc.radius}m
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`badge ${loc.isActive ? "badge-success" : "badge-error"}`}>
                                            {loc.isActive ? "Aktif" : "Non-aktif"}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onEdit(loc)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button onClick={() => onDelete(loc.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
