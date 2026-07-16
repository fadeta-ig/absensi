-- Add session revocation and current status metadata without changing existing status values.
ALTER TABLE `employees`
    ADD COLUMN `session_version` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `status_changed_at` DATETIME(3) NULL;

CREATE INDEX `idx_employees_is_active` ON `employees`(`is_active`);

-- Preserve every activation/deactivation as an immutable, attributable event.
CREATE TABLE `employee_status_histories` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `was_active` BOOLEAN NOT NULL,
    `is_active` BOOLEAN NOT NULL,
    `reason` TEXT NOT NULL,
    `effective_date` DATETIME(3) NOT NULL,
    `changed_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_employee_status_history_subject_created`(`employee_id`, `created_at`),
    INDEX `idx_employee_status_history_actor`(`changed_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_status_histories`
    ADD CONSTRAINT `employee_status_histories_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `employee_status_histories_changed_by_fkey`
        FOREIGN KEY (`changed_by`) REFERENCES `employees`(`employee_id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
