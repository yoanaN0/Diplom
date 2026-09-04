USE finly;

UPDATE transactions
SET source_reference = NULL
WHERE source_reference IS NOT NULL AND TRIM(source_reference) = '';

SET @uniq_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'transactions'
      AND index_name = 'uniq_transactions_user_wallet_source_reference'
);

SET @add_index_sql := IF(
    @uniq_exists = 0,
    'ALTER TABLE transactions ADD UNIQUE KEY uniq_transactions_user_wallet_source_reference (user_id, wallet_id, source_reference)',
    'SELECT 1'
);

PREPARE add_index_stmt FROM @add_index_sql;
EXECUTE add_index_stmt;
DEALLOCATE PREPARE add_index_stmt;
