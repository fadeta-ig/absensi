-- Expand employee master data without replacing employee_id or deleting legacy data.
-- Exactly one representative of every normalized ID is populated. Additional legacy
-- formatting collisions stay NULL, while the representative keeps the unique key locked
-- so no new collision can be inserted before manual reconciliation.
ALTER TABLE `employees`
    ADD COLUMN `employee_id_normalized` VARCHAR(100) NULL,
    ADD COLUMN `academic_title` VARCHAR(191) NULL,
    ADD COLUMN `preferred_name` VARCHAR(191) NULL,
    ADD COLUMN `alternate_phone` VARCHAR(191) NULL,
    ADD COLUMN `employment_type` ENUM('PERMANENT', 'CONTRACT', 'PROBATION', 'INTERN') NOT NULL DEFAULT 'PERMANENT',
    ADD COLUMN `employment_start_date` DATETIME(3) NULL,
    ADD COLUMN `employment_end_date` DATETIME(3) NULL,
    ADD COLUMN `probation_end_date` DATETIME(3) NULL;

UPDATE `employees` e
JOIN (
    SELECT `normalized_id`, MIN(`source_id`) AS `keep_id`
    FROM (
        SELECT `id` AS `source_id`, UPPER(REPLACE(REPLACE(TRIM(`employee_id`), '-', ''), ' ', '')) AS `normalized_id`
        FROM `employees`
    ) normalized_employees
    GROUP BY `normalized_id`
) chosen_ids ON chosen_ids.`keep_id` = e.`id`
SET e.`employee_id_normalized` = chosen_ids.`normalized_id`;

CREATE UNIQUE INDEX `employees_employee_id_normalized_key` ON `employees`(`employee_id_normalized`);
CREATE INDEX `idx_employees_employment_type` ON `employees`(`employment_type`);

