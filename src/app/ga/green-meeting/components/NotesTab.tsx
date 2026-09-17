"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    PlusCircle,
    Info,
    ListTodo,
    ArrowRight,
    Calendar,
    CheckCircle2,
    Building2,
    Briefcase,
    Users,
    Search,
    X,
    Sparkles,
    UserCheck,
    Loader2,
    Pencil,
    History,
} from "lucide-react";
import type {
    GreenMeetingNote,
    GreenMeetingNoteType,
    GreenMeetingOriginType,
    GreenMeetingTaskStatus,
    DepartmentInfo,
    DivisionInfo,
    EmployeeSearchResult,
} from "../types";
import type { NoteTargetItem } from "@/lib/services/greenMeetingService";
import AccessibleModal from "@/components/ui/AccessibleModal";

type OriginScope = "DIREKSI" | "DEPARTMENT" | "DIVISION" | "EMPLOYEE" | "LAINNYA";
type TargetScope = "ALL" | "DEPARTMENT" | "DIVISION" | "EMPLOYEE";

interface NotesTabProps {
    notes: GreenMeetingNote[];
    departments: DepartmentInfo[];
    divisions: DivisionInfo[];
    onCreateNote: (data: {
        type: GreenMeetingNoteType;
        content: string;
        originType: GreenMeetingOriginType;
        originName: string;
        isAllTarget: boolean;
        targets?: NoteTargetItem[];
        initialDeadlineDate?: string;
    }) => Promise<void>;
    onUpdateNote: (noteId: string, data: {
        type: GreenMeetingNoteType;
        content: string;
        originType: GreenMeetingOriginType;
        originName: string;
        isAllTarget: boolean;
        targets?: NoteTargetItem[];
        initialDeadlineDate?: string;
        changeReason: string;
    }) => Promise<void>;
    onUpdateTaskStatus: (noteId: string, status: GreenMeetingTaskStatus) => Promise<void>;
}

