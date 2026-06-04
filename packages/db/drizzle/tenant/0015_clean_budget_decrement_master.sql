-- BUDGET_DECREMENT is a property-level event, not a master-ledger event.
-- Pre-fix worker code mistakenly attributed these rows to the master who
-- triggered them, causing them to surface in the master's wallet view.
-- Strip master_user_id from existing rows; the WAGE_CREDIT pair retains
-- the master attribution for legitimate payroll queries.
UPDATE "financial_transactions"
	SET "master_user_id" = NULL
	WHERE "type" = 'BUDGET_DECREMENT' AND "master_user_id" IS NOT NULL;
