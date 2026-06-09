import { LucideIcon, Briefcase, DollarSign, UserCheck, Shield, Clock, Loader2, CheckCircle, XCircle } from "lucide-react";

export type LetterType = "SK_KERJA" | "KET_PENGHASILAN" | "KET_MASIH_BEKERJA" | "BPJS";
export type LetterStatus = "PENDING" | "PROCESSING" | "READY" | "REJECTED";

export interface LetterRequest {
    id: string;
    employeeId: string;
    employeeName: string | null;
    type: LetterType;
    purpose: string;
    status: LetterStatus;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export const TYPE_CONFIG: Record<LetterType, { label: string; icon: LucideIcon; color: string; bg: string }> = {
    SK_KERJA:          { label: "SK Kerja",              icon: Briefcase,  color: "text-blue-600",   bg: "bg-blue-50" },
    KET_PENGHASILAN:   { label: "Ket. Penghasilan",      icon: DollarSign, color: "text-green-600",  bg: "bg-green-50" },
    KET_MASIH_BEKERJA: { label: "Masih Aktif Bekerja",   icon: UserCheck,  color: "text-purple-600", bg: "bg-purple-50" },
    BPJS:              { label: "Keterangan BPJS",       icon: Shield,     color: "text-rose-600",   bg: "bg-rose-50" },
};

export const STATUS_CONFIG: Record<LetterStatus, { label: string; badge: string; icon: LucideIcon }> = {
    PENDING:    { label: "Menunggu",     badge: "badge-warning", icon: Clock },
    PROCESSING: { label: "Diproses",     badge: "badge-info",    icon: Loader2 },
    READY:      { label: "Siap Diambil", badge: "badge-success", icon: CheckCircle },
    REJECTED:   { label: "Ditolak",      badge: "badge-error",   icon: XCircle },
};
