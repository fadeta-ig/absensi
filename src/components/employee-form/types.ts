export interface ShiftDay { dayOfWeek: number; startTime: string; endTime: string; isOff: boolean; }
export interface WorkShift { id: string; name: string; isDefault: boolean; days: ShiftDay[]; }
export interface Location { id: string; name: string; }
export interface Division { id: string; name: string; }
export interface Department { id: string; name: string; divisionId: string; division?: { name: string } }
export interface Position { id: string; name: string; }
export interface MasterPayrollComponent { id: string; name: string; type: "earning" | "deduction"; defaultAmount: number; isActive: boolean; }

export type FormPayrollComponent = {
    id?: string;
    employeeId?: string;
    componentId: string;
    amount: number;
    component?: MasterPayrollComponent;
};

export interface FormState {
    employeeId: string;
    name: string;
    email: string;
    phone: string;
    departmentId: string;
    divisionId: string;
    positionId: string;
    joinDate: string;
    totalLeave: number;
    usedLeave: number;
    shiftId: string;
    bypassLocation: boolean;
    locations: { id: string; name: string }[];
    basicSalary: number;
    payrollComponents: FormPayrollComponent[];
    managerId: string;
}
