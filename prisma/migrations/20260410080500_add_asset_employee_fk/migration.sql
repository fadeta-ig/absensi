-- Tambah FK link Asset → Employee
ALTER TABLE `assets` ADD COLUMN `assigned_to_id` VARCHAR(191) NULL;
CREATE INDEX `assets_assigned_to_id_fkey` ON `assets`(`assigned_to_id`);
ALTER TABLE `assets` ADD CONSTRAINT `assets_assigned_to_id_fkey`
  FOREIGN KEY (`assigned_to_id`) REFERENCES `employees`(`employee_id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
