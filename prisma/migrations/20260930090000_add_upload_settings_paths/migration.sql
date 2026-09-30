-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updated_by_user_id` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    CONSTRAINT `app_settings_pkey` PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `attendance_records` ADD COLUMN `clock_in_photo_path` VARCHAR(500) NULL, ADD COLUMN `clock_out_photo_path` VARCHAR(500) NULL;
ALTER TABLE `leave_requests` ADD COLUMN `attachment_path` VARCHAR(500) NULL, ADD COLUMN `attachment_mime` VARCHAR(150) NULL, ADD COLUMN `attachment_size` INTEGER NULL;
ALTER TABLE `employees` ADD COLUMN `avatar_path` VARCHAR(500) NULL;
ALTER TABLE `cleaning_monthly_approval_signatures` ADD COLUMN `signature_path` VARCHAR(500) NULL;
ALTER TABLE `asset_bast_documents` ADD COLUMN `file_path` VARCHAR(500) NULL;
