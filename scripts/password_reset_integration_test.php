<?php

declare(strict_types=1);

require __DIR__ . '/../api/lib/db.php';
require __DIR__ . '/../api/lib/password_reset.php';

function fail(string $message): void
{
    throw new RuntimeException($message);
}

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fail($message);
    }
}

function assert_int_equals(int $expected, int $actual, string $message): void
{
    if ($expected !== $actual) {
        fail($message . ' (expected ' . $expected . ', got ' . $actual . ')');
    }
}

function assert_string_equals(string $expected, string $actual, string $message): void
{
    if ($expected !== $actual) {
        fail($message . ' (expected "' . $expected . '", got "' . $actual . '")');
    }
}

function run_api(string $endpointPath, string $method, int $userId, array $payload = [], array $query = [], array $headers = []): array
{
    static $sessionIds = [];

    $runner = __DIR__ . '/test_api_runner.php';
    $payloadArg = base64_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $queryArg = base64_encode(json_encode($query, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $headersArg = base64_encode(json_encode($headers, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $sessionKey = (string) $userId;

    if (!isset($sessionIds[$sessionKey])) {
        $sessionIds[$sessionKey] = substr(bin2hex(random_bytes(16)), 0, 26);
    }

    $command = escapeshellarg(PHP_BINARY)
        . ' '
        . escapeshellarg($runner)
        . ' '
        . escapeshellarg($endpointPath)
        . ' '
        . escapeshellarg(strtoupper($method))
        . ' '
        . escapeshellarg((string) $userId)
        . ' '
        . escapeshellarg($payloadArg)
        . ' '
        . escapeshellarg($queryArg)
        . ' '
        . escapeshellarg($sessionIds[$sessionKey])
        . ' '
        . escapeshellarg($headersArg);

    $output = shell_exec($command);
    if (!is_string($output) || trim($output) === '') {
        fail('No output from API runner for ' . $endpointPath . ' ' . $method);
    }

    $decoded = json_decode($output, true);
    if (!is_array($decoded) || !array_key_exists('status', $decoded) || !array_key_exists('body', $decoded)) {
        fail('Invalid API runner response: ' . $output);
    }

    if (!is_array($decoded['body'])) {
        $decoded['body'] = ['raw' => $decoded['body']];
    }

    return $decoded;
}

function create_user(PDO $pdo, array $data): int
{
    $insertUser = $pdo->prepare(
        'INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)'
    );
    $insertUser->execute([
        'first_name' => $data['first_name'],
        'last_name' => $data['last_name'],
        'email' => $data['email'],
        'password_hash' => password_hash($data['password'], PASSWORD_BCRYPT),
    ]);

    $userId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO user_profiles (user_id, country) VALUES (:user_id, :country)')
        ->execute(['user_id' => $userId, 'country' => 'България']);

    $pdo->prepare(
        'INSERT INTO user_admin_meta (user_id, role, profile_status, is_verified)
         VALUES (:user_id, :role, :profile_status, :is_verified)'
    )->execute([
        'user_id' => $userId,
        'role' => 'user',
        'profile_status' => $data['profile_status'],
        'is_verified' => $data['is_verified'] ? 1 : 0,
    ]);

    return $userId;
}

function seed_reset_code(PDO $pdo, int $userId, string $plainCode, string $expiresExpr = 'DATE_ADD(NOW(), INTERVAL 10 MINUTE)', ?string $usedExpr = null, int $attempts = 0, string $createdExpr = 'NOW()'): int
{
    $hash = password_hash($plainCode, PASSWORD_BCRYPT);
    if ($hash === false) {
        fail('Failed to hash reset code');
    }

    $usedSql = $usedExpr === null ? 'NULL' : $usedExpr;
    $sql = sprintf(
        "INSERT INTO user_password_reset_codes (user_id, code_hash, attempts, expires_at, used_at, created_at) VALUES (%d, %s, %d, %s, %s, %s)",
        $userId,
        $pdo->quote($hash),
        $attempts,
        $expiresExpr,
        $usedSql,
        $createdExpr
    );
    $pdo->exec($sql);

    return (int) $pdo->lastInsertId();
}

$config = require __DIR__ . '/../api/config.php';
$pdo = db_connection($config);
password_reset_install_schema($pdo);

$createdUserIds = [];
$publicMessage = 'Ако има профил с този имейл, ще получиш код за възстановяване.';

try {
    $email = 'reset-user+' . bin2hex(random_bytes(4)) . '@example.com';
    $oldPassword = 'OldPass-12345!';
    $newPassword = 'NewPass-12345!';

    $userId = create_user($pdo, [
        'first_name' => 'Reset',
        'last_name' => 'User',
        'email' => $email,
        'password' => $oldPassword,
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $userId;

    seed_reset_code($pdo, $userId, '123456');

    $okReset = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $email,
        'code' => '123456',
        'newPassword' => $newPassword,
        'confirmPassword' => $newPassword,
    ]);
    assert_int_equals(200, (int) $okReset['status'], 'Correct reset code should change password');
    assert_true(!array_key_exists('code', $okReset['body']), 'Reset response must not include reset code');

    $loginOld = run_api(__DIR__ . '/../api/auth/login.php', 'POST', 0, [
        'email' => $email,
        'password' => $oldPassword,
    ]);
    assert_int_equals(401, (int) $loginOld['status'], 'Old password should stop working after reset');

    $loginNew = run_api(__DIR__ . '/../api/auth/login.php', 'POST', 0, [
        'email' => $email,
        'password' => $newPassword,
    ]);
    assert_int_equals(200, (int) $loginNew['status'], 'New password should work after successful reset');

    $unverifiedEmail = 'reset-unverified+' . bin2hex(random_bytes(4)) . '@example.com';
    $unverifiedUserId = create_user($pdo, [
        'first_name' => 'Unverified',
        'last_name' => 'Case',
        'email' => $unverifiedEmail,
        'password' => 'Unverified-12345!',
        'profile_status' => 'active',
        'is_verified' => false,
    ]);
    $createdUserIds[] = $unverifiedUserId;
    seed_reset_code($pdo, $unverifiedUserId, '112233');

    $unverifiedReset = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $unverifiedEmail,
        'code' => '112233',
        'newPassword' => 'Unverified-New123!',
        'confirmPassword' => 'Unverified-New123!',
    ]);
    assert_int_equals(200, (int) $unverifiedReset['status'], 'Unverified profile should be able to reset password with valid code');

    $verifiedAfterReset = (int) $pdo->query('SELECT is_verified FROM user_admin_meta WHERE user_id = ' . $unverifiedUserId . ' LIMIT 1')->fetchColumn();
    assert_int_equals(0, $verifiedAfterReset, 'Password reset must not auto-verify unverified profiles');

    $wrongCodeEmail = 'reset-wrong+' . bin2hex(random_bytes(4)) . '@example.com';
    $wrongCodePassword = 'WrongCode-12345!';
    $wrongUserId = create_user($pdo, [
        'first_name' => 'Wrong',
        'last_name' => 'Code',
        'email' => $wrongCodeEmail,
        'password' => $wrongCodePassword,
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $wrongUserId;
    seed_reset_code($pdo, $wrongUserId, '234567');

    $wrongReset = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $wrongCodeEmail,
        'code' => '111111',
        'newPassword' => 'WrongCode-New123!',
        'confirmPassword' => 'WrongCode-New123!',
    ]);
    assert_int_equals(422, (int) $wrongReset['status'], 'Wrong code must not change password');
    assert_string_equals('Кодът е невалиден или изтекъл.', (string) ($wrongReset['body']['error'] ?? ''), 'Wrong code should return generic invalid message');

    $wrongLoginOld = run_api(__DIR__ . '/../api/auth/login.php', 'POST', 0, [
        'email' => $wrongCodeEmail,
        'password' => $wrongCodePassword,
    ]);
    assert_int_equals(200, (int) $wrongLoginOld['status'], 'Wrong-code user should still log in with old password');

    $expiredEmail = 'reset-expired+' . bin2hex(random_bytes(4)) . '@example.com';
    $expiredUserId = create_user($pdo, [
        'first_name' => 'Expired',
        'last_name' => 'Case',
        'email' => $expiredEmail,
        'password' => 'Expired-12345!',
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $expiredUserId;
    seed_reset_code($pdo, $expiredUserId, '345678', 'DATE_SUB(NOW(), INTERVAL 1 MINUTE)');

    $expiredReset = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $expiredEmail,
        'code' => '345678',
        'newPassword' => 'Expired-New123!',
        'confirmPassword' => 'Expired-New123!',
    ]);
    assert_int_equals(422, (int) $expiredReset['status'], 'Expired reset code must fail');
    assert_string_equals('Кодът е невалиден или изтекъл.', (string) ($expiredReset['body']['error'] ?? ''), 'Expired code should return generic invalid message');

    $reuseEmail = 'reset-reuse+' . bin2hex(random_bytes(4)) . '@example.com';
    $reuseUserId = create_user($pdo, [
        'first_name' => 'Reuse',
        'last_name' => 'Case',
        'email' => $reuseEmail,
        'password' => 'Reuse-12345!',
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $reuseUserId;
    seed_reset_code($pdo, $reuseUserId, '456789');

    $reuseFirst = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $reuseEmail,
        'code' => '456789',
        'newPassword' => 'Reuse-New123!',
        'confirmPassword' => 'Reuse-New123!',
    ]);
    assert_int_equals(200, (int) $reuseFirst['status'], 'First use of reset code should work');

    $reuseSecond = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $reuseEmail,
        'code' => '456789',
        'newPassword' => 'Reuse-New1234!',
        'confirmPassword' => 'Reuse-New1234!',
    ]);
    assert_int_equals(422, (int) $reuseSecond['status'], 'Used reset code must not be reusable');
    assert_string_equals('Кодът е невалиден или изтекъл.', (string) ($reuseSecond['body']['error'] ?? ''), 'Used code should return generic invalid message');

    $attemptsEmail = 'reset-attempts+' . bin2hex(random_bytes(4)) . '@example.com';
    $attemptsUserId = create_user($pdo, [
        'first_name' => 'Attempts',
        'last_name' => 'Case',
        'email' => $attemptsEmail,
        'password' => 'Attempts-12345!',
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $attemptsUserId;
    seed_reset_code($pdo, $attemptsUserId, '567890');

    for ($i = 0; $i < 5; $i++) {
        $attemptResult = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
            'email' => $attemptsEmail,
            'code' => '999999',
            'newPassword' => 'Attempts-New123!',
            'confirmPassword' => 'Attempts-New123!',
        ]);
        assert_int_equals(422, (int) $attemptResult['status'], 'Wrong attempt should fail');
    }

    $attemptsState = $pdo->query(
        'SELECT attempts, used_at IS NOT NULL AS is_used FROM user_password_reset_codes WHERE user_id = '
        . $attemptsUserId
        . ' ORDER BY id DESC LIMIT 1'
    )->fetch();
    assert_int_equals(5, (int) ($attemptsState['attempts'] ?? -1), 'Code should track 5 failed attempts');
    assert_int_equals(1, (int) ($attemptsState['is_used'] ?? 0), 'Code should be invalidated after 5 failed attempts');

    $attemptsAfterLock = run_api(__DIR__ . '/../api/auth/reset-password.php', 'POST', 0, [
        'email' => $attemptsEmail,
        'code' => '567890',
        'newPassword' => 'Attempts-New456!',
        'confirmPassword' => 'Attempts-New456!',
    ]);
    assert_int_equals(422, (int) $attemptsAfterLock['status'], 'Code invalidated after attempts should not work even with correct value');

    $requestEmail = 'reset-request+' . bin2hex(random_bytes(4)) . '@example.com';
    $requestUserId = create_user($pdo, [
        'first_name' => 'Request',
        'last_name' => 'Case',
        'email' => $requestEmail,
        'password' => 'Request-12345!',
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $requestUserId;
    seed_reset_code($pdo, $requestUserId, '678901', 'DATE_ADD(NOW(), INTERVAL 10 MINUTE)', null, 0, 'DATE_SUB(NOW(), INTERVAL 2 MINUTE)');

    $requestBefore = (int) $pdo->query('SELECT COUNT(*) FROM user_password_reset_codes WHERE user_id = ' . $requestUserId . ' AND used_at IS NULL')->fetchColumn();
    assert_int_equals(1, $requestBefore, 'Seeded request user should start with one active reset code');

    $requestExisting = run_api(__DIR__ . '/../api/auth/request-password-reset.php', 'POST', 0, ['email' => $requestEmail]);
    $requestMissing = run_api(__DIR__ . '/../api/auth/request-password-reset.php', 'POST', 0, ['email' => 'missing+' . bin2hex(random_bytes(4)) . '@example.com']);

    assert_int_equals(200, (int) $requestExisting['status'], 'Request reset must return 200 for existing email');
    assert_int_equals(200, (int) $requestMissing['status'], 'Request reset must return 200 for missing email');
    assert_string_equals($publicMessage, (string) ($requestExisting['body']['message'] ?? ''), 'Existing email should get generic public response');
    assert_string_equals($publicMessage, (string) ($requestMissing['body']['message'] ?? ''), 'Missing email should get generic public response');
    assert_true(!array_key_exists('code', $requestExisting['body']), 'Request response must not include code');
    assert_true(!array_key_exists('user_id', $requestExisting['body']), 'Request response must not include user id');

    $requestAfter = (int) $pdo->query('SELECT COUNT(*) FROM user_password_reset_codes WHERE user_id = ' . $requestUserId . ' AND used_at IS NULL')->fetchColumn();
    assert_int_equals(0, $requestAfter, 'Issuing new code should invalidate old active code even when sending fails');

    echo "password_reset_integration_test: OK\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'password_reset_integration_test: FAIL - ' . $e->getMessage() . "\n");
    exit(1);
} finally {
    foreach (array_reverse($createdUserIds) as $userId) {
        if ($userId <= 0) {
            continue;
        }

        $cleanup = $pdo->prepare('DELETE FROM users WHERE id = :id');
        $cleanup->execute(['id' => $userId]);
    }
}
