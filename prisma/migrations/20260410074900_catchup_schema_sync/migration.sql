-- ============================================================
-- Catch-up migration: sync migration history with schema.prisma
-- All these changes were already applied via `prisma db push`.
-- This file only records them for migration history consistency.
-- ============================================================

-- ─── 1. employees: ADD new columns ─────────────────────────
ALTER TABLE `employees` ADD COLUMN `gender` VARCHAR(191) NOT NULL DEFAULT 'Laki-Laki';
ALTER TABLE `employees` ADD COLUMN `basic_salary` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `employees` ADD COLUMN `level` VARCHAR(191) NOT NULL DEFAULT 'STAFF';
ALTER TABLE `employees` ADD COLUMN `manager_id` VARCHAR(191) NULL;

-- employees: ALTER column types
ALTER TABLE `employees` MODIFY COLUMN `face_descriptor` LONGTEXT NULL;
ALTER TABLE `employees` MODIFY COLUMN `join_date` DATETIME(3) NOT NULL;

-- employees: ADD unique index on email
CREATE UNIQUE INDEX `employees_email_key` ON `employees`(`email`);

-- employees: ADD manager FK index + constraint
CREATE INDEX `employees_manager_id_fkey` ON `employees`(`manager_id`);
ALTER TABLE `employees` ADD CONSTRAINT `employees_manager_id_fkey` FOREIGN KEY (`manager_id`) REFERENCES `employees`(`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 2. work_shifts: restructure to day-based schedule ─────
ALTER TABLE `work_shifts` DROP COLUMN `start_time`;
ALTER TABLE `work_shifts` DROP COLUMN `end_time`;
ALTER TABLE `work_shifts` ADD COLUMN `early_check_in` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `work_shifts` ADD COLUMN `early_check_out` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `work_shifts` ADD COLUMN `late_check_in` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `work_shifts` ADD COLUMN `late_check_out` INTEGER NOT NULL DEFAULT 0;

-- CreateTable: work_shift_days
CREATE TABLE `work_shift_days` (
    `id` VARCHAR(191) NOT NULL,
    `shift_id` VARCHAR(191) NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `start_time` VARCHAR(191) NOT NULL,
    `end_time` VARCHAR(191) NOT NULL,
    `is_off` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `work_shift_days_shift_id_day_of_week_key`(`shift_id`, `day_of_week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `work_shift_days` ADD CONSTRAINT `work_shift_days_shift_id_fkey` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. attendance_records: ALTER column types ─────────────
ALTER TABLE `attendance_records` MODIFY COLUMN `date` DATETIME(3) NOT NULL;
ALTER TABLE `attendance_records` MODIFY COLUMN `clock_in` DATETIME(3) NULL;
ALTER TABLE `attendance_records` MODIFY COLUMN `clock_out` DATETIME(3) NULL;
ALTER TABLE `attendance_records` MODIFY COLUMN `clock_in_location` LONGTEXT NULL;
ALTER TABLE `attendance_records` MODIFY COLUMN `clock_out_location` LONGTEXT NULL;

-- ─── 4. visit_reports: ALTER column types ──────────────────
ALTER TABLE `visit_reports` MODIFY COLUMN `date` DATETIME(3) NOT NULL;
ALTER TABLE `visit_reports` MODIFY COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `visit_reports` MODIFY COLUMN `location` LONGTEXT NULL;

-- visit_reports: ADD FK index
CREATE INDEX `visit_reports_employee_id_fkey` ON `visit_reports`(`employee_id`);

-- ─── 5. overtime_requests: ALTER column types + ADD columns ─
ALTER TABLE `overtime_requests` MODIFY COLUMN `date` DATETIME(3) NOT NULL;
ALTER TABLE `overtime_requests` MODIFY COLUMN `start_time` DATETIME(3) NOT NULL;
ALTER TABLE `overtime_requests` MODIFY COLUMN `end_time` DATETIME(3) NOT NULL;
ALTER TABLE `overtime_requests` MODIFY COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `overtime_requests` ADD COLUMN `approved_hours` DOUBLE NULL;
ALTER TABLE `overtime_requests` ADD COLUMN `is_holiday` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `overtime_requests` ADD COLUMN `overtime_pay` DOUBLE NOT NULL DEFAULT 0;

-- overtime_requests: ADD FK index
CREATE INDEX `overtime_requests_employee_id_fkey` ON `overtime_requests`(`employee_id`);

-- ─── 6. leave_requests: ALTER column types + ADD columns ───
ALTER TABLE `leave_requests` MODIFY COLUMN `start_date` DATETIME(3) NOT NULL;
ALTER TABLE `leave_requests` MODIFY COLUMN `end_date` DATETIME(3) NOT NULL;
ALTER TABLE `leave_requests` MODIFY COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `leave_requests` ADD COLUMN `attachment` LONGTEXT NULL;

-- leave_requests: ADD FK index
CREATE INDEX `leave_requests_employee_id_fkey` ON `leave_requests`(`employee_id`);

-- ─── 7. payslip_records: ALTER column types ────────────────
ALTER TABLE `payslip_records` MODIFY COLUMN `issued_date` DATETIME(3) NOT NULL;
ALTER TABLE `payslip_records` MODIFY COLUMN `allowances` LONGTEXT NOT NULL;
ALTER TABLE `payslip_records` MODIFY COLUMN `deductions` LONGTEXT NOT NULL;

-- payslip_records: ADD FK index
CREATE INDEX `payslip_records_employee_id_fkey` ON `payslip_records`(`employee_id`);

-- ─── 8. news_items: ALTER + ADD columns ────────────────────
ALTER TABLE `news_items` MODIFY COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `news_items` ADD COLUMN `media_name` VARCHAR(191) NULL;
ALTER TABLE `news_items` ADD COLUMN `media_url` VARCHAR(191) NULL;

-- ─── 9. todo_items: ALTER column type ──────────────────────
ALTER TABLE `todo_items` MODIFY COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- todo_items: ADD FK index
CREATE INDEX `todo_items_employee_id_fkey` ON `todo_items`(`employee_id`);

-- ─── 10. divisions / departments: INVERT hierarchy ─────────

-- Drop old FK: divisions.department_id → departments.id
ALTER TABLE `divisions` DROP FOREIGN KEY `divisions_department_id_fkey`;
DROP INDEX `divisions_name_department_id_key` ON `divisions`;
ALTER TABLE `divisions` DROP COLUMN `department_id`;
CREATE UNIQUE INDEX `divisions_name_key` ON `divisions`(`name`);

-- Add new FK: departments.division_id → divisions.id
ALTER TABLE `departments` ADD COLUMN `division_id` VARCHAR(191) NOT NULL;
CREATE INDEX `departments_division_id_fkey` ON `departments`(`division_id`);
ALTER TABLE `departments` ADD CONSTRAINT `departments_division_id_fkey` FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 11. positions: ADD level column ───────────────────────
ALTER TABLE `positions` ADD COLUMN `level` VARCHAR(191) NOT NULL DEFAULT 'STAFF';

-- ─── 12. CreateTable: employee_payroll_components ──────────
CREATE TABLE `employee_payroll_components` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `component_id` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `employee_payroll_components_employee_id_component_id_key`(`employee_id`, `component_id`),
    INDEX `employee_payroll_components_component_id_fkey`(`component_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_payroll_components` ADD CONSTRAINT `employee_payroll_components_component_id_fkey` FOREIGN KEY (`component_id`) REFERENCES `payroll_components`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_payroll_components` ADD CONSTRAINT `employee_payroll_components_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 13. CreateTable: push_subscriptions ───────────────────
CREATE TABLE `push_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_employee_id_fkey`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 14. CreateTable: assets ───────────────────────────────
CREATE TABLE `assets` (
    `id` VARCHAR(191) NOT NULL,
    `asset_code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('HANDPHONE', 'LAPTOP', 'NOMOR_HP') NOT NULL,
    `kondisi` ENUM('BAIK', 'KURANG_BAIK', 'RUSAK') NOT NULL DEFAULT 'BAIK',
    `status` ENUM('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED', 'COMPANY_OWNED') NOT NULL DEFAULT 'AVAILABLE',
    `holder_type` ENUM('EMPLOYEE', 'FORMER_EMPLOYEE', 'TEAM', 'GA_POOL', 'COMPANY_OWNED') NOT NULL DEFAULT 'GA_POOL',
    `assigned_to_name` VARCHAR(191) NULL,
    `assigned_at` DATETIME(3) NULL,
    `nomor_indosat` VARCHAR(191) NULL,
    `expired_date` DATETIME(3) NULL,
    `keterangan` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_asset_code_key`(`asset_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 15. CreateTable: asset_histories ──────────────────────
CREATE TABLE `asset_histories` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `from_holder_type` ENUM('EMPLOYEE', 'FORMER_EMPLOYEE', 'TEAM', 'GA_POOL', 'COMPANY_OWNED') NULL,
    `from_name` VARCHAR(191) NULL,
    `to_holder_type` ENUM('EMPLOYEE', 'FORMER_EMPLOYEE', 'TEAM', 'GA_POOL', 'COMPANY_OWNED') NOT NULL,
    `to_name` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `kondisi_saat` ENUM('BAIK', 'KURANG_BAIK', 'RUSAK') NOT NULL,
    `notes` TEXT NULL,
    `performed_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_histories` ADD CONSTRAINT `asset_histories_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
