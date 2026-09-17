-- AlterTable
ALTER TABLE `attendance_records`
    ADD COLUMN `is_off_day` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `off_day_reason` TEXT NULL;

-- CreateIndex
CREATE INDEX `idx_attendance_is_off_day` ON `attendance_records`(`is_off_day`);
