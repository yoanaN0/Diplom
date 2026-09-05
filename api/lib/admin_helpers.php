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
        "CREATE TABLE IF NOT EXISTS user_email_verification_codes (
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

function admin_csrf_token(): string
{
    $token = (string) ($_SESSION['admin_csrf_token'] ?? '');

    if ($token === '') {
        $token = bin2hex(random_bytes(32));
        $_SESSION['admin_csrf_token'] = $token;
    }

    return $token;
}

function admin_require_csrf(): void
{
    $expectedToken = admin_csrf_token();
    $providedToken = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));

    if ($providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
        json_response(403, ['ok' => false, 'error' => 'Невалиден CSRF token.']);
    }
}

function requireAdmin(PDO $pdo): int
{
    $userId = api_user_id();

    $stmt = $pdo->prepare(
        'SELECT u.id,
                COALESCE(m.role, "user") AS role,
                COALESCE(m.profile_status, "active") AS profile_status
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE u.id = :user_id
         LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId]);
    $meta = $stmt->fetch();

    if (!$meta) {
        json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
    }

    $profileStatus = strtolower((string) ($meta['profile_status'] ?? 'active'));
    if (in_array($profileStatus, ['blocked', 'deleted'], true)) {
        session_unset();
        session_destroy();
        json_response(401, ['ok' => false, 'error' => 'Профилът е ограничен. Свържи се с администратор.']);
    }

    if (strtolower((string) ($meta['role'] ?? 'user')) !== 'admin') {
        json_response(403, ['ok' => false, 'error' => 'Недостатъчни права.']);
    }

    return $userId;
}

function admin_require_admin(PDO $pdo, ?int $userId = null): void
{
    requireAdmin($pdo);
}
