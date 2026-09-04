<?php

declare(strict_types=1);

function email_verification_install_schema(PDO $pdo): void
{
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
}

function email_verification_generate_code(): string
{
    return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function email_verification_log_fallback(string $email, string $code): void
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

    @file_put_contents($directory . '/email_verification_outbox.log', $line, FILE_APPEND);
}

function email_verification_env(string $key, string $default = ''): string
{
    $value = getenv($key);
    if ($value === false) {
        return $default;
    }

    $trimmed = trim((string) $value);
    return $trimmed !== '' ? $trimmed : $default;
}

function email_verification_build_message(string $code): array
{
    $subject = 'Finly код за потвърждение';
    $body = "Здравей!\n\n" .
        "Твоят код за потвърждение е: {$code}\n" .
        "Кодът е валиден 10 минути.\n\n" .
        "Ако не си създавал профил, игнорирай това съобщение.";

    return [$subject, $body];
}

function email_verification_read_smtp_response($socket): array
{
    $response = '';

    while (!feof($socket)) {
        $line = fgets($socket, 1024);
        if ($line === false) {
            break;
        }

        $response .= $line;

        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }

    $code = 0;
    if (preg_match('/^(\d{3})/m', $response, $matches)) {
        $code = (int) $matches[1];
    }

    return [$code, trim($response)];
}

function email_verification_send_smtp_command($socket, string $command, array $expectedCodes): array
{
    if ($command !== '') {
        $written = fwrite($socket, $command . "\r\n");
        if ($written === false) {
            return [false, 'Грешка при изпращане на SMTP команда.'];
        }
    }

    [$code, $response] = email_verification_read_smtp_response($socket);
    if (!in_array($code, $expectedCodes, true)) {
        return [false, $response !== '' ? $response : 'Неочакван SMTP отговор.'];
    }

    return [true, $response];
}

function email_verification_send_via_smtp(string $toEmail, string $subject, string $body): array
{
    $host = email_verification_env('SMTP_HOST', '');
    $port = (int) email_verification_env('SMTP_PORT', '587');
    $username = email_verification_env('SMTP_USERNAME', '');
    $password = email_verification_env('SMTP_PASSWORD', '');
    $encryption = strtolower(email_verification_env('SMTP_ENCRYPTION', 'tls'));
    $fromAddress = email_verification_env('MAIL_FROM_ADDRESS', $username);
    $fromName = email_verification_env('MAIL_FROM_NAME', 'Finly');

    if ($host === '' || $fromAddress === '' || $username === '' || $password === '') {
        return [false, 'Липсва SMTP конфигурация.'];
    }

    $remoteHost = $encryption === 'ssl' ? "ssl://{$host}" : $host;
    $socket = @stream_socket_client(
        "{$remoteHost}:{$port}",
        $errorCode,
        $errorMessage,
        20,
        STREAM_CLIENT_CONNECT
    );

    if (!is_resource($socket)) {
        return [false, "SMTP връзката е неуспешна: {$errorCode} {$errorMessage}"];
    }

    stream_set_timeout($socket, 20);

    [$okGreeting, $greeting] = email_verification_send_smtp_command($socket, '', [220]);
    if (!$okGreeting) {
        fclose($socket);
        return [false, $greeting];
    }

    [$okEhlo] = email_verification_send_smtp_command($socket, 'EHLO localhost', [250]);
    if (!$okEhlo) {
        fclose($socket);
        return [false, 'SMTP EHLO неуспешно.'];
    }

    if ($encryption === 'tls') {
        [$okStartTls, $startTlsResponse] = email_verification_send_smtp_command($socket, 'STARTTLS', [220]);
        if (!$okStartTls) {
            fclose($socket);
            return [false, $startTlsResponse];
        }

        $cryptoEnabled = @stream_socket_enable_crypto(
            $socket,
            true,
            STREAM_CRYPTO_METHOD_TLS_CLIENT
        );
        if ($cryptoEnabled !== true) {
            fclose($socket);
            return [false, 'Неуспешно TLS криптиране на SMTP връзката.'];
        }

        [$okEhloAfterTls] = email_verification_send_smtp_command($socket, 'EHLO localhost', [250]);
        if (!$okEhloAfterTls) {
            fclose($socket);
            return [false, 'SMTP EHLO след STARTTLS е неуспешно.'];
        }
    }

    [$okAuth] = email_verification_send_smtp_command($socket, 'AUTH LOGIN', [334]);
    if (!$okAuth) {
        fclose($socket);
        return [false, 'SMTP AUTH LOGIN не е приет.'];
    }

    [$okUser] = email_verification_send_smtp_command($socket, base64_encode($username), [334]);
    if (!$okUser) {
        fclose($socket);
        return [false, 'SMTP потребителят не е приет.'];
    }

    [$okPass] = email_verification_send_smtp_command($socket, base64_encode($password), [235]);
    if (!$okPass) {
        fclose($socket);
        return [false, 'SMTP паролата не е приета.'];
    }

    [$okMailFrom] = email_verification_send_smtp_command($socket, 'MAIL FROM:<' . $fromAddress . '>', [250]);
    if (!$okMailFrom) {
        fclose($socket);
        return [false, 'MAIL FROM не е приет.'];
    }

    [$okRecipient] = email_verification_send_smtp_command($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
    if (!$okRecipient) {
        fclose($socket);
        return [false, 'RCPT TO не е приет.'];
    }

    [$okData] = email_verification_send_smtp_command($socket, 'DATA', [354]);
    if (!$okData) {
        fclose($socket);
        return [false, 'SMTP DATA не е приета.'];
    }

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $safeBody = str_replace(["\r\n", "\r"], "\n", $body);
    $safeBody = str_replace("\n.", "\n..", $safeBody);
    $headers = [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . $fromName . ' <' . $fromAddress . '>',
        'To: <' . $toEmail . '>',
        'Subject: ' . $encodedSubject,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];

    $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $safeBody) . "\r\n.\r\n";
    if (fwrite($socket, $message) === false) {
        fclose($socket);
        return [false, 'Грешка при изпращане на SMTP съобщението.'];
    }

    [$okQueued, $queuedResponse] = email_verification_send_smtp_command($socket, '', [250]);
    email_verification_send_smtp_command($socket, 'QUIT', [221]);
    fclose($socket);

    if (!$okQueued) {
        return [false, $queuedResponse];
    }

    return [true, 'ok'];
}

