import { Pencil, Trash2 } from "lucide-react";
import { Position } from "../types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Props {
    positions: Position[];
    onEdit: (pos: Position) => void;
    onDelete: (id: string) => void;
}

export function PositionTab({ positions, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nama Jabatan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {positions.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-12 text-[var(--text-muted)]">Belum ada data jabatan</TableCell></TableRow>
                    ) : (
                        positions.map((pos) => (
                            <TableRow key={pos.id}>
                                <TableCell>
                                    <div className="font-semibold text-[var(--text-primary)]">{pos.name}</div>
                                </TableCell>
                                <TableCell>
                                    <span className={`badge ${pos.isActive ? "badge-success" : "badge-error"}`}>
                                        {pos.isActive ? "Aktif" : "Non-aktif"}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => onEdit(pos)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => onDelete(pos.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
