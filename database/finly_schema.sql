CREATE DATABASE IF NOT EXISTS finly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finly;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INT UNSIGNED NOT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    birth_date DATE DEFAULT NULL,
    city VARCHAR(120) DEFAULT NULL,
    country VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_profiles_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_admin_meta (
    user_id INT UNSIGNED NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    profile_status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    KEY idx_user_admin_meta_role_status (role, profile_status),
    CONSTRAINT fk_user_admin_meta_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_login_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    ip_address VARCHAR(64) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,
    is_success TINYINT(1) NOT NULL DEFAULT 0,
    login_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_user_login_logs_user_date (user_id, login_at),
    CONSTRAINT fk_user_login_logs_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_email_verification_codes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user_email_verification_codes_user_created (user_id, created_at),
    CONSTRAINT fk_user_email_verification_codes_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_password_reset_codes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_user_password_reset_codes_user_created (user_id, created_at),
    CONSTRAINT fk_user_password_reset_codes_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    wallet_type VARCHAR(16) NOT NULL,
    name VARCHAR(120) NOT NULL,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    bank_name VARCHAR(120) DEFAULT NULL,
    account_mask VARCHAR(64) DEFAULT NULL,
    sync_status VARCHAR(32) DEFAULT NULL,
    last_sync_at DATETIME DEFAULT NULL,
    reconnect_in_days INT UNSIGNED DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_wallets_user_type (user_id, wallet_type),
    CONSTRAINT fk_wallets_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    category_type VARCHAR(20) NOT NULL DEFAULT 'expense',
    is_builtin TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_categories_user_name_type (user_id, name, category_type),
    KEY idx_categories_user_type (user_id, category_type),
    CONSTRAINT fk_categories_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budgets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED DEFAULT NULL,
    category_name VARCHAR(120) NOT NULL,
    period VARCHAR(16) NOT NULL DEFAULT 'monthly',
    limit_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    spent_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_fixed TINYINT(1) NOT NULL DEFAULT 0,
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_budgets_user_period (user_id, period),
    KEY idx_budgets_category (category_id),
    CONSTRAINT fk_budgets_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_budgets_category
        FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goals (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    target_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    saved_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    deadline DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    funding_wallets JSON NULL DEFAULT NULL,
    funding_sources JSON NULL DEFAULT NULL,
    spent_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_goals_user_deadline (user_id, deadline),
    CONSTRAINT fk_goals_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transactions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    wallet_id INT UNSIGNED DEFAULT NULL,
    category_id INT UNSIGNED DEFAULT NULL,
    goal_id INT UNSIGNED DEFAULT NULL,
    source_goal_id INT UNSIGNED DEFAULT NULL,
    type VARCHAR(16) NOT NULL,
    title VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    wallet_label VARCHAR(120) NOT NULL,
    category_label VARCHAR(120) NOT NULL,
    note TEXT DEFAULT NULL,
    tags_text VARCHAR(1000) DEFAULT NULL,
    receipt_raw_text MEDIUMTEXT DEFAULT NULL,
    transaction_date DATETIME NOT NULL,
    source_reference VARCHAR(64) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_transactions_user_date (user_id, transaction_date),
    KEY idx_transactions_wallet (wallet_id),
    KEY idx_transactions_category (category_id),
    KEY idx_transactions_goal (goal_id),
    KEY idx_transactions_source_goal (source_goal_id),
    UNIQUE KEY uniq_transactions_user_wallet_source_reference (user_id, wallet_id, source_reference),
    CONSTRAINT fk_transactions_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_transactions_wallet
        FOREIGN KEY (wallet_id) REFERENCES wallets (id)
        ON DELETE SET NULL,
    CONSTRAINT fk_transactions_category
        FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE SET NULL,
    CONSTRAINT fk_transactions_goal
        FOREIGN KEY (goal_id) REFERENCES goals (id)
        ON DELETE SET NULL,
    CONSTRAINT fk_transactions_source_goal
        FOREIGN KEY (source_goal_id) REFERENCES goals (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS receipts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    transaction_id INT UNSIGNED DEFAULT NULL,
    merchant_name VARCHAR(255) DEFAULT NULL,
    receipt_total DECIMAL(12,2) DEFAULT NULL,
    receipt_date DATETIME DEFAULT NULL,
    image_path VARCHAR(500) DEFAULT NULL,
    raw_text MEDIUMTEXT DEFAULT NULL,
    parsed_products LONGTEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_receipts_user_date (user_id, receipt_date),
    KEY idx_receipts_transaction (transaction_id),
    CONSTRAINT fk_receipts_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_receipts_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goal_movements (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    goal_id INT UNSIGNED NOT NULL,
    source_wallet_id INT UNSIGNED DEFAULT NULL,
    from_goal_id INT UNSIGNED DEFAULT NULL,
    movement_type VARCHAR(24) NOT NULL,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    note TEXT DEFAULT NULL,
    transaction_id INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_goal_movements_user_goal (user_id, goal_id),
    KEY idx_goal_movements_wallet (source_wallet_id),
    KEY idx_goal_movements_from_goal (from_goal_id),
    KEY idx_goal_movements_transaction (transaction_id),
    CONSTRAINT fk_goal_movements_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_goal_movements_goal
        FOREIGN KEY (goal_id) REFERENCES goals (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_goal_movements_wallet
        FOREIGN KEY (source_wallet_id) REFERENCES wallets (id)
        ON DELETE SET NULL,
    CONSTRAINT fk_goal_movements_from_goal
        FOREIGN KEY (from_goal_id) REFERENCES goals (id)
        ON DELETE SET NULL,
    CONSTRAINT fk_goal_movements_transaction
        FOREIGN KEY (transaction_id) REFERENCES transactions (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'new',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_contact_messages_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS financial_twin_scenarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(120) DEFAULT NULL,
    horizon_months INT UNSIGNED NOT NULL DEFAULT 12,
    modifiers_text LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_financial_twin_scenarios_user (user_id),
    CONSTRAINT fk_financial_twin_scenarios_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
