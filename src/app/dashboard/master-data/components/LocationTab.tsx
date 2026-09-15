import { Pencil, Trash2 } from "lucide-react";
import { Location } from "../types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Props {
    locations: Location[];
    onEdit: (loc: Location) => void;
    onDelete: (id: string) => void;
}

export function LocationTab({ locations, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nama Lokasi</TableHead>
                        <TableHead>Koordinat</TableHead>
                        <TableHead>Radius</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {locations.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data lokasi</TableCell></TableRow>
                    ) : (
                        locations.map((loc) => (
                            <TableRow key={loc.id}>
                                <TableCell>
                                    <div className="font-semibold text-[var(--text-primary)]">{loc.name}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-xs font-mono text-[var(--text-secondary)]">
                                        {loc.latitude}, {loc.longitude}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] rounded-full font-medium">
                                        {loc.radius}m
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className={`badge ${loc.isActive ? "badge-success" : "badge-error"}`}>
                                        {loc.isActive ? "Aktif" : "Non-aktif"}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => onEdit(loc)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => onDelete(loc.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
