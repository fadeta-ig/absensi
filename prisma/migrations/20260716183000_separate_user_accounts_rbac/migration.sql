-- Separate authentication identities from employee business profiles.
-- This migration is additive until all actor references have been moved,
-- then removes the legacy authentication columns and the two admin-only
-- placeholder employee records.

CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `permissions` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `display_name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `session_version` INTEGER NOT NULL DEFAULT 0,
    `employee_id` VARCHAR(191) NULL,
    `last_login_at` DATETIME(3) NULL,
    `password_changed_at` DATETIME(3) NULL,
    `created_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `user_accounts_username_key`(`username`),
    UNIQUE INDEX `user_accounts_email_key`(`email`),
    UNIQUE INDEX `user_accounts_employee_id_key`(`employee_id`),
    INDEX `idx_user_accounts_created_by`(`created_by_user_id`),
    INDEX `idx_user_accounts_is_active`(`is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_role_assignments` (
    `user_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `assigned_by_user_id` VARCHAR(191) NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `idx_user_roles_role`(`role_id`),
    INDEX `idx_user_roles_assigned_by`(`assigned_by_user_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `role_permissions` (
    `role_id` VARCHAR(191) NOT NULL,
    `permission_id` VARCHAR(191) NOT NULL,
    INDEX `idx_role_permissions_permission`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_accounts`
    ADD CONSTRAINT `user_accounts_employee_id_fkey`
        FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `user_accounts_created_by_user_id_fkey`
        FOREIGN KEY (`created_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `user_role_assignments`
    ADD CONSTRAINT `user_role_assignments_user_id_fkey`
        FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `user_role_assignments_role_id_fkey`
        FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `user_role_assignments_assigned_by_user_id_fkey`
        FOREIGN KEY (`assigned_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `role_permissions`
    ADD CONSTRAINT `role_permissions_role_id_fkey`
        FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `role_permissions_permission_id_fkey`
        FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `roles` (`id`, `code`, `name`, `description`, `is_system`, `created_at`, `updated_at`) VALUES
    ('role-super-admin', 'SUPER_ADMIN', 'Super Admin', 'Akses penuh platform dan pengelolaan user.', true, NOW(3), NOW(3)),
    ('role-hr-admin', 'HR_ADMIN', 'HR Admin', 'Administrasi HR tanpa pengelolaan user sistem.', true, NOW(3), NOW(3)),
    ('role-ga-admin', 'GA_ADMIN', 'GA Admin', 'Administrasi General Affairs.', true, NOW(3), NOW(3)),
    ('role-employee-user', 'EMPLOYEE_USER', 'Employee User', 'Akses portal mandiri karyawan.', true, NOW(3), NOW(3));

INSERT INTO `permissions` (`id`, `code`, `name`, `description`, `created_at`) VALUES
    ('perm-user-manage', 'user.manage', 'Kelola User', 'Membuat, mengubah role, menonaktifkan, dan mencabut sesi user.', NOW(3)),
    ('perm-hr-manage', 'hr.manage', 'Kelola HR', 'Akses penuh modul Human Resources.', NOW(3)),
    ('perm-ga-manage', 'ga.manage', 'Kelola GA', 'Akses penuh modul General Affairs.', NOW(3)),
    ('perm-employee-self', 'employee.self', 'Portal Karyawan', 'Akses data mandiri karyawan yang tertaut.', NOW(3)),
    ('perm-asset-read', 'asset.read', 'Baca Aset', 'Akses baca data aset perusahaan sesuai lingkup.', NOW(3));

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 'role-super-admin', `id` FROM `permissions`;

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES
    ('role-hr-admin', 'perm-hr-manage'),
    ('role-hr-admin', 'perm-employee-self'),
    ('role-hr-admin', 'perm-asset-read'),
    ('role-ga-admin', 'perm-ga-manage'),
    ('role-ga-admin', 'perm-employee-self'),
    ('role-ga-admin', 'perm-asset-read'),
    ('role-employee-user', 'perm-employee-self');

-- Preserve every existing password hash and session version. Admin-only users
-- intentionally have no employee link; real employee accounts retain a 1:1 link.
INSERT INTO `user_accounts` (
    `id`, `username`, `display_name`, `email`, `password_hash`, `is_active`,
    `session_version`, `employee_id`, `created_at`, `updated_at`
)
SELECT
    UUID(), e.`employee_id`, e.`name`, e.`email`, e.`password`, e.`is_active`,
    e.`session_version`, CASE WHEN e.`role` = 'employee' THEN e.`employee_id` ELSE NULL END,
    NOW(3), NOW(3)
FROM `employees` e;

INSERT INTO `user_role_assignments` (`user_id`, `role_id`, `assigned_at`)
SELECT
    u.`id`,
    CASE e.`role`
        WHEN 'hr' THEN 'role-super-admin'
        WHEN 'ga' THEN 'role-ga-admin'
        ELSE 'role-employee-user'
    END,
    NOW(3)
FROM `user_accounts` u
JOIN `employees` e ON e.`employee_id` = u.`username`;

-- Move audit actors away from Employee before removing admin placeholders.
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_performed_by_fkey`;
DROP INDEX `idx_audit_logs_performed_by` ON `audit_logs`;
ALTER TABLE `audit_logs`
    ADD COLUMN `actor_type` VARCHAR(191) NOT NULL DEFAULT 'USER',
    ADD COLUMN `actor_user_id` VARCHAR(191) NULL,
    ADD COLUMN `actor_name` VARCHAR(191) NULL,
    ADD COLUMN `actor_role` VARCHAR(191) NULL;

UPDATE `audit_logs` a
LEFT JOIN `user_accounts` u ON u.`username` = a.`performed_by`
LEFT JOIN `user_role_assignments` ura ON ura.`user_id` = u.`id`
LEFT JOIN `roles` r ON r.`id` = ura.`role_id`
SET
    a.`actor_type` = CASE WHEN a.`performed_by` LIKE 'SYSTEM%' THEN 'SYSTEM' ELSE 'USER' END,
    a.`actor_user_id` = u.`id`,
    a.`actor_name` = u.`display_name`,
    a.`actor_role` = r.`code`;

CREATE INDEX `idx_audit_logs_actor_user` ON `audit_logs`(`actor_user_id`);
CREATE INDEX `idx_audit_logs_actor_identifier` ON `audit_logs`(`performed_by`);
ALTER TABLE `audit_logs`
    ADD CONSTRAINT `audit_logs_actor_user_id_fkey`
        FOREIGN KEY (`actor_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `employee_status_histories`
    DROP FOREIGN KEY `employee_status_histories_changed_by_fkey`;
DROP INDEX `idx_employee_status_history_actor` ON `employee_status_histories`;
ALTER TABLE `employee_status_histories`
    ADD COLUMN `changed_by_user_id` VARCHAR(191) NULL,
    ADD COLUMN `changed_by_name` VARCHAR(191) NULL,
    ADD COLUMN `changed_by_role` VARCHAR(191) NULL;

UPDATE `employee_status_histories` h
LEFT JOIN `user_accounts` u ON u.`username` = h.`changed_by`
LEFT JOIN `user_role_assignments` ura ON ura.`user_id` = u.`id`
LEFT JOIN `roles` r ON r.`id` = ura.`role_id`
SET
    h.`changed_by_user_id` = u.`id`,
    h.`changed_by_name` = u.`display_name`,
    h.`changed_by_role` = r.`code`;

CREATE INDEX `idx_employee_status_history_actor` ON `employee_status_histories`(`changed_by_user_id`);
ALTER TABLE `employee_status_histories`
    ADD CONSTRAINT `employee_status_histories_changed_by_user_id_fkey`
        FOREIGN KEY (`changed_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

-- Push delivery credentials belong to the authenticated user, not the employee profile.
ALTER TABLE `push_subscriptions` ADD COLUMN `user_id` VARCHAR(191) NULL;
UPDATE `push_subscriptions` p
JOIN `user_accounts` u ON u.`username` = p.`employee_id`
SET p.`user_id` = u.`id`;
ALTER TABLE `push_subscriptions` MODIFY `user_id` VARCHAR(191) NOT NULL;
ALTER TABLE `push_subscriptions` DROP FOREIGN KEY `push_subscriptions_employee_id_fkey`;
DROP INDEX `push_subscriptions_employee_id_fkey` ON `push_subscriptions`;
ALTER TABLE `push_subscriptions` DROP COLUMN `employee_id`;
CREATE INDEX `push_subscriptions_user_id_fkey` ON `push_subscriptions`(`user_id`);
ALTER TABLE `push_subscriptions`
    ADD CONSTRAINT `push_subscriptions_user_id_fkey`
        FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve human-readable actor identifiers while adding stable user relations.
ALTER TABLE `asset_histories` ADD COLUMN `performed_by_user_id` VARCHAR(191) NULL;
UPDATE `asset_histories` h
LEFT JOIN `user_accounts` u ON u.`username` = h.`performed_by`
SET h.`performed_by_user_id` = u.`id`;
CREATE INDEX `idx_asset_histories_actor` ON `asset_histories`(`performed_by_user_id`);
ALTER TABLE `asset_histories`
    ADD CONSTRAINT `asset_histories_performed_by_user_id_fkey`
        FOREIGN KEY (`performed_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `asset_bast_documents` ADD COLUMN `uploaded_by_user_id` VARCHAR(191) NULL;
UPDATE `asset_bast_documents` d
LEFT JOIN `user_accounts` u ON u.`username` = d.`uploaded_by`
SET d.`uploaded_by_user_id` = u.`id`;
CREATE INDEX `idx_bast_documents_actor` ON `asset_bast_documents`(`uploaded_by_user_id`);
ALTER TABLE `asset_bast_documents`
    ADD CONSTRAINT `asset_bast_documents_uploaded_by_user_id_fkey`
        FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `asset_inspections` ADD COLUMN `performed_by_user_id` VARCHAR(191) NULL;
UPDATE `asset_inspections` i
LEFT JOIN `user_accounts` u ON u.`username` = i.`performed_by`
SET i.`performed_by_user_id` = u.`id`;
CREATE INDEX `idx_asset_inspections_actor` ON `asset_inspections`(`performed_by_user_id`);
ALTER TABLE `asset_inspections`
    ADD CONSTRAINT `asset_inspections_performed_by_user_id_fkey`
        FOREIGN KEY (`performed_by_user_id`) REFERENCES `user_accounts`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;

-- The two seeded admin placeholders have no employee business relations. Their
-- identities and audit history now live in user_accounts.
DELETE FROM `employees`
WHERE `employee_id` IN ('WIG001', 'WIG002') AND `role` IN ('hr', 'ga');

ALTER TABLE `employees`
    DROP COLUMN `role`,
    DROP COLUMN `password`,
    DROP COLUMN `session_version`;
