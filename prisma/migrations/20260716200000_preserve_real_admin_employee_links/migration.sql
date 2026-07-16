-- Preserve optional employee links for any pre-existing HR/GA account that was
-- not one of the two legacy admin-only placeholders removed by the prior migration.
UPDATE `user_accounts` u
JOIN `employees` e ON e.`employee_id` = u.`username`
SET u.`employee_id` = e.`employee_id`
WHERE u.`employee_id` IS NULL
  AND u.`username` NOT IN ('WIG001', 'WIG002');
