-- AlterTable
ALTER TABLE `employees` ADD COLUMN `bypass_location` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `locations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `radius` DOUBLE NOT NULL DEFAULT 100,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `locations_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_EmployeeLocations` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_EmployeeLocations_AB_unique`(`A`, `B`),
    INDEX `_EmployeeLocations_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_EmployeeLocations` ADD CONSTRAINT `_EmployeeLocations_A_fkey` FOREIGN KEY (`A`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EmployeeLocations` ADD CONSTRAINT `_EmployeeLocations_B_fkey` FOREIGN KEY (`B`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
