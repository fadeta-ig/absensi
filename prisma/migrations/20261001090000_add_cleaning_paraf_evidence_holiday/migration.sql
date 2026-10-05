-- CreateTable
CREATE TABLE `cleaning_daily_parafs` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `wib_date` VARCHAR(10) NOT NULL,
    `signer_role` ENUM('INSPECTED_BY', 'KNOWN_BY') NOT NULL,
    `signer_employee_id` VARCHAR(191) NOT NULL,
    `signer_name_snapshot` VARCHAR(200) NOT NULL,
    `signed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('TEPAT', 'TERLAMBAT') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_cleaning_paraf_wib_date`(`wib_date`),
    INDEX `idx_cleaning_paraf_signer`(`signer_employee_id`),
    UNIQUE INDEX `idx_cleaning_paraf_room_date_role`(`room_id`, `wib_date`, `signer_role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cleaning_evidence_photos` (
    `id` VARCHAR(191) NOT NULL,
    `checklist_item_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `wib_date` VARCHAR(10) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `captured_at` DATETIME(3) NOT NULL,
    `uploaded_by_user_id` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idx_cleaning_evidence_path_unique`(`file_path`),
    INDEX `idx_cleaning_evidence_item`(`checklist_item_id`),
    INDEX `idx_cleaning_evidence_room_date`(`room_id`, `wib_date`),
    INDEX `idx_cleaning_evidence_sha256`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cleaning_holidays` (
    `id` VARCHAR(191) NOT NULL,
    `wib_date` VARCHAR(10) NOT NULL,
    `description` TEXT NOT NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `idx_cleaning_holiday_date_unique`(`wib_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cleaning_daily_parafs` ADD CONSTRAINT `cleaning_daily_parafs_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `cleaning_rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cleaning_daily_parafs` ADD CONSTRAINT `cleaning_daily_parafs_signer_employee_id_fkey` FOREIGN KEY (`signer_employee_id`) REFERENCES `employees`(`employee_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cleaning_evidence_photos` ADD CONSTRAINT `cleaning_evidence_photos_checklist_item_id_fkey` FOREIGN KEY (`checklist_item_id`) REFERENCES `cleaning_daily_checklist_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cleaning_evidence_photos` ADD CONSTRAINT `cleaning_evidence_photos_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `cleaning_rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cleaning_evidence_photos` ADD CONSTRAINT `cleaning_evidence_photos_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cleaning_holidays` ADD CONSTRAINT `cleaning_holidays_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `user_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
