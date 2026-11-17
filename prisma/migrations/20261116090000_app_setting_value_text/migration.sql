-- app_settings.value menyimpan konfigurasi JSON (mis. greeting.copy) yang
-- dapat melebihi VARCHAR(191). Kolom sudah TEXT pada migrasi awal; pernyataan
-- ini menjaga tipe tersebut tetap TEXT bila `prisma db push` pernah
-- menyempitkannya.
ALTER TABLE `app_settings` MODIFY `value` TEXT NOT NULL;
