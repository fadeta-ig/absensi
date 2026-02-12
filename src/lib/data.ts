// In-memory data store for the WIG Attendance System
// In production, replace with a real database (e.g., PostgreSQL, MySQL)

import { v4 as uuidv4 } from "uuid";

// ============== Types ==============
export interface Employee {
    id: string;
    employeeId: string; // ID Karyawan (login credential)
    name: string;
    email: string;
    phone: string;
    department: string;
    position: string;
    role: "employee" | "hr";
    password: string; // hashed
    faceDescriptor?: number[]; // face-api.js descriptor
    joinDate: string;
    totalLeave: number;
    usedLeave: number;
    avatarUrl?: string;
    isActive: boolean;
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    clockInLocation?: { lat: number; lng: number };
    clockOutLocation?: { lat: number; lng: number };
    clockInPhoto?: string;
    clockOutPhoto?: string;
    status: "present" | "late" | "absent" | "leave";
    notes?: string;
}

export interface PayslipRecord {
    id: string;
    employeeId: string;
    period: string; // e.g., "2026-02"
    basicSalary: number;
    allowances: number;
    deductions: number;
    overtime: number;
    netSalary: number;
    issuedDate: string;
    notes?: string;
}

export interface LeaveRequest {
    id: string;
    employeeId: string;
    type: "annual" | "sick" | "personal" | "maternity";
    startDate: string;
    endDate: string;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
}

export interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: "announcement" | "event" | "policy" | "general";
    author: string;
    createdAt: string;
    isPinned: boolean;
}

export interface TodoItem {
    id: string;
    employeeId: string;
    text: string;
    completed: boolean;
    createdAt: string;
}

// ============== In-Memory Store ==============
const employees: Employee[] = [
    {
        id: uuidv4(),
        employeeId: "WIG001",
        name: "Admin HR",
        email: "hr@wig.co.id",
        phone: "08123456789",
        department: "Human Resources",
        position: "HR Manager",
        role: "hr",
        password: "$2a$10$XQxBj3Fy.Cv5nWYZz0VZzOQKZvZ3q3q3q3q3q3q3q3q3q3q3q3q", // will be set on init
        joinDate: "2024-01-15",
        totalLeave: 12,
        usedLeave: 2,
        isActive: true,
    },
    {
        id: uuidv4(),
        employeeId: "WIG002",
        name: "Budi Santoso",
        email: "budi@wig.co.id",
        phone: "08198765432",
        department: "Engineering",
        position: "Software Engineer",
        role: "employee",
        password: "$2a$10$XQxBj3Fy.Cv5nWYZz0VZzOQKZvZ3q3q3q3q3q3q3q3q3q3q3q3q",
        joinDate: "2024-03-01",
        totalLeave: 12,
        usedLeave: 5,
        isActive: true,
    },
];

const attendanceRecords: AttendanceRecord[] = [];
const payslipRecords: PayslipRecord[] = [];
const leaveRequests: LeaveRequest[] = [];
const newsItems: NewsItem[] = [
    {
        id: uuidv4(),
        title: "Selamat Datang di WIG Attendance System",
        content: "Sistem absensi digital PT Wijaya Inovasi Gemilang kini telah aktif. Silakan gunakan fitur absensi dengan face recognition untuk pencatatan kehadiran yang lebih akurat.",
        category: "announcement",
        author: "Admin HR",
        createdAt: new Date().toISOString(),
        isPinned: true,
    },
    {
        id: uuidv4(),
        title: "Kebijakan Work From Home 2026",
        content: "Mulai bulan Maret 2026, kebijakan WFH akan diterapkan maksimal 2 hari per minggu. Detail lebih lanjut akan diinformasikan melalui email resmi perusahaan.",
        category: "policy",
        author: "Admin HR",
        createdAt: new Date().toISOString(),
        isPinned: false,
    },
];
const todoItems: TodoItem[] = [];

// ============== Employee CRUD ==============
export function getEmployees(): Employee[] {
    return employees;
}

