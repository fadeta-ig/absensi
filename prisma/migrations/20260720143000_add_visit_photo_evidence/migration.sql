-- CreateTable
CREATE TABLE `visit_photos` (
    `id` VARCHAR(191) NOT NULL,
    `visit_id` VARCHAR(191) NOT NULL,
    `phase` VARCHAR(20) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `category` VARCHAR(32) NOT NULL DEFAULT 'LAINNYA',
    `caption` VARCHAR(200) NULL,
    `original_path` VARCHAR(500) NOT NULL,
    `stamped_path` VARCHAR(500) NOT NULL,
    `captured_at_device` DATETIME(3) NULL,
    `received_at_server` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `official_timestamp` DATETIME(3) NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `accuracy_meters` DOUBLE NULL,
    `distance_to_target_meters` DOUBLE NULL,
    `sha256_original` CHAR(64) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `overlay_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `visit_photos_visit_phase_sequence_key`(`visit_id`, `phase`, `sequence`),
    INDEX `idx_visit_photos_visit_phase`(`visit_id`, `phase`),
    INDEX `idx_visit_photos_sha256`(`sha256_original`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `visit_photos`
    ADD CONSTRAINT `visit_photos_visit_id_fkey`
    FOREIGN KEY (`visit_id`) REFERENCES `visit_reports`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