function email_verification_send_via_mail(string $toEmail, string $subject, string $body): bool
{
    $fromAddress = email_verification_env('MAIL_FROM_ADDRESS', 'no-reply@finly.local');
    $fromName = email_verification_env('MAIL_FROM_NAME', 'Finly');
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'From: ' . $fromName . ' <' . $fromAddress . '>',
    ];

    return @mail($toEmail, $subject, $body, implode("\r\n", $headers));
}

function email_verification_send_code(string $email, string $code): array
{
    [$subject, $body] = email_verification_build_message($code);
    $transport = strtolower(email_verification_env('MAIL_TRANSPORT', 'mail'));

    if ($transport === 'smtp') {
        [$smtpSent] = email_verification_send_via_smtp($email, $subject, $body);
        if ($smtpSent) {
            return ['ok' => true];
        }

        email_verification_log_fallback($email, $code);

        return [
            'ok' => false,
            'statusCode' => 503,
            'reason' => 'sendFailed',
            'error' => 'Кодът не можа да бъде изпратен. Опитай отново след няколко минути.',
        ];
    }

    $sent = email_verification_send_via_mail($email, $subject, $body);
    if ($sent) {
        return ['ok' => true];
    }

    email_verification_log_fallback($email, $code);

    return [
        'ok' => false,
        'statusCode' => 503,
        'reason' => 'sendFailed',
        'error' => 'Кодът не можа да бъде изпратен. Опитай отново след няколко минути.',
    ];
}

function email_verification_get_hourly_limit_state(PDO $pdo, int $userId, int $maxSends = 5, int $windowSeconds = 3600): array
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS send_count,
                GREATEST(0, :window_seconds - TIMESTAMPDIFF(SECOND, MIN(created_at), NOW())) AS retry_after_seconds
         FROM user_email_verification_codes
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

