# Findings: Read-only Bulk Action Audit — Shared Table UX

## Scope
- User requested read-only audit only; no source code changes.
- Audited shared Table consumers and BulkActionBar consumers under `src/`.
- `src/components/ui/table.tsx` is a presentational primitive; bulk-selection/action policy belongs to each table owner.

## Inventory
- Shared Table consumers discovered: 31 files.
- BulkActionBar consumers discovered: 10 feature files (plus the component definition).

## Bulk Employee Actions Feasibility Analysis (Employees Page)

### 1. Fitur "Kirim Password" (Send Password)
- **Endpoint aktual**: `POST /api/auth/send-password` (`{ employeeId: string }`).
- **Prasyarat per karyawan**:
  1. `employee.isActive === true` (karyawan aktif).
  2. `employee.userAccount?.isActive === true` (akun login tersedia dan aktif).
  3. `employee.email` tidak boleh kosong (membutuhkan alamat email untuk SMTP).
- **Karakteristik & Dampak**:
  - Menghasilkan random password 10 karakter.
  - Melakukan bcrypt hash (12 salt rounds) + update `passwordHash`, `passwordChangedAt`, dan increment `sessionVersion` (membatalkan token sesi lama).
  - Mengirim email kredensial via SMTP.
  - Mencatat AuditLog `RESET_PASSWORD` pada `USER_ACCOUNT`.
- **Kesimpulan Kelayakan**:
  - **BISA DILAKUKAN BULK TANPA UBAH SKEMA BASIS DATA.**
  - Loop pemrosesan harus berurutan dengan feedback progres transparan.
  - Karyawan nonaktif atau tanpa email otomatis dilewati (skipped).
  - Wajib dilindungi modal konfirmasi (`ConfirmModal`).

### 2. Fitur "Aktifkan Karyawan" (Bulk Reactivation)
- **Endpoint aktual**: `PATCH /api/employees/[id]/status` (`{ isActive: true, reason: string, effectiveDate: string }`).
- **Service**: `changeEmployeeStatus` di `src/lib/services/employeeStatusService.ts`.
- **Prasyarat**:
  - Hanya untuk karyawan yang `isActive === false`.
  - Membutuhkan `reason` (min. 5 karakter) dan `effectiveDate` (YYYY-MM-DD <= hari ini).
- **Kesimpulan Kelayakan**:
  - **BISA DILAKUKAN BULK TANPA UBAH SKEMA BASIS DATA.**
  - Mengaktifkan kembali `employee.isActive = true` dan `userAccount.isActive = true`.
  - Mencatat riwayat ke `EmployeeStatusHistory` dan `AuditLog`.

### 3. Fitur "Nonaktifkan Karyawan" (Bulk Deactivation)
- **Endpoint aktual**: `PATCH /api/employees/[id]/status`.
- **Aturan Bisnis & Hambatan Sistemik**:
  1. **Hirarki Manajerial**: Jika karyawan adalah atasan/manager yang memiliki bawahan aktif (`directReports.length > 0`), backend melempar error 409 jika `reassignManagerId` tidak ditentukan. Pada aksi massal terhadap beberapa manager sekaligus, pengalihan bawahan tidak dapat disamaratakan karena masing-masing divisi/departemen memiliki atasan pengganti yang berbeda.
  2. **Proteksi Akun Pribadi**: Dilarang menonaktifkan akun sendiri (`actorUserId`).
  3. **Proteksi Super Admin**: Dilarang menonaktifkan super admin aktif terakhir.
  4. **Dampak Aset & SIM**: Karyawan nonaktif mungkin memegang aset/SIM yang memerlukan serah terima fisik ke GA.
- **Kesimpulan Kelayakan**:
  - **BISA DILAKUKAN DENGAN FILTER STRICT KEAMANAN**:
    - Bulk deactivation **HANYA** boleh memproses karyawan yang **TIDAK MEMILIKI BAWAHAN LANGSUNG** (`directReports === 0`).
    - Jika ada manager terpilih, sistem harus menginformasikan bahwa manager tersebut harus dinonaktifkan secara individual melalui `EmployeeStatusModal` untuk menentukan atasan pengganti bagi bawahannya.

