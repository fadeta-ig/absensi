-- CreateTable
CREATE TABLE `greeting_rules` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `greeting` VARCHAR(120) NOT NULL,
    `sub_greeting` TEXT NOT NULL,
    `start_time` VARCHAR(5) NOT NULL,
    `end_time` VARCHAR(5) NOT NULL,
    `repeat_weekly` BOOLEAN NOT NULL DEFAULT true,
    `days_of_week` VARCHAR(20) NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    `specific_date` VARCHAR(10) NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by_user_id` VARCHAR(191) NULL,
    `updated_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_greeting_rules_active_priority`(`is_active`, `priority`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
