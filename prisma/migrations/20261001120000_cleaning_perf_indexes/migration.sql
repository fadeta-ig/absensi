-- AddIndex (optimasi audit inspeksi: range bulan + assignment + reviewer + audit)
CREATE INDEX `idx_cleaning_checklist_wib_date` ON `cleaning_daily_checklists`(`wib_date`);
CREATE INDEX `idx_cleaning_assignment_user_period` ON `cleaning_worker_assignments`(`user_id`, `starts_on_wib_date`, `ends_on_wib_date`);
CREATE INDEX `idx_cleaning_assignment_room_period` ON `cleaning_worker_assignments`(`room_id`, `starts_on_wib_date`, `ends_on_wib_date`);
CREATE INDEX `idx_cleaning_approval_inspected_month` ON `cleaning_monthly_approvals`(`inspected_by_employee_id`, `month_wib`);
CREATE INDEX `idx_cleaning_approval_known_month` ON `cleaning_monthly_approvals`(`known_by_employee_id`, `month_wib`);
CREATE INDEX `idx_cleaning_paraf_signer_date` ON `cleaning_daily_parafs`(`signer_employee_id`, `wib_date`);
CREATE INDEX `idx_audit_logs_action_created` ON `audit_logs`(`action`, `created_at`);
CREATE INDEX `idx_audit_logs_entity_created` ON `audit_logs`(`entity`, `created_at`);
