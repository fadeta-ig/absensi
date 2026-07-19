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
    academicTitle: string;
    preferredName: string;
    email: string;
    phone: string;
    alternatePhone: string;
    gender: "Laki-Laki" | "Perempuan";
    departmentId: string;
    divisionId: string;
    positionId: string;
    joinDate: string;
    employmentType: "PERMANENT" | "CONTRACT" | "PROBATION" | "INTERN";
    employmentStartDate: string;
    employmentEndDate: string;
    probationEndDate: string;
    totalLeave: number;
    usedLeave: number;
    shiftId: string;
    bypassLocation: boolean;
    locations: { id: string; name: string }[];
    basicSalary: number;
    payrollComponents: FormPayrollComponent[];
    managerId: string;
    birthPlace: string;
    birthDate: string;
    maritalStatus: string;
    bloodType: string;
    religion: string;
    lastEducation: string;
    notes: string;
    nationalId: string;
    familyCardNumber: string;
    bpjsEmploymentNumber: string;
    bpjsHealthNumber: string;
    idCardAddress: string;
    domicileAddress: string;
    emergencyContactName: string;
    emergencyContactRelationship: string;
    emergencyContactPhone: string;
    bankName: string;
    bankAccountNumber: string;
    bankAccountHolderName: string;
    ptkpStatus: string;
    ptkpEffectiveDate: string;
}
