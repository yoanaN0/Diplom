<?php

declare(strict_types=1);

require_once __DIR__ . '/email_verification.php';

function password_reset_install_schema(PDO $pdo): void
{
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS user_password_reset_codes (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function password_reset_generate_code(): string
{
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function password_reset_log_fallback(string $email, string $code): void
{
    $appEnv = strtolower(email_verification_env('APP_ENV', 'production'));
    if ($appEnv !== 'development') {
        return;
    }

    $directory = __DIR__ . '/../tmp';
    if (!is_dir($directory)) {
        @mkdir($directory, 0777, true);
    }

    $line = sprintf(
        "[%s] email=%s code=%s\n",
        date('c'),
        $email,
        $code
    );

    @file_put_contents($directory . '/password_reset_outbox.log', $line, FILE_APPEND);
}

function password_reset_build_message(string $code): array
{
    $subject = 'Finly код за възстановяване на парола';
    $body = "Здравей!\n\n"
        . "Твоят код за възстановяване е: {$code}\n"
        . "Кодът е валиден 10 минути и може да се използва само веднъж.\n\n"
        . "Ако не си искал смяна на парола, игнорирай това съобщение.";

    return [$subject, $body];
}

function password_reset_send_code(string $email, string $code): array
{
    [$subject, $body] = password_reset_build_message($code);
    $transport = strtolower(email_verification_env('MAIL_TRANSPORT', 'mail'));

    if ($transport === 'smtp') {
        [$smtpSent] = email_verification_send_via_smtp($email, $subject, $body);
        if ($smtpSent) {
            return ['ok' => true];
        }

        password_reset_log_fallback($email, $code);

        return [
            'ok' => false,
            'statusCode' => 503,
            'reason' => 'sendFailed',
        ];
    }

    $sent = email_verification_send_via_mail($email, $subject, $body);
    if ($sent) {
        return ['ok' => true];
    }

    password_reset_log_fallback($email, $code);

    return [
        'ok' => false,
        'statusCode' => 503,
        'reason' => 'sendFailed',
    ];
}

function password_reset_get_hourly_limit_state(PDO $pdo, int $userId, int $maxSends = 5, int $windowSeconds = 3600): array
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS send_count,
                GREATEST(0, :window_seconds - TIMESTAMPDIFF(SECOND, MIN(created_at), NOW())) AS retry_after_seconds
         FROM user_password_reset_codes
         WHERE user_id = :user_id
           AND created_at >= DATE_SUB(NOW(), INTERVAL 60 MINUTE)'
    );
    $stmt->execute([
        'window_seconds' => $windowSeconds,
        'user_id' => $userId,
    ]);
    $row = $stmt->fetch() ?: [];

    $count = (int) ($row['send_count'] ?? 0);
    $retryAfterSeconds = (int) ($row['retry_after_seconds'] ?? 0);

    if ($count < $maxSends) {
        return [
            'isLimited' => false,
            'retryAfterSeconds' => 0,
        ];
    }

    return [
        'isLimited' => true,
        'retryAfterSeconds' => $retryAfterSeconds > 0 ? $retryAfterSeconds : 0,
    ];
}

function password_reset_get_cooldown_remaining(PDO $pdo, int $userId, int $cooldownSeconds = 60): int
{
    $stmt = $pdo->prepare(
        'SELECT GREATEST(0, :cooldown_seconds - TIMESTAMPDIFF(SECOND, created_at, NOW())) AS remaining
         FROM user_password_reset_codes
         WHERE user_id = :user_id
         ORDER BY id DESC
         LIMIT 1'
    );
    $stmt->execute([
        'cooldown_seconds' => $cooldownSeconds,
        'user_id' => $userId,
    ]);
    $row = $stmt->fetch();

    if (!$row) {
        return 0;
    }

    $remaining = (int) ($row['remaining'] ?? 0);
    return $remaining > 0 ? $remaining : 0;
}

function password_reset_issue_code(PDO $pdo, int $userId, string $email, int $ttlMinutes = 10, int $cooldownSeconds = 60): array
{
    if ($userId <= 0 || $email === '') {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    $limitState = password_reset_get_hourly_limit_state($pdo, $userId, 5, 3600);
    if (($limitState['isLimited'] ?? false) === true) {
        return [
            'ok' => false,
            'statusCode' => 429,
            'reason' => 'hourlyLimit',
            'retryAfterSeconds' => (int) ($limitState['retryAfterSeconds'] ?? 0),
        ];
    }

    $remaining = password_reset_get_cooldown_remaining($pdo, $userId, $cooldownSeconds);
    if ($remaining > 0) {
        return [
            'ok' => false,
            'statusCode' => 429,
            'reason' => 'cooldown',
            'cooldownRemaining' => $remaining,
        ];
    }

    $code = password_reset_generate_code();
    $codeHash = password_hash($code, PASSWORD_BCRYPT);
    if ($codeHash === false) {
        return ['ok' => false, 'reason' => 'hashFailed'];
    }

    $pdo->beginTransaction();

    try {
        $invalidate = $pdo->prepare(
            'UPDATE user_password_reset_codes
             SET used_at = NOW()
             WHERE user_id = :user_id AND used_at IS NULL'
        );
        $invalidate->execute(['user_id' => $userId]);

        $insert = $pdo->prepare(
            'INSERT INTO user_password_reset_codes (user_id, code_hash, attempts, expires_at, used_at)
             VALUES (:user_id, :code_hash, 0, DATE_ADD(NOW(), INTERVAL :ttl_minutes MINUTE), NULL)'
        );
        $insert->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $insert->bindValue(':code_hash', $codeHash, PDO::PARAM_STR);
        $insert->bindValue(':ttl_minutes', $ttlMinutes, PDO::PARAM_INT);
        $insert->execute();

        $pdo->commit();
    } catch (Throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        return [
            'ok' => false,
            'statusCode' => 500,
            'reason' => 'createFailed',
        ];
    }

    $sendResult = password_reset_send_code($email, $code);
    if (!($sendResult['ok'] ?? false)) {
        $invalidate = $pdo->prepare(
            'UPDATE user_password_reset_codes
             SET used_at = NOW()
             WHERE user_id = :user_id AND used_at IS NULL'
        );
        $invalidate->execute(['user_id' => $userId]);

        return [
            'ok' => false,
            'statusCode' => (int) ($sendResult['statusCode'] ?? 503),
            'reason' => (string) ($sendResult['reason'] ?? 'sendFailed'),
        ];
    }

    return ['ok' => true];
}

function password_reset_verify_code(PDO $pdo, int $userId, string $code): array
{
    $trimmedCode = trim($code);
    if ($userId <= 0 || !preg_match('/^\d{6}$/', $trimmedCode)) {
        return ['ok' => false, 'reason' => 'invalidCode'];
    }

    $stmt = $pdo->prepare(
        'SELECT id, code_hash, attempts,
            CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired
         FROM user_password_reset_codes
         WHERE user_id = :user_id
           AND used_at IS NULL
         ORDER BY id DESC
         LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId]);
    $record = $stmt->fetch();

    if (!$record) {
        return ['ok' => false, 'reason' => 'missing'];
    }

    if ((int) ($record['is_expired'] ?? 0) === 1) {
        $expire = $pdo->prepare('UPDATE user_password_reset_codes SET used_at = NOW() WHERE id = :id');
        $expire->execute(['id' => (int) $record['id']]);

        return ['ok' => false, 'reason' => 'expired'];
    }

    $attempts = (int) ($record['attempts'] ?? 0);
    if ($attempts >= 5) {
        $lock = $pdo->prepare('UPDATE user_password_reset_codes SET used_at = NOW() WHERE id = :id AND used_at IS NULL');
        $lock->execute(['id' => (int) $record['id']]);

        return ['ok' => false, 'reason' => 'attempts'];
    }

    if (!password_verify($trimmedCode, (string) $record['code_hash'])) {
        $nextAttempts = $attempts + 1;
        if ($nextAttempts >= 5) {
            $update = $pdo->prepare(
                'UPDATE user_password_reset_codes
                 SET attempts = :attempts,
                     used_at = NOW()
                 WHERE id = :id'
            );
            $update->execute([
                'attempts' => $nextAttempts,
                'id' => (int) $record['id'],
            ]);
        } else {
            $update = $pdo->prepare(
                'UPDATE user_password_reset_codes
                 SET attempts = :attempts
                 WHERE id = :id'
            );
            $update->execute([
                'attempts' => $nextAttempts,
                'id' => (int) $record['id'],
            ]);
        }

        return ['ok' => false, 'reason' => 'invalidCode'];
    }

    return ['ok' => true, 'codeId' => (int) $record['id']];
}

function password_reset_apply_new_password(PDO $pdo, int $userId, int $codeId, string $newPassword): array
{
    if ($userId <= 0 || $codeId <= 0 || $newPassword === '') {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
    if ($passwordHash === false) {
        return ['ok' => false, 'reason' => 'hashFailed'];
    }

    $pdo->beginTransaction();

    try {
        $updatePassword = $pdo->prepare(
            'UPDATE users
             SET password_hash = :password_hash,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = :user_id'
        );
        $updatePassword->execute([
            'password_hash' => $passwordHash,
            'user_id' => $userId,
        ]);

        if ($updatePassword->rowCount() <= 0) {
            throw new RuntimeException('User not found.');
        }

        $consume = $pdo->prepare(
            'UPDATE user_password_reset_codes
             SET used_at = NOW()
             WHERE id = :id
               AND user_id = :user_id
               AND used_at IS NULL'
        );
        $consume->execute([
            'id' => $codeId,
            'user_id' => $userId,
        ]);

        if ($consume->rowCount() <= 0) {
            throw new RuntimeException('Reset code already used.');
        }

        $invalidate = $pdo->prepare(
            'UPDATE user_password_reset_codes
             SET used_at = NOW()
             WHERE user_id = :user_id
               AND used_at IS NULL'
        );
        $invalidate->execute(['user_id' => $userId]);

        $pdo->commit();
    } catch (Throwable) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        return ['ok' => false, 'reason' => 'updateFailed'];
    }

    return ['ok' => true];
}