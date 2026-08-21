<?php

declare(strict_types=1);

function admin_install_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS user_admin_meta (
            user_id INT UNSIGNED NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            profile_status VARCHAR(20) NOT NULL DEFAULT 'active',
            is_verified TINYINT(1) NOT NULL DEFAULT 0,
            last_login_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id),
            CONSTRAINT fk_user_admin_meta_user
                FOREIGN KEY (user_id) REFERENCES users (id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS user_login_logs (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "INSERT INTO user_admin_meta (user_id, role, profile_status, is_verified)
         SELECT u.id,
                CASE WHEN u.id = 1 THEN 'admin' ELSE 'user' END,
                'active',
                0
         FROM users u
         ON DUPLICATE KEY UPDATE
            role = COALESCE(role, VALUES(role)),
            profile_status = CASE
                WHEN profile_status IN ('active', 'blocked', 'deleted') THEN profile_status
                ELSE VALUES(profile_status)
            END,
            is_verified = COALESCE(is_verified, VALUES(is_verified))"
    );
}

function admin_ensure_user_meta(PDO $pdo, int $userId): void
{
    if ($userId <= 0) {
        return;
    }

    $stmt = $pdo->prepare(
        "INSERT INTO user_admin_meta (user_id, role, profile_status, is_verified)
         VALUES (:user_id, :role, 'active', 0)
         ON DUPLICATE KEY UPDATE
            role = COALESCE(role, VALUES(role)),
            profile_status = CASE
                WHEN profile_status IN ('active', 'blocked', 'deleted') THEN profile_status
                ELSE VALUES(profile_status)
            END,
            is_verified = COALESCE(is_verified, VALUES(is_verified))"
    );
    $stmt->execute([
        'user_id' => $userId,
        'role' => $userId === 1 ? 'admin' : 'user',
    ]);
}

function admin_get_user_meta(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT role, profile_status, is_verified, last_login_at
         FROM user_admin_meta
         WHERE user_id = :user_id
         LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId]);

    $meta = $stmt->fetch();
    if (!$meta) {
        return null;
    }

    return [
        'role' => (string) ($meta['role'] ?? 'user'),
        'profileStatus' => (string) ($meta['profile_status'] ?? 'active'),
        'isVerified' => (bool) ($meta['is_verified'] ?? false),
        'lastLoginAt' => isset($meta['last_login_at']) && $meta['last_login_at'] !== null
            ? str_replace(' ', 'T', (string) $meta['last_login_at'])
            : null,
    ];
}

function admin_track_login(PDO $pdo, ?int $userId, ?string $email, bool $isSuccess): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO user_login_logs (user_id, email, ip_address, user_agent, is_success, login_at)
         VALUES (:user_id, :email, :ip_address, :user_agent, :is_success, NOW())'
    );
    $stmt->execute([
        'user_id' => $userId,
        'email' => $email,
        'ip_address' => substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64),
        'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        'is_success' => $isSuccess ? 1 : 0,
    ]);

    if ($isSuccess && $userId !== null) {
        $update = $pdo->prepare(
            'UPDATE user_admin_meta SET last_login_at = NOW() WHERE user_id = :user_id'
        );
        $update->execute(['user_id' => $userId]);
    }
}

function admin_require_admin(PDO $pdo, int $userId): void
{
    $meta = admin_get_user_meta($pdo, $userId);

    if (!$meta || $meta['role'] !== 'admin' || $meta['profileStatus'] !== 'active') {
        json_response(403, ['ok' => false, 'error' => 'Недостатъчни права.']);
    }
}