CREATE TABLE `employee_private_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `birth_place` VARCHAR(191) NULL,
    `birth_date` DATETIME(3) NULL,
    `marital_status` VARCHAR(50) NULL,
    `blood_type` VARCHAR(5) NULL,
    `religion` VARCHAR(50) NULL,
    `last_education` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_private_profiles_employee_id_key`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_identities` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `national_id` TEXT NULL,
    `national_id_hash` VARCHAR(64) NULL,
    `family_card_number` TEXT NULL,
    `family_card_number_hash` VARCHAR(64) NULL,
    `bpjs_employment_number` TEXT NULL,
    `bpjs_employment_hash` VARCHAR(64) NULL,
    `bpjs_health_number` TEXT NULL,
    `bpjs_health_hash` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_identities_employee_id_key`(`employee_id`),
    UNIQUE INDEX `employee_identities_national_id_hash_key`(`national_id_hash`),
    UNIQUE INDEX `employee_identities_bpjs_employment_hash_key`(`bpjs_employment_hash`),
    UNIQUE INDEX `employee_identities_bpjs_health_hash_key`(`bpjs_health_hash`),
    INDEX `idx_employee_identity_family_card_hash`(`family_card_number_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_addresses` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `type` ENUM('ID_CARD', 'DOMICILE') NOT NULL,
    `address` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_addresses_employee_id_type_key`(`employee_id`, `type`),
    INDEX `idx_employee_addresses_employee`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_emergency_contacts` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `idx_employee_emergency_contacts_employee`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `bank_name` VARCHAR(191) NOT NULL,
    `account_number` TEXT NOT NULL,
    `account_number_hash` VARCHAR(64) NOT NULL,
    `account_holder_name` VARCHAR(191) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_bank_accounts_bank_name_account_number_hash_key`(`bank_name`, `account_number_hash`),
    INDEX `idx_employee_bank_accounts_employee`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_tax_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `ptkp_status` VARCHAR(10) NOT NULL,
    `effective_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employee_tax_profiles_employee_id_key`(`employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_tax_histories` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `previous_ptkp_status` VARCHAR(10) NULL,
    `ptkp_status` VARCHAR(10) NOT NULL,
    `effective_date` DATETIME(3) NOT NULL,
    `changed_by_user_id` VARCHAR(191) NULL,
    `changed_by` VARCHAR(191) NOT NULL,
    `changed_by_name` VARCHAR(191) NULL,
    `changed_by_role` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `idx_employee_tax_history_subject_effective`(`employee_id`, `effective_date`),
    INDEX `idx_employee_tax_history_actor`(`changed_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `employee_import_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `mode` VARCHAR(20) NOT NULL,
    `options_hash` VARCHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `total_rows` INTEGER NOT NULL DEFAULT 0,
    `created_rows` INTEGER NOT NULL DEFAULT 0,
    `updated_rows` INTEGER NOT NULL DEFAULT 0,
    `unchanged_rows` INTEGER NOT NULL DEFAULT 0,
    `failed_rows` INTEGER NOT NULL DEFAULT 0,
    `result_json` LONGTEXT NULL,
    `actor_user_id` VARCHAR(191) NULL,
    `actor_identifier` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    UNIQUE INDEX `employee_import_jobs_checksum_mode_options_hash_key`(`checksum`, `mode`, `options_hash`),
    INDEX `idx_employee_import_jobs_actor`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_private_profiles`
    ADD CONSTRAINT `employee_private_profiles_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_identities`
    ADD CONSTRAINT `employee_identities_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_addresses`
    ADD CONSTRAINT `employee_addresses_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_emergency_contacts`
    ADD CONSTRAINT `employee_emergency_contacts_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_bank_accounts`
    ADD CONSTRAINT `employee_bank_accounts_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_tax_profiles`
    ADD CONSTRAINT `employee_tax_profiles_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `employee_tax_histories`
    ADD CONSTRAINT `employee_tax_histories_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `employee_tax_histories_changed_by_user_id_fkey`
        FOREIGN KEY (`changed_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `employee_import_jobs`
    ADD CONSTRAINT `employee_import_jobs_actor_user_id_fkey`
        FOREIGN KEY (`actor_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

-- Upgrade existing employee document metadata. Legacy rows remain readable.
-- The IF NOT EXISTS baseline also closes an older migration-history gap where this
-- table was introduced through schema synchronization instead of a SQL migration.
CREATE TABLE IF NOT EXISTS `employee_documents` (
    `id` VARCHAR(191) NOT NULL,
    `employee_id` VARCHAR(191) NOT NULL,
    `type` ENUM('KTP', 'NPWP', 'BPJS_KES', 'BPJS_TK', 'IJAZAH', 'KARTU_KELUARGA', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `file_url` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `employee_documents_employee_id_idx`(`employee_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `employee_documents_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_documents`
    MODIFY COLUMN `type` ENUM('KTP', 'NPWP', 'BPJS_KES', 'BPJS_TK', 'IJAZAH', 'KARTU_KELUARGA', 'KONTRAK', 'OTHER') NOT NULL,
    MODIFY COLUMN `file_url` VARCHAR(500) NOT NULL,
    ADD COLUMN `original_name` VARCHAR(191) NULL,
    ADD COLUMN `mime_type` VARCHAR(150) NULL,
    ADD COLUMN `file_size` INTEGER NULL,
    ADD COLUMN `expires_at` DATETIME(3) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `uploaded_by_user_id` VARCHAR(191) NULL;

UPDATE `employee_documents`
SET
    `original_name` = COALESCE(NULLIF(`title`, ''), 'Dokumen lama'),
    `mime_type` = 'application/octet-stream',
    `file_size` = 0
WHERE `original_name` IS NULL OR `mime_type` IS NULL OR `file_size` IS NULL;

ALTER TABLE `employee_documents`
    MODIFY COLUMN `original_name` VARCHAR(191) NOT NULL,
    MODIFY COLUMN `mime_type` VARCHAR(150) NOT NULL,
    MODIFY COLUMN `file_size` INTEGER NOT NULL;

CREATE INDEX `idx_employee_documents_uploader` ON `employee_documents`(`uploaded_by_user_id`);

ALTER TABLE `employee_documents`
    ADD CONSTRAINT `employee_documents_uploaded_by_user_id_fkey`
        FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