export function getEmployeeById(id: string): Employee | undefined {
    return employees.find((e) => e.id === id);
}

export function getEmployeeByEmployeeId(employeeId: string): Employee | undefined {
    return employees.find((e) => e.employeeId === employeeId);
}

export function createEmployee(data: Omit<Employee, "id">): Employee {
    const emp: Employee = { id: uuidv4(), ...data };
    employees.push(emp);
    return emp;
}

export function updateEmployee(id: string, data: Partial<Employee>): Employee | null {
    const idx = employees.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    employees[idx] = { ...employees[idx], ...data };
    return employees[idx];
}

export function deleteEmployee(id: string): boolean {
    const idx = employees.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    employees.splice(idx, 1);
    return true;
}

// ============== Attendance CRUD ==============
export function getAttendanceRecords(employeeId?: string): AttendanceRecord[] {
    if (employeeId) return attendanceRecords.filter((a) => a.employeeId === employeeId);
    return attendanceRecords;
}

export function getAttendanceByDate(employeeId: string, date: string): AttendanceRecord | undefined {
    return attendanceRecords.find((a) => a.employeeId === employeeId && a.date === date);
}

export function createAttendance(data: Omit<AttendanceRecord, "id">): AttendanceRecord {
    const record: AttendanceRecord = { id: uuidv4(), ...data };
    attendanceRecords.push(record);
    return record;
}

export function updateAttendance(id: string, data: Partial<AttendanceRecord>): AttendanceRecord | null {
    const idx = attendanceRecords.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    attendanceRecords[idx] = { ...attendanceRecords[idx], ...data };
    return attendanceRecords[idx];
}

// ============== Payslip CRUD ==============
export function getPayslips(employeeId?: string): PayslipRecord[] {
    if (employeeId) return payslipRecords.filter((p) => p.employeeId === employeeId);
    return payslipRecords;
}

export function createPayslip(data: Omit<PayslipRecord, "id">): PayslipRecord {
    const record: PayslipRecord = { id: uuidv4(), ...data };
    payslipRecords.push(record);
    return record;
}

// ============== Leave CRUD ==============
export function getLeaveRequests(employeeId?: string): LeaveRequest[] {
    if (employeeId) return leaveRequests.filter((l) => l.employeeId === employeeId);
    return leaveRequests;
}

export function createLeaveRequest(data: Omit<LeaveRequest, "id">): LeaveRequest {
    const record: LeaveRequest = { id: uuidv4(), ...data };
    leaveRequests.push(record);
    return record;
}

export function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): LeaveRequest | null {
    const idx = leaveRequests.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    leaveRequests[idx] = { ...leaveRequests[idx], ...data };
    return leaveRequests[idx];
}

// ============== News CRUD ==============
export function getNews(): NewsItem[] {
    return newsItems.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function createNews(data: Omit<NewsItem, "id">): NewsItem {
    const item: NewsItem = { id: uuidv4(), ...data };
    newsItems.push(item);
    return item;
}

export function updateNews(id: string, data: Partial<NewsItem>): NewsItem | null {
    const idx = newsItems.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    newsItems[idx] = { ...newsItems[idx], ...data };
    return newsItems[idx];
}

export function deleteNews(id: string): boolean {
    const idx = newsItems.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    newsItems.splice(idx, 1);
    return true;
}

// ============== Todo CRUD ==============
export function getTodos(employeeId: string): TodoItem[] {
    return todoItems.filter((t) => t.employeeId === employeeId);
}

export function createTodo(data: Omit<TodoItem, "id">): TodoItem {
    const item: TodoItem = { id: uuidv4(), ...data };
    todoItems.push(item);
    return item;
}

export function updateTodo(id: string, data: Partial<TodoItem>): TodoItem | null {
    const idx = todoItems.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    todoItems[idx] = { ...todoItems[idx], ...data };
    return todoItems[idx];
}

export function deleteTodo(id: string): boolean {
    const idx = todoItems.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    todoItems.splice(idx, 1);
    return true;
}
