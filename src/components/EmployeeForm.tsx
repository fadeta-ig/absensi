"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Employee } from "@/types";
import { useToast } from "@/components/Toast";
import { Department, Division, FormPayrollComponent, Location, MasterPayrollComponent, Position, WorkShift, FormState } from "./employee-form/types";
import { IdentitySection } from "./employee-form/IdentitySection";
import { JobSection } from "./employee-form/JobSection";
import { PayrollSection } from "./employee-form/PayrollSection";
import { LocationSection } from "./employee-form/LocationSection";


interface Props {
    initialData?: Partial<Employee>;
    isEdit?: boolean;
}

export default function EmployeeForm({ initialData, isEdit }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const toast = useToast();

    // Master data states
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [masterDepts, setMasterDepts] = useState<Department[]>([]);
    const [masterDivisions, setMasterDivisions] = useState<Division[]>([]);
    const [masterPositions, setMasterPositions] = useState<Position[]>([]);
    const [masterLocations, setMasterLocations] = useState<Location[]>([]);
    const [masterPayroll, setMasterPayroll] = useState<MasterPayrollComponent[]>([]);
    const [allEmployees, setAllEmployees] = useState<{ employeeId: string; name: string }[]>([]);

    const [form, setForm] = useState<FormState>({
        employeeId: initialData?.employeeId || "",
        name: initialData?.name || "",
        email: initialData?.email || "",
        phone: initialData?.phone || "",
        departmentId: initialData?.departmentId || "",
        divisionId: initialData?.divisionId || "",
        positionId: initialData?.positionId || "",
        role: (initialData?.role || "employee") as "employee" | "hr",
        joinDate: initialData?.joinDate || new Date().toISOString().split("T")[0],
        totalLeave: initialData?.totalLeave ?? 12,
        usedLeave: initialData?.usedLeave ?? 0,
        isActive: initialData?.isActive ?? true,
        shiftId: initialData?.shiftId || "",
        bypassLocation: initialData?.bypassLocation || false,
        locations: initialData?.locations || [] as { id: string; name: string }[],
        basicSalary: initialData?.basicSalary || 0,
        payrollComponents: (initialData?.payrollComponents || []) as FormPayrollComponent[],
        managerId: initialData?.managerId || "",
    });

    useEffect(() => {
        const load = async () => {
            try {
                const [d, v, p, l, s, m, emps] = await Promise.all([
                    fetch("/api/master/departments").then(r => r.json()),
                    fetch("/api/master/divisions").then(r => r.json()),
                    fetch("/api/master/positions").then(r => r.json()),
                    fetch("/api/master/locations").then(r => r.json()),
                    fetch("/api/shifts").then(r => r.json()),
                    fetch("/api/master/payroll-components").then(r => r.json()),
                    fetch("/api/employees").then(r => r.json()),
                ]);
                setMasterDepts(d);
                setMasterDivisions(v);
                setMasterPositions(p);
                setMasterLocations(l);
                setShifts(s);
                setMasterPayroll(m);
                if (Array.isArray(emps)) setAllEmployees(emps.map((e: { employeeId: string; name: string }) => ({ employeeId: e.employeeId, name: e.name })));

                // Set default shift if creating new
                if (!isEdit && !form.shiftId) {
                    const def = s.find((x: WorkShift) => x.isDefault);
                    if (def) setForm(f => ({ ...f, shiftId: def.id }));
                }

                // Initialize payroll components if creating new
                if (!isEdit && form.payrollComponents.length === 0) {
                    const comps = m.filter((x: MasterPayrollComponent) => x.isActive).map((x: MasterPayrollComponent) => ({
                        componentId: x.id,
                        amount: x.defaultAmount,
                        component: x
                    }));
                    setForm(f => ({ ...f, payrollComponents: comps }));
                }
            } catch (err) {
                console.error("Failed to load master data", err);
            } finally {
                setFetching(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEdit]);

    const selectedDivision = masterDivisions.find(v => v.id === form.divisionId);
    const availableDepartments = masterDepts.filter(d =>
        selectedDivision ? d.divisionId === selectedDivision.id : false
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const method = isEdit ? "PUT" : "POST";
            const body = isEdit ? { ...form, id: initialData?.id } : form;
            const res = await fetch("/api/employees", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const data = await res.json();
                if (data._emailWarning) {
                    toast("Karyawan ditambahkan, namun gagal mengirim email password. Silakan kirim manual.", "warning");
                } else {
                    toast(isEdit ? "Data karyawan berhasil diperbarui!" : "Karyawan baru berhasil ditambahkan!", "success");
                }
                router.push("/dashboard/employees");
                router.refresh();
            } else {
                const error = await res.json();
                toast(error.error || "Gagal menyimpan data karyawan.", "error");
            }
        } catch {
            toast("Kesalahan koneksi ke server.", "error");
        } finally {
            setLoading(false);
        }
    };

    const toggleLocation = (loc: Location) => {
        const exists = form.locations.find(l => l.id === loc.id);
        if (exists) {
            setForm({ ...form, locations: form.locations.filter(l => l.id !== loc.id) });
        } else {
            setForm({ ...form, locations: [...form.locations, { id: loc.id, name: loc.name }] });
        }
    };

    const addPayrollComp = () => {
        const first = masterPayroll.find(p => !form.payrollComponents.some(c => c.componentId === p.id));
        if (!first) return;
        setForm({
            ...form,
            payrollComponents: [...form.payrollComponents, { componentId: first.id, amount: first.defaultAmount, component: first } as FormPayrollComponent]
        });
    };

    const removePayrollComp = (idx: number) => {
        setForm({
            ...form,
            payrollComponents: form.payrollComponents.filter((_, i) => i !== idx)
        });
    };

    const updatePayrollComp = (idx: number, field: string, value: string | number) => {
        const next = [...form.payrollComponents];
        if (field === "componentId") {
            const comp = masterPayroll.find(p => p.id === value);
            next[idx] = { ...next[idx], componentId: value as string, amount: comp?.defaultAmount || 0, component: comp };
        } else {
            next[idx] = { ...next[idx], [field]: value };
        }
        setForm({ ...form, payrollComponents: next });
    };

    if (fetching) return (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)] animate-pulse">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm font-medium">Memuat data...</p>
        </div>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-8 pb-10 max-w-5xl mx-auto">
            <div className="flex items-center justify-between sticky top-0 bg-[var(--background)]/80 backdrop-blur-sm z-10 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)]">{isEdit ? "Edit Karyawan" : "Tambah Karyawan Baru"}</h1>
                        <p className="text-xs text-[var(--text-muted)]">Pastikan data diisi dengan benar untuk keperluan payroll.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => router.back()} className="btn btn-secondary">Batal</button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {isEdit ? "Simpan Perubahan" : "Simpan Karyawan"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column (Identity & Job) */}
                <div className="lg:col-span-7 space-y-6">
                    <IdentitySection form={form} setForm={setForm} />
                    <JobSection
                        form={form}
                        setForm={setForm}
                        masterDivisions={masterDivisions}
                        availableDepartments={availableDepartments}
                        masterPositions={masterPositions}
                        allEmployees={allEmployees}
                        shifts={shifts}
                        initialData={initialData}
                    />
                </div>

                {/* Right Column (Payroll & Locations) */}
                <div className="lg:col-span-5 space-y-6">
                    <PayrollSection
                        form={form}
                        setForm={setForm}
                        masterPayroll={masterPayroll}
                        addPayrollComp={addPayrollComp}
                        removePayrollComp={removePayrollComp}
                        updatePayrollComp={updatePayrollComp}
                    />
                    <LocationSection
                        form={form}
                        setForm={setForm}
                        masterLocations={masterLocations}
                        toggleLocation={toggleLocation}
                    />
                </div>
            </div>
        </form>
    );
}
