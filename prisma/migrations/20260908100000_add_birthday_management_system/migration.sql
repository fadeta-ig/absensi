-- CreateTable
CREATE TABLE `birthday_reminder_settings` (
    `id` VARCHAR(191) NOT NULL,
    `is_email_enabled` BOOLEAN NOT NULL DEFAULT false,
    `recipient_emails` TEXT NOT NULL,
    `reminder_days` VARCHAR(191) NOT NULL DEFAULT '30,14,7',
    `last_run_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `updated_by` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `birthday_preparation_statuses` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `color` VARCHAR(50) NOT NULL DEFAULT '#800020',
    `order` INTEGER NOT NULL DEFAULT 0,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `birthday_preparation_statuses_name_key`(`name`),
    INDEX `idx_birthday_prep_status_is_active`(`is_active`),
    INDEX `idx_birthday_prep_status_order`(`order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_birthday_preparations` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `status_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `updated_by` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_emp_bday_prep_employee_id`(`employee_id`),
    INDEX `idx_emp_bday_prep_status_id`(`status_id`),
    UNIQUE INDEX `idx_emp_bday_prep_emp_year`(`employee_id`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employee_birthday_preparations`
    ADD CONSTRAINT `employee_birthday_preparations_employee_id_fkey`
    FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_birthday_preparations`
    ADD CONSTRAINT `employee_birthday_preparations_status_id_fkey`
    FOREIGN KEY (`status_id`) REFERENCES `birthday_preparation_statuses`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert Default Reminder Settings
INSERT INTO `birthday_reminder_settings` (`id`, `is_email_enabled`, `recipient_emails`, `reminder_days`, `updated_at`)
VALUES ('default', false, '', '30,14,7', NOW(3))
ON DUPLICATE KEY UPDATE `id` = `id`;

-- Insert Initial Default Preparation Statuses
INSERT INTO `birthday_preparation_statuses` (`id`, `name`, `color`, `order`, `is_default`, `is_active`, `created_at`, `updated_at`)
VALUES
    ('status-kirim-ucapan', 'Kirim Ucapan', '#0284c7', 1, true, true, NOW(3), NOW(3)),
    ('status-kue-dipesan', 'Kue Dipesan', '#eab308', 2, true, true, NOW(3), NOW(3)),
    ('status-selesai', 'Selesai', '#16a34a', 3, true, true, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `name` = `name`;
