import { Layers, Pencil, Trash2 } from "lucide-react";
import { Department } from "../types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

interface Props {
    departments: Department[];
    onEdit: (dept: Department) => void;
    onDelete: (id: string) => void;
}

export function DepartmentTab({ departments, onEdit, onDelete }: Props) {
    return (
        <div className="card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Nama Departemen</TableHead>
                        <TableHead>Divisi</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {departments.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data departemen</TableCell></TableRow>
                    ) : (
                        departments.map((dept) => (
                            <TableRow key={dept.id}>
                                <TableCell className="font-mono text-xs font-bold text-[var(--primary)]">{dept.code || "-"}</TableCell>
                                <TableCell>
                                    <div className="font-semibold text-[var(--text-primary)]">{dept.name}</div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                        <Layers className="w-3.5 h-3.5 opacity-50" />
                                        {dept.division?.name || "-"}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className={`badge ${dept.isActive ? "badge-success" : "badge-error"}`}>
                                        {dept.isActive ? "Aktif" : "Non-aktif"}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => onEdit(dept)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => onDelete(dept.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
