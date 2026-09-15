import { Pencil, Trash2 } from "lucide-react";
import { Division } from "../types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Props {
    divisions: Division[];
    onEdit: (div: Division) => void;
    onDelete: (id: string) => void;
}

export function DivisionTab({ divisions, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nama Divisi</TableHead>
                        <TableHead>Departemen</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {divisions.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-12 text-[var(--text-muted)]">Belum ada data divisi</TableCell></TableRow>
                    ) : (
                        divisions.map((div) => (
                            <TableRow key={div.id}>
                                <TableCell>
                                    <div className="font-semibold text-[var(--text-primary)]">{div.name}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                        {div._count?.departments || 0} Departemen
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className={`badge ${div.isActive ? "badge-success" : "badge-error"}`}>
                                        {div.isActive ? "Aktif" : "Non-aktif"}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => onEdit(div)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => onDelete(div.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
