export interface Employee {
    id: string;
    employeeId: string;
    name: string;
    basicSalary: number;
    isActive: boolean;
    department: string;
    division?: string | null;
    payrollComponents?: {
        amount: number;
        component: { name: string; type: "earning" | "deduction" };
    }[];
}
export interface Division { id: string; name: string; }
export interface Department { id: string; name: string; divisionId: string; division?: { name: string } }
export interface AllowanceItem { name: string; amount: number; }
export interface MasterComponent { id: string; name: string; type: string; defaultAmount: number; isActive: boolean; }
export interface PayslipItem { type: "ALLOWANCE" | "DEDUCTION"; name: string; amount: number; }
export interface Payslip {
    id: string; employeeId: string; period: string; basicSalary: number;
    items: PayslipItem[];
    overtime: number; netSalary: number; issuedDate: string; notes?: string;
}
export type Tab = "recap" | "create" | "history";