C:/Users/ITSupportWIG/Desktop/hriswig/src\components\ui\BulkActionBar.tsx
  1: "use client";
  2: 
  3: import React from "react";
  4: import { CheckSquare, X } from "lucide-react";
  5: 
  6: interface BulkActionBarProps {
  7:     selectedCount: number;
  8:     totalCount?: number;
  9:     onClearSelection: () => void;
  10:     onSelectAll?: () => void;
  11:     allSelected?: boolean;
  12:     itemLabel?: string;
  13:     children: React.ReactNode;
  14:     className?: string;
  15: }
  16: 
  17: export default function BulkActionBar({
  18:     selectedCount,
  19:     totalCount,
  20:     onClearSelection,
  21:     onSelectAll,
  22:     allSelected = false,
  23:     itemLabel = "data",
  24:     children,
  25:     className = "",
  26: }: BulkActionBarProps) {
  27:     if (selectedCount === 0) return null;
  28: 
  29:     return (
  30:         <div
  31:             className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-3xl animate-[fadeIn_0.25s_ease] ${className}`}
  32:         >
  33:             <div className="bg-[var(--card)]/95 backdrop-blur-md border-2 border-[var(--primary)] text-[var(--text-primary)] rounded-2xl p-3 sm:px-5 sm:py-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.18)] flex flex-wrap items-center justify-between gap-3">
  34:                 {/* Left: Selection info and select-all trigger */}
C:/Users/ITSupportWIG/Desktop/hriswig/src\app\dashboard\visits\components\VisitListTable.tsx
  1: "use client";
  2: 
  3: import { useState, useMemo } from "react";
  4: import { AlertCircle, CheckCircle, Eye, Loader2, XCircle, LogIn, LogOut, CheckSquare, Square, FileSpreadsheet, Check } from "lucide-react";
  5: import { VisitReport, STATUS_CONFIG } from "../types";
  6: import DataTablePagination from "@/components/ui/DataTablePagination";
  7: import BulkActionBar from "@/components/ui/BulkActionBar";
  8: import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
  9: import { exportToExcel } from "@/lib/export";
  10: import { useToast } from "@/components/Toast";
  11: import { useTablePagination } from "@/hooks/useTablePagination";
  12: 
  13: interface Props {
  14:     filtered: VisitReport[];
  15:     loading: boolean;
  268:                 totalPages={totalPages}
  269:                 totalItems={filtered.length}
  270:                 pageSize={pageSize}
  271:                 onPageChange={setCurrentPage}
  272:                 onPageSizeChange={setPageSize}
  273:                 itemLabel="kunjungan"
  274:             />
  275: 
  276:             <BulkActionBar
  277:                 selectedCount={selectedIds.size}
  278:                 totalCount={filtered.length}
  279:                 allSelected={isAllFilteredSelected}
  280:                 onSelectAll={selectAllFiltered}
  281:                 onClearSelection={clearSelection}
  282:                 itemLabel="kunjungan"
  283:             >
  284:                 <button
  293:                 <button
  294:                     type="button"
  295:                     onClick={handleBulkExportExcel}
  296:                     className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
  297:                 >
  298:                     <FileSpreadsheet className="w-3.5 h-3.5" />
  299:                     Ekspor Excel
  300:                 </button>
  301:             </BulkActionBar>
  302:         </div>
  303:     );
  304: }
C:/Users/ITSupportWIG/Desktop/hriswig/src\app\dashboard\overtime\page.tsx
  3: import { useEffect, useState, useMemo, useRef, Suspense } from "react";
  4: import {
  5:     AlertCircle, Clock4, Search, CheckCircle, XCircle,
  6:     Calendar, Eye, X, Loader2,
  7:     CheckSquare, Square, FileSpreadsheet, Check, RotateCcw
  8: } from "lucide-react";
  9: import { useToast } from "@/components/Toast";
  10: import DataTablePagination from "@/components/ui/DataTablePagination";
  11: import BulkActionBar from "@/components/ui/BulkActionBar";
  12: import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
  13: import { exportToExcel } from "@/lib/export";
  14: import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
  15: import { useTablePagination } from "@/hooks/useTablePagination";
  16: import { getThisMonthRange, getLastMonthRange, getThisYearRange, isDateInRange } from "@/lib/datePresets";
  17: 
  18: interface OvertimeRequest {
  19:     id: string;
  558:                     pageSize={pageSize}
  559:                     onPageChange={setCurrentPage}
  560:                     onPageSizeChange={setPageSize}
  561:                     itemLabel="pengajuan lembur"
  562:                 />