export default function NotesTab({
    notes,
    departments,
    divisions,
    onCreateNote,
    onUpdateNote,
    onUpdateTaskStatus,
}: NotesTabProps) {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<GreenMeetingNote | null>(null);
    const [changeReason, setChangeReason] = useState("");
    const [historyNote, setHistoryNote] = useState<GreenMeetingNote | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [revisions, setRevisions] = useState<Array<{
        id: string;
        revisionNumber: number;
        changeReason: string;
        changedBy: string;
        previousData: unknown;
        createdAt: string;
    }>>([]);

    // Form Basic States
    const [noteType, setNoteType] = useState<GreenMeetingNoteType>("INFORMASI");
    
    // DARI (Origin) States
    const [originScope, setOriginScope] = useState<OriginScope>("DIREKSI");
    const [originDireksiRole, setOriginDireksiRole] = useState<string>("Direksi");
    const [selectedOriginDeptId, setSelectedOriginDeptId] = useState<string>("");
    const [selectedOriginDivId, setSelectedOriginDivId] = useState<string>("");
    const [selectedOriginEmployee, setSelectedOriginEmployee] = useState<EmployeeSearchResult | null>(null);
    const [customOriginText, setCustomOriginText] = useState<string>("");

    // DARI Employee Search States
    const [originEmpSearchQuery, setOriginEmpSearchQuery] = useState("");
    const [originEmpSearchResults, setOriginEmpSearchResults] = useState<EmployeeSearchResult[]>([]);
    const [searchingOriginEmp, setSearchingOriginEmp] = useState(false);
    const originSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // KEPADA (Target) States
    const [targetScope, setTargetScope] = useState<TargetScope>("ALL");
    const [content, setContent] = useState<string>("");
    const [initialDeadlineDate, setInitialDeadlineDate] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string>("");

    // Target Selection States
    const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
    const [selectedDivIds, setSelectedDivIds] = useState<string[]>([]);
    const [selectedEmployees, setSelectedEmployees] = useState<EmployeeSearchResult[]>([]);

    // Employee Search States
    const [empSearchQuery, setEmpSearchQuery] = useState("");
    const [empSearchResults, setEmpSearchResults] = useState<EmployeeSearchResult[]>([]);
    const [searchingEmp, setSearchingEmp] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Search Employees for DARI
    const searchOriginEmployees = useCallback(async (query: string) => {
        if (!query.trim()) {
            setOriginEmpSearchResults([]);
            return;
        }
        setSearchingOriginEmp(true);
        try {
            const res = await fetch(`/api/green-meeting/employees?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data: EmployeeSearchResult[] = await res.json();
                setOriginEmpSearchResults(data);
            }
        } finally {
            setSearchingOriginEmp(false);
        }
    }, []);

    useEffect(() => {
        if (originScope !== "EMPLOYEE") return;

        if (originSearchTimeoutRef.current) clearTimeout(originSearchTimeoutRef.current);
        originSearchTimeoutRef.current = setTimeout(() => {
            void searchOriginEmployees(originEmpSearchQuery);
        }, 200);

        return () => {
            if (originSearchTimeoutRef.current) clearTimeout(originSearchTimeoutRef.current);
        };
    }, [originEmpSearchQuery, originScope, searchOriginEmployees]);

    // Search Employees for KEPADA
    const searchEmployees = useCallback(async (query: string) => {
        if (!query.trim()) {
            setEmpSearchResults([]);
            return;
        }
        setSearchingEmp(true);
        try {
            const res = await fetch(`/api/green-meeting/employees?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data: EmployeeSearchResult[] = await res.json();
                setEmpSearchResults(data);
            }
        } finally {
            setSearchingEmp(false);
        }
    }, []);

    useEffect(() => {
        if (targetScope !== "EMPLOYEE") return;

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            void searchEmployees(empSearchQuery);
        }, 200);

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [empSearchQuery, targetScope, searchEmployees]);

    // Helpers
    const resetForm = () => {
        setContent("");
        setInitialDeadlineDate("");
        setOriginScope("DIREKSI");
        setOriginDireksiRole("Direksi");
        setSelectedOriginDeptId("");
        setSelectedOriginDivId("");
        setSelectedOriginEmployee(null);
        setOriginEmpSearchQuery("");
        setCustomOriginText("");
        setTargetScope("ALL");
        setSelectedDeptIds([]);
        setSelectedDivIds([]);
        setSelectedEmployees([]);
        setEmpSearchQuery("");
        setChangeReason("");
        setEditingNote(null);
    };

    const startEditing = (note: GreenMeetingNote) => {
        resetForm();
        setEditingNote(note);
        setNoteType(note.type);
        setContent(note.content);
        setOriginScope(note.originType === "EMPLOYEE" ? "LAINNYA" : note.originType);
        setInitialDeadlineDate(
            note.type === "TUGAS" && note.deadlines[0]
                ? note.deadlines[0].deadlineDate.slice(0, 10)
                : ""
        );

        if (note.originType === "DIREKSI") setOriginDireksiRole(note.originName);
        if (note.originType === "DEPARTMENT") {
            const match = departments.find((department) => note.originName.includes(department.name));
            setSelectedOriginDeptId(match?.id ?? "");
        }
        if (note.originType === "DIVISION") {
            const match = divisions.find((division) => note.originName.includes(division.name));
            setSelectedOriginDivId(match?.id ?? "");
        }
        if (note.originType === "LAINNYA") setCustomOriginText(note.originName);
        if (note.originType === "EMPLOYEE") setCustomOriginText(note.originName);

        if (note.isAllTarget) {
            setTargetScope("ALL");
        } else if (note.targets.every((target) => target.targetType === "DEPARTMENT")) {
            setTargetScope("DEPARTMENT");
            setSelectedDeptIds(note.targets.flatMap((target) => target.departmentId ? [target.departmentId] : []));
        } else if (note.targets.every((target) => target.targetType === "DIVISION")) {
            setTargetScope("DIVISION");
            setSelectedDivIds(note.targets.flatMap((target) => target.divisionId ? [target.divisionId] : []));
        } else {
            setTargetScope("EMPLOYEE");
            setSelectedEmployees(note.targets.flatMap((target) => target.employee ? [{
                id: target.employee.id,
                employeeId: target.employee.employeeId,
                name: target.employee.name,
                department: target.department?.name ?? target.label ?? "Karyawan",
                departmentId: target.departmentId ?? null,
                division: target.division?.name ?? "",
                divisionId: target.divisionId ?? null,
                position: "Karyawan",
            }] : []));
        }

        setIsFormOpen(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const loadHistory = async (note: GreenMeetingNote) => {
        setHistoryNote(note);
        setHistoryLoading(true);
        try {
            const response = await fetch(`/api/green-meeting/notes/${note.id}/revisions`);
            if (!response.ok) throw new Error("Gagal memuat riwayat revisi.");
            setRevisions(await response.json());
        } catch {
            setRevisions([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleToggleDept = (deptId: string) => {
        setSelectedDeptIds((prev) =>
            prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId]
        );
    };

    const handleToggleDiv = (divId: string) => {
        setSelectedDivIds((prev) =>
            prev.includes(divId) ? prev.filter((id) => id !== divId) : [...prev, divId]
        );
    };

    const handleSelectEmployee = (emp: EmployeeSearchResult) => {
        if (!selectedEmployees.some((e) => e.employeeId === emp.employeeId)) {
            setSelectedEmployees((prev) => [...prev, emp]);
        }
    };

    const handleRemoveEmployee = (empId: string) => {
        setSelectedEmployees((prev) => prev.filter((e) => e.employeeId !== empId));
    };

    const handleSubmitNote = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg("");

        if (!content.trim()) {
            setErrorMsg("Uraian catatan/pembahasan tidak boleh kosong.");
            return;
        }

        if (noteType === "TUGAS" && !initialDeadlineDate) {
            setErrorMsg("Tenggat waktu awal (Deadline 1) wajib diisi untuk catatan bertipe Tugas.");
            return;
        }

        if (targetScope === "DEPARTMENT" && selectedDeptIds.length === 0) {
            setErrorMsg("Pilih minimal satu departemen sasaran.");
            return;
        }

        if (targetScope === "DIVISION" && selectedDivIds.length === 0) {
            setErrorMsg("Pilih minimal satu divisi sasaran.");
            return;
        }

        if (targetScope === "EMPLOYEE" && selectedEmployees.length === 0) {
            setErrorMsg("Pilih minimal satu karyawan sasaran.");
            return;
        }

        // Resolusi DARI
        let resolvedOriginType: GreenMeetingOriginType = "DIREKSI";
        let resolvedOriginName = "Direksi";

        if (originScope === "DIREKSI") {
            resolvedOriginType = "DIREKSI";
            resolvedOriginName = originDireksiRole || "Direksi";
        } else if (originScope === "DEPARTMENT") {
            const dept = departments.find((d) => d.id === selectedOriginDeptId) || departments[0];
            if (!dept) {
                setErrorMsg("Pilih departemen pengarah / pemberi bahasan.");
                return;
            }
            resolvedOriginType = "DEPARTMENT";
            resolvedOriginName = `Departemen ${dept.name}`;
        } else if (originScope === "DIVISION") {
            const div = divisions.find((d) => d.id === selectedOriginDivId) || divisions[0];
            if (!div) {
                setErrorMsg("Pilih divisi pengarah / pemberi bahasan.");
                return;
            }
            resolvedOriginType = "DIVISION";
            resolvedOriginName = `Divisi ${div.name}`;
        } else if (originScope === "EMPLOYEE") {
            if (!selectedOriginEmployee) {
                setErrorMsg("Cari dan pilih satu karyawan pengarah / pemapar.");
                return;
            }
            resolvedOriginType = "EMPLOYEE";
            resolvedOriginName = `${selectedOriginEmployee.name} (${selectedOriginEmployee.position || selectedOriginEmployee.department})`;
        } else if (originScope === "LAINNYA") {
            if (!customOriginText.trim()) {
                setErrorMsg("Tuliskan nama pengarah / pembahas kustom.");
                return;
            }
            resolvedOriginType = editingNote?.originType === "EMPLOYEE" ? "EMPLOYEE" : "LAINNYA";
            resolvedOriginName = customOriginText.trim();
        }

        // Resolusi KEPADA
        if (targetScope === "DEPARTMENT" && selectedDeptIds.length === 0) {
            setErrorMsg("Pilih minimal satu departemen sasaran.");
            return;
        }

        if (targetScope === "DIVISION" && selectedDivIds.length === 0) {
            setErrorMsg("Pilih minimal satu divisi sasaran.");
            return;
        }

        if (targetScope === "EMPLOYEE" && selectedEmployees.length === 0) {
            setErrorMsg("Pilih minimal satu karyawan sasaran.");
            return;
        }

        if (editingNote && changeReason.trim().length < 5) {
            setErrorMsg("Alasan perubahan wajib diisi minimal 5 karakter.");
            return;
        }

        setSubmitting(true);
        try {
            const isAll = targetScope === "ALL";

            const rawTargets: NoteTargetItem[] = [];

            if (targetScope === "DEPARTMENT") {
                selectedDeptIds.forEach((id) => {
                    const dept = departments.find((d) => d.id === id);
                    rawTargets.push({
                        targetType: "DEPARTMENT",
                        departmentId: id,
                        label: dept?.name || "Departemen",
                    });
                });
            } else if (targetScope === "DIVISION") {
                selectedDivIds.forEach((id) => {
                    const div = divisions.find((d) => d.id === id);
                    rawTargets.push({
                        targetType: "DIVISION",
                        divisionId: id,
                        label: div?.name ? `Divisi ${div.name}` : "Divisi",
                    });
                });
            } else if (targetScope === "EMPLOYEE") {
                selectedEmployees.forEach((emp) => {
                    rawTargets.push({
                        targetType: "EMPLOYEE",
                        employeeId: emp.employeeId,
                        departmentId: emp.departmentId,
                        divisionId: emp.divisionId,
                        label: `${emp.name} (${emp.department})`,
                    });
                });
            }

            const noteData = {
                type: noteType,
                content: content.trim(),
                originType: resolvedOriginType,
                originName: resolvedOriginName.trim(),
                isAllTarget: isAll,
                targets: isAll ? [] : rawTargets,
                initialDeadlineDate: noteType === "TUGAS" ? initialDeadlineDate : undefined,
            };

            if (editingNote) {
                await onUpdateNote(editingNote.id, {
                    ...noteData,
                    changeReason: changeReason.trim(),
                });
            } else {
                await onCreateNote(noteData);
            }

            resetForm();
            setIsFormOpen(false);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Gagal menambahkan butir notulen.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Tombol Tambah Notulen */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-4 rounded-xl border border-border">
                <div>
                    <h3 className="text-base font-bold text-foreground">Agenda & Notulensi Rapat</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Catat arahan manajemen (Informasi) dan instruksi tindak lanjut dengan rute tujuan fleksibel.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors"
                >
                    <PlusCircle size={16} />
                    <span>{isFormOpen ? "Tutup Form" : "Tambah Catatan Notulen"}</span>
                </button>
            </div>

            {/* Form Input Notulen Cepat */}
            {isFormOpen && (
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-primary" />
                            <h4 className="text-sm font-bold text-foreground">Pencatatan Butir Notulen Baru</h4>
                        </div>
                        <span className="text-xs text-muted-foreground">Saling Tuju-Menuju Lintas Hierarki</span>
                    </div>

                    {errorMsg && (
                        <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium">
                            {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmitNote} className="space-y-4">
                        {/* 1. Tipe Catatan */}
                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Jenis Catatan Notulen
                            </label>
                            <div className="grid grid-cols-2 gap-3 max-w-md">
                                <button
                                    type="button"
                                    onClick={() => setNoteType("INFORMASI")}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${noteType === "INFORMASI"
                                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    <Info size={14} />
                                    <span>Informasi / Pengumuman</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNoteType("TUGAS")}
                                    className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${noteType === "TUGAS"
                                        ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    <ListTodo size={14} />
                                    <span>Tugas / Tindak Lanjut</span>
                                </button>
                            </div>
                        </div>

                        {/* 2. DARI (Asal Pengarah / Pemberi Bahasan) */}
                        <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-foreground">
                                    DARI (Asal Pengarah / Pemberi Bahasan)
                                </label>
                                <span className="text-[11px] text-muted-foreground">
                                    Pemberi materi atau arahan rapat
                                </span>
                            </div>

                            {/* Scope Selector Pills untuk DARI */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOriginScope("DIREKSI")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                                        originScope === "DIREKSI"
                                            ? "bg-primary text-white border-primary shadow-sm"
                                            : "border-border hover:bg-muted text-foreground"
                                    }`}
                                >
                                    Pimpinan / Direksi
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOriginScope("DEPARTMENT");
                                        if (!selectedOriginDeptId && departments.length > 0) {
                                            setSelectedOriginDeptId(departments[0].id);
                                        }
                                    }}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                                        originScope === "DEPARTMENT"
                                            ? "bg-primary text-white border-primary shadow-sm"
                                            : "border-border hover:bg-muted text-foreground"
                                    }`}
                                >
                                    Departemen
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOriginScope("DIVISION");
                                        if (!selectedOriginDivId && divisions.length > 0) {
                                            setSelectedOriginDivId(divisions[0].id);
                                        }
                                    }}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                                        originScope === "DIVISION"
                                            ? "bg-primary text-white border-primary shadow-sm"
                                            : "border-border hover:bg-muted text-foreground"
                                    }`}
                                >
                                    Divisi
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOriginScope("EMPLOYEE")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                                        originScope === "EMPLOYEE"
                                            ? "bg-primary text-white border-primary shadow-sm"
                                            : "border-border hover:bg-muted text-foreground"
                                    }`}
                                >
                                    Perorangan / Karyawan
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOriginScope("LAINNYA")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                                        originScope === "LAINNYA"
                                            ? "bg-primary text-white border-primary shadow-sm"
                                            : "border-border hover:bg-muted text-foreground"
                                    }`}
                                >
                                    Lainnya / Kustom
                                </button>
                            </div>

                            {/* Opsi 1: Pimpinan / Direksi */}
                            {originScope === "DIREKSI" && (
                                <div className="bg-muted/40 p-3.5 rounded-lg border border-border">
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Pilih Jabatan / Entitas Pimpinan:
                                    </label>
                                    <select
                                        value={originDireksiRole}
                                        onChange={(e) => setOriginDireksiRole(e.target.value)}
                                        className="w-full sm:max-w-md px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="Direksi">Direksi / Board of Directors</option>
                                        <option value="Chief Executive Officer (CEO)">Chief Executive Officer (CEO)</option>
                                        <option value="General Manager">General Manager</option>
                                        <option value="Deputy General Manager">Deputy General Manager</option>
                                    </select>
                                </div>
                            )}

                            {/* Opsi 2: Departemen */}
                            {originScope === "DEPARTMENT" && (
                                <div className="bg-muted/40 p-3.5 rounded-lg border border-border">
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Pilih Departemen Pengarah:
                                    </label>
                                    <select
                                        value={selectedOriginDeptId || (departments[0]?.id ?? "")}
                                        onChange={(e) => setSelectedOriginDeptId(e.target.value)}
                                        className="w-full sm:max-w-md px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        {departments.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                Departemen {d.name} {d.division?.name ? `(${d.division.name})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Opsi 3: Divisi */}
                            {originScope === "DIVISION" && (
                                <div className="bg-muted/40 p-3.5 rounded-lg border border-border">
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Pilih Divisi Pengarah:
                                    </label>
                                    <select
                                        value={selectedOriginDivId || (divisions[0]?.id ?? "")}
                                        onChange={(e) => setSelectedOriginDivId(e.target.value)}
                                        className="w-full sm:max-w-md px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        {divisions.map((div) => (
                                            <option key={div.id} value={div.id}>
                                                Divisi {div.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Opsi 4: Perorangan / Karyawan (Live Search & Pick) */}
                            {originScope === "EMPLOYEE" && (
                                <div className="bg-muted/40 p-4 rounded-lg border border-border space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                            <UserCheck size={14} className="text-primary" />
                                            Cari & Pilih Karyawan Pemapar:
                                        </span>
                                        {selectedOriginEmployee && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedOriginEmployee(null)}
                                                className="text-[11px] font-semibold text-rose-600 hover:underline"
                                            >
                                                Ganti Karyawan
                                            </button>
                                        )}
                                    </div>

                                    {/* Selected Employee Card */}
                                    {selectedOriginEmployee ? (
                                        <div className="flex items-center justify-between p-3 bg-card rounded-lg border border-primary/30 shadow-2xs">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                                    {selectedOriginEmployee.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-foreground truncate">
                                                        {selectedOriginEmployee.name}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground truncate">
                                                        {selectedOriginEmployee.position} • {selectedOriginEmployee.department}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedOriginEmployee(null)}
                                                className="p-1 hover:bg-muted text-muted-foreground hover:text-rose-600 rounded-md transition-colors"
                                                title="Hapus / Pilih Ulang"
                                            >
                                                <X size={15} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                                                <input
                                                    type="text"
                                                    value={originEmpSearchQuery}
                                                    onChange={(e) => setOriginEmpSearchQuery(e.target.value)}
                                                    placeholder="Ketik nama karyawan pengarah (misal: 'Daf', 'Bambang') atau ID..."
                                                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                                />
                                                {searchingOriginEmp && (
                                                    <Loader2 size={14} className="animate-spin absolute right-3 top-2.5 text-muted-foreground" />
                                                )}
                                            </div>

                                            {/* Results dropdown list */}
                                            {originEmpSearchResults.length > 0 && (
                                                <div className="max-h-48 overflow-y-auto divide-y divide-border bg-background rounded-lg border border-border shadow-xs">
                                                    {originEmpSearchResults.map((emp) => (
                                                        <button
                                                            key={emp.employeeId}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedOriginEmployee(emp);
                                                                setOriginEmpSearchQuery("");
                                                                setOriginEmpSearchResults([]);
                                                            }}
                                                            className="w-full text-left p-2.5 hover:bg-muted transition-colors flex items-center justify-between gap-2"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-bold text-foreground truncate">{emp.name}</span>
                                                                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-muted text-muted-foreground rounded">
                                                                        {emp.employeeId}
                                                                    </span>
                                                                </div>
                                                                <p className="text-[11px] text-muted-foreground truncate">
                                                                    {emp.position} • {emp.department}
                                                                </p>
                                                            </div>
                                                            <span className="text-[11px] font-semibold text-primary shrink-0">Pilih</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Opsi 5: Lainnya / Kustom */}
                            {originScope === "LAINNYA" && (
                                <div className="bg-muted/40 p-3.5 rounded-lg border border-border">
                                    <label className="block text-xs font-medium text-foreground mb-1">
                                        Tuliskan Nama / Instansi Pengarah:
                                    </label>
                                    <input
                                        type="text"
                                        value={customOriginText}
                                        onChange={(e) => setCustomOriginText(e.target.value)}
                                        placeholder="Contoh: Auditor Eksternal, Konsultan ISO, Tamu Direksi..."
                                        className="w-full sm:max-w-md px-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                            )}
                        </div>

                        {/* 3. KEPADA (Sasaran Audiens / Pelaksana) */}
                        <div className="space-y-3 pt-1">
                            <label className="block text-xs font-semibold text-foreground">
                                KEPADA (Sasaran Sasaran Audiens / Pelaksana)
                            </label>

                            {/* Scope Selector Pills */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTargetScope("ALL")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${targetScope === "ALL"
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Semua Karyawan (ALL)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetScope("DEPARTMENT")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${targetScope === "DEPARTMENT"
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Departemen
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetScope("DIVISION")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${targetScope === "DIVISION"
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Divisi
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTargetScope("EMPLOYEE")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${targetScope === "EMPLOYEE"
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Perorangan / Karyawan
                                </button>
                            </div>

                            {/* Pilihan 1: Departemen Multi-Select */}
                            {targetScope === "DEPARTMENT" && (
                                <div className="bg-muted/40 p-3.5 rounded-lg border border-border space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                            <Building2 size={13} className="text-primary" />
                                            Centang Departemen Sasaran:
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedDeptIds.length === departments.length) {
                                                    setSelectedDeptIds([]);
                                                } else {
                                                    setSelectedDeptIds(departments.map((d) => d.id));
                                                }
                                            }}
                                            className="text-[11px] font-semibold text-primary hover:underline"
                                        >
                                            {selectedDeptIds.length === departments.length ? "Hapus Semua" : "Pilih Semua"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                                        {departments.map((dept) => {
                                            const isChecked = selectedDeptIds.includes(dept.id);
                                            return (
                                                <label
                                                    key={dept.id}
                                                    className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition-colors ${isChecked
                                                        ? "bg-primary/10 border-primary text-primary font-bold"
                                                        : "bg-background border-border text-foreground hover:bg-muted"
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleDept(dept.id)}
                                                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                                                    />
                                                    <span className="truncate">{dept.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Pilihan 2: Divisi Multi-Select */}
                            {targetScope === "DIVISION" && (
                                <div className="bg-muted/40 p-3.5 rounded-lg border border-border space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                            <Briefcase size={13} className="text-primary" />
                                            Centang Divisi Sasaran:
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedDivIds.length === divisions.length) {
                                                    setSelectedDivIds([]);
                                                } else {
                                                    setSelectedDivIds(divisions.map((d) => d.id));
                                                }
                                            }}
                                            className="text-[11px] font-semibold text-primary hover:underline"
                                        >
                                            {selectedDivIds.length === divisions.length ? "Hapus Semua" : "Pilih Semua"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                                        {divisions.map((div) => {
                                            const isChecked = selectedDivIds.includes(div.id);
                                            return (
                                                <label
                                                    key={div.id}
                                                    className={`flex items-center gap-2 p-2.5 rounded-lg text-xs cursor-pointer border transition-colors ${isChecked
                                                        ? "bg-primary/10 border-primary text-primary font-bold"
                                                        : "bg-background border-border text-foreground hover:bg-muted"
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleDiv(div.id)}
                                                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                                                    />
                                                    <span className="truncate">{div.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Pilihan 3: Perorangan / Karyawan (Live Search & Multi-Add) */}
                            {targetScope === "EMPLOYEE" && (
                                <div className="bg-muted/40 p-4 rounded-lg border border-border space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                            <Users size={14} className="text-primary" />
                                            Cari & Pilih Karyawan Spesifik:
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {selectedEmployees.length} Karyawan Dipilih
                                        </span>
                                    </div>

                                    {/* Selected Employees Chips */}
                                    {selectedEmployees.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 p-2 bg-background rounded-lg border border-border">
                                            {selectedEmployees.map((emp) => (
                                                <span
                                                    key={emp.employeeId}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
                                                >
                                                    <UserCheck size={12} />
                                                    <span>{emp.name} ({emp.department})</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveEmployee(emp.employeeId)}
                                                        className="hover:text-rose-600 rounded-full p-0.5"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Live Search Input */}
                                    <div className="relative">
                                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <input
                                            type="text"
                                            value={empSearchQuery}
                                            onChange={(e) => setEmpSearchQuery(e.target.value)}
                                            placeholder="Ketik nama atau ID karyawan (misal: Bambang, Hendra, Maya, Aditya, Daf)..."
                                            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>

                                    {/* Search Results Dropdown List */}
                                    <div className="max-h-48 overflow-y-auto space-y-1 bg-background rounded-lg border border-border p-1">
                                        {searchingEmp ? (
                                            <div className="p-3 text-xs text-center text-muted-foreground">
                                                Mencari karyawan...
                                            </div>
                                        ) : empSearchResults.length === 0 ? (
                                            <div className="p-3 text-xs text-center text-muted-foreground">
                                                Tidak ditemukan karyawan dengan kata kunci tersebut.
                                            </div>
                                        ) : (
                                            empSearchResults.map((emp) => {
                                                const isSelected = selectedEmployees.some((e) => e.employeeId === emp.employeeId);
                                                return (
                                                    <button
                                                        key={emp.employeeId}
                                                        type="button"
                                                        onClick={() => handleSelectEmployee(emp)}
                                                        disabled={isSelected}
                                                        className={`w-full text-left p-2 rounded-md text-xs flex items-center justify-between transition-colors ${isSelected
                                                            ? "opacity-40 bg-muted cursor-not-allowed"
                                                            : "hover:bg-muted text-foreground"
                                                            }`}
                                                    >
                                                        <div>
                                                            <div className="font-bold text-foreground">
                                                                {emp.name}{" "}
                                                                <span className="font-mono text-[10px] text-muted-foreground">({emp.employeeId})</span>
                                                            </div>
                                                            <div className="text-[11px] text-muted-foreground">
                                                                {emp.position} • {emp.department} • <span className="text-primary font-medium">{emp.division}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-[11px] font-semibold text-primary">
                                                            {isSelected ? "Sudah Dipilih" : "+ Tambah"}
                                                        </span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 4. Uraian Isi Notulen */}
                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Uraian Pembahasan / Instruksi Tugas
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Tuliskan butir arahan rapat atau rincian pekerjaan tindak lanjut yang harus diselesaikan..."
                                rows={3}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                maxLength={5000}
                                required
                            />
                        </div>

                        {/* 5. Tenggat Waktu (Khusus TUGAS) */}
                        {noteType === "TUGAS" && (
                            <div className="max-w-xs">
                                <label className="block text-xs font-semibold text-foreground mb-1.5">
                                    Tenggat Waktu Awal (Deadline 1) <span className="text-rose-500">*Wajib</span>
                                </label>
                                <input
                                    type="date"
                                    value={initialDeadlineDate}
                                    onChange={(e) => setInitialDeadlineDate(e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    required
                                />
                            </div>
                        )}

                        {editingNote && (
                            <div>
                                <label className="block text-xs font-semibold text-foreground mb-1.5">
                                    Alasan Perubahan <span className="text-rose-500">*Wajib</span>
                                </label>
                                <textarea
                                    value={changeReason}
                                    onChange={(event) => setChangeReason(event.target.value)}
                                    rows={2}
                                    minLength={5}
                                    maxLength={1000}
                                    required
                                    placeholder="Contoh: Koreksi isi setelah konfirmasi ulang dengan Direksi."
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    Isi sebelumnya dan alasan ini disimpan permanen dalam riwayat revisi.
                                </p>
                            </div>
                        )}

                        {/* Tombol Simpan */}
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    resetForm();
                                    setIsFormOpen(false);
                                }}
                                disabled={submitting}
                                className="px-4 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitNote}
                                disabled={submitting || !content.trim()}
                                className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors disabled:opacity-50"
                            >
                                {submitting ? "Menyimpan..." : editingNote ? "Simpan Perubahan" : "Simpan Butir Notulen"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* List Kartu Notulen Hari Ini */}
            <div className="space-y-3">
                {notes.length === 0 ? (
                    <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                        <Info size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-medium">Belum ada catatan notulen untuk sesi rapat ini.</p>
                        <p className="text-xs mt-1">Klik tombol &ldquo;Tambah Catatan Notulen&rdquo; di atas untuk mencatat arahan baru.</p>
                    </div>
                ) : (
                    notes.map((note) => {
                        const isTask = note.type === "TUGAS";
                        const isComplete = note.taskStatus === "SELESAI";
                        const isDireksi = note.originType === "DIREKSI";

                        return (
                            <div
                                key={note.id}
                                className={`bg-card border rounded-xl p-4 sm:p-5 shadow-sm transition-all ${isTask
                                    ? isComplete
                                        ? "border-emerald-500/30 bg-emerald-500/[0.02]"
                                        : "border-purple-500/30 bg-purple-500/[0.02]"
                                    : "border-border"
                                    }`}
                            >
                                {/* Baris Atas: Badges & Routing */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/70">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {/* Tipe Badge */}
                                        {isTask ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                                <ListTodo size={12} />
                                                Tugas Tindak Lanjut
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                <Info size={12} />
                                                Informasi
                                            </span>
                                        )}

                                        {/* Routing Badge: DARI ➔ KEPADA */}
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-muted border border-border text-foreground font-medium flex-wrap">
                                            <span className={`font-bold ${isDireksi ? "text-purple-600 dark:text-purple-400" : "text-foreground"}`}>
                                                Dari: {note.originName}
                                            </span>
                                            <ArrowRight size={11} className="text-muted-foreground" />
                                            <span>
                                                Kepada:{" "}
                                                {note.isAllTarget ? (
                                                    <strong className="text-primary">Semua Karyawan (ALL)</strong>
                                                ) : (
                                                    <strong>
                                                        {note.targets?.map((t) => {
                                                            if (t.label) return t.label;
                                                            if (t.employee) return `${t.employee.name} (${t.department?.name || "Karyawan"})`;
                                                            if (t.division) return `Divisi ${t.division.name}`;
                                                            if (t.department) return t.department.name;
                                                            return "Target Spesifik";
                                                        }).join(" • ") || "Target Spesifik"}
                                                    </strong>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {note.lastEditedAt && (
                                            <button
                                                type="button"
                                                onClick={() => void loadHistory(note)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-border hover:bg-muted text-muted-foreground"
                                            >
                                                <History size={13} />
                                                Direvisi
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => startEditing(note)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-border hover:bg-muted text-foreground"
                                        >
                                            <Pencil size={13} />
                                            Edit
                                        </button>
                                    </div>

                                    {/* Task Status Dropdown (Jika Tugas) */}
                                    {isTask && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-muted-foreground font-medium">Status:</span>
                                            <select
                                                value={note.taskStatus}
                                                onChange={(e) =>
                                                    onUpdateTaskStatus(note.id, e.target.value as GreenMeetingTaskStatus)
                                                }
                                                className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:outline-none ${note.taskStatus === "SELESAI"
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                    : note.taskStatus === "SEDANG_BERJALAN"
                                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                        : note.taskStatus === "DIBATALKAN"
                                                            ? "bg-muted text-muted-foreground border-border"
                                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                    }`}
                                            >
                                                <option value="BELUM_DIMULAI">Belum Dimulai</option>
                                                <option value="SEDANG_BERJALAN">Sedang Berjalan</option>
                                                <option value="SELESAI">Selesai</option>
                                                <option value="DIBATALKAN">Dibatalkan</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Konten Catatan Notulen */}
                                <div className="mt-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                    {note.content}
                                </div>

                                {/* Bagian Bawah: Info Deadline (Jika Tugas) */}
                                {isTask && note.deadlines && note.deadlines.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={13} className="text-primary" />
                                            <span>
                                                Tenggat Waktu:{" "}
                                                <strong className="text-foreground">
                                                    {new Date(note.deadlines[note.deadlines.length - 1].deadlineDate).toLocaleDateString("id-ID", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </strong>
                                            </span>
                                            {note.deadlines.length > 1 && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                    Molor (Perpanjangan ke-{note.deadlines.length - 1})
                                                </span>
                                            )}
                                        </div>

                                        {note.completedAt && (
                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                                <CheckCircle2 size={13} />
                                                Selesai pada {new Date(note.completedAt).toLocaleDateString("id-ID")}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {historyNote && (
                <AccessibleModal
                    ariaLabel="Riwayat revisi notulensi"
                    onClose={() => setHistoryNote(null)}
                    className="max-w-2xl max-h-[85vh] overflow-y-auto"
                >
                    <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                        <div>
                            <h3 className="font-bold text-foreground">Riwayat Revisi Notulensi</h3>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{historyNote.content}</p>
                        </div>
                        <button type="button" onClick={() => setHistoryNote(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Tutup riwayat revisi">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="mt-4 space-y-3">
                        {historyLoading ? (
                            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Memuat riwayat...</div>
                        ) : revisions.length === 0 ? (
                            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat revisi.</p>
                        ) : revisions.map((revision) => (
                            <div key={revision.id} className="rounded-lg border border-border bg-muted/30 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-foreground">Revisi #{revision.revisionNumber}</span>
                                    <span className="text-[11px] text-muted-foreground">{new Date(revision.createdAt).toLocaleString("id-ID")}</span>
                                </div>
                                <p className="mt-2 text-xs text-foreground"><strong>Alasan:</strong> {revision.changeReason}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">Diubah oleh {revision.changedBy}</p>
                            </div>
                        ))}
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