function email_verification_get_cooldown_remaining(PDO $pdo, int $userId, int $cooldownSeconds = 60): int
{
    $stmt = $pdo->prepare(
        'SELECT GREATEST(0, :cooldown_seconds - TIMESTAMPDIFF(SECOND, created_at, NOW())) AS remaining
         FROM user_email_verification_codes
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

function email_verification_issue_code(PDO $pdo, int $userId, string $email, int $ttlMinutes = 10, int $cooldownSeconds = 60): array
{
    if ($userId <= 0 || $email === '') {
        return ['ok' => false, 'error' => 'Невалидни данни за верификация.'];
    }

    $limitState = email_verification_get_hourly_limit_state($pdo, $userId, 5, 3600);
    if (($limitState['isLimited'] ?? false) === true) {
        return [
            'ok' => false,
            'statusCode' => 429,
            'reason' => 'hourlyLimit',
            'retryAfterSeconds' => (int) ($limitState['retryAfterSeconds'] ?? 0),
            'error' => 'Достигнат е максималният брой изпращания. Опитай отново по-късно.',
        ];
    }

    $remaining = email_verification_get_cooldown_remaining($pdo, $userId, $cooldownSeconds);
    if ($remaining > 0) {
        return [
            'ok' => false,
            'statusCode' => 429,
            'reason' => 'cooldown',
            'error' => 'Изчакай преди да поискаш нов код.',
            'cooldownRemaining' => $remaining,
        ];
    }

    $code = email_verification_generate_code();
    $codeHash = password_hash($code, PASSWORD_BCRYPT);
    if ($codeHash === false) {
        return ['ok' => false, 'error' => 'Неуспешно генериране на код.'];
    }

    $expiresAt = date('Y-m-d H:i:s', time() + ($ttlMinutes * 60));

    $pdo->beginTransaction();

    try {
        $invalidate = $pdo->prepare(
            'UPDATE user_email_verification_codes
             SET used_at = NOW()
             WHERE user_id = :user_id AND used_at IS NULL'
        );
        $invalidate->execute(['user_id' => $userId]);

        $insert = $pdo->prepare(
            'INSERT INTO user_email_verification_codes (user_id, code_hash, attempts, expires_at, used_at)
               VALUES (:user_id, :code_hash, 0, :expires_at, NULL)'
        );
        $insert->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $insert->bindValue(':code_hash', $codeHash, PDO::PARAM_STR);
          $insert->bindValue(':expires_at', $expiresAt, PDO::PARAM_STR);
        $insert->execute();

        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        return [
            'ok' => false,
            'statusCode' => 500,
            'reason' => 'createFailed',
            'error' => 'Неуспешно създаване на код за потвърждение.',
        ];
    }

    $sendResult = email_verification_send_code($email, $code);
    if (!($sendResult['ok'] ?? false)) {
        $invalidate = $pdo->prepare(
            'UPDATE user_email_verification_codes
             SET used_at = NOW()
             WHERE user_id = :user_id AND used_at IS NULL'
        );
        $invalidate->execute(['user_id' => $userId]);

        return [
            'ok' => false,
            'statusCode' => (int) ($sendResult['statusCode'] ?? 503),
            'reason' => (string) ($sendResult['reason'] ?? 'sendFailed'),
            'error' => (string) ($sendResult['error'] ?? 'Кодът не можа да бъде изпратен. Опитай отново след няколко минути.'),
        ];
    }

    return ['ok' => true];
}

function email_verification_verify_code(PDO $pdo, int $userId, string $code): array
{
    $trimmedCode = trim($code);
    if ($userId <= 0 || $trimmedCode === '') {
        return ['ok' => false, 'error' => 'Невалиден код.'];
    }

    $stmt = $pdo->prepare(
        'SELECT id, code_hash, attempts, expires_at,
            CASE WHEN expires_at <= NOW() THEN 1 ELSE 0 END AS is_expired
         FROM user_email_verification_codes
         WHERE user_id = :user_id
           AND used_at IS NULL
         ORDER BY id DESC
         LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId]);
    $record = $stmt->fetch();

    if (!$record) {
        return ['ok' => false, 'error' => 'Няма активен код. Поискай нов.'];
    }

    $isExpired = (int) ($record['is_expired'] ?? 0) === 1;
    if ($isExpired) {
        $expire = $pdo->prepare(
            'UPDATE user_email_verification_codes SET used_at = NOW() WHERE id = :id'
        );
        $expire->execute(['id' => (int) $record['id']]);

        return ['ok' => false, 'error' => 'Кодът е изтекъл. Поискай нов.'];
    }

    $attempts = (int) ($record['attempts'] ?? 0);
    if ($attempts >= 5) {
        return ['ok' => false, 'error' => 'Прекалено много грешни опити. Поискай нов код.'];
    }

    $isValid = password_verify($trimmedCode, (string) $record['code_hash']);
    if (!$isValid) {
        $nextAttempts = $attempts + 1;
        if ($nextAttempts >= 5) {
            $update = $pdo->prepare(
                'UPDATE user_email_verification_codes
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
                'UPDATE user_email_verification_codes
                 SET attempts = :attempts
                 WHERE id = :id'
            );
            $update->execute([
                'attempts' => $nextAttempts,
                'id' => (int) $record['id'],
            ]);
        }

        return ['ok' => false, 'error' => 'Невалиден код.'];
    }

    $consume = $pdo->prepare('UPDATE user_email_verification_codes SET used_at = NOW() WHERE id = :id');
    $consume->execute(['id' => (int) $record['id']]);

    return ['ok' => true];
}

function email_verification_mark_user_verified(PDO $pdo, int $userId): void
{
    $stmt = $pdo->prepare(
        'UPDATE user_admin_meta
         SET is_verified = 1
         WHERE user_id = :user_id'
    );
    $stmt->execute(['user_id' => $userId]);
}
