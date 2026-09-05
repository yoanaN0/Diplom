<?php

declare(strict_types=1);

require __DIR__ . '/../api/lib/db.php';

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
        'role' => $data['role'],
        'profile_status' => $data['profile_status'],
        'is_verified' => $data['is_verified'] ? 1 : 0,
    ]);

    return $userId;
}

$config = require __DIR__ . '/../api/config.php';
$pdo = db_connection($config);

$baselineUsers = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
$baselineVerified = (int) $pdo->query('SELECT COUNT(*) FROM user_admin_meta WHERE is_verified = 1')->fetchColumn();
$baselineBlocked = (int) $pdo->query("SELECT COUNT(*) FROM user_admin_meta WHERE profile_status = 'blocked'")->fetchColumn();

$createdUserIds = [];
$adminPassword = 'Admin-12345!';
$ordinaryPassword = 'User-12345!';
$blockedPassword = 'Blocked-12345!';

try {
    $adminEmail = 'admin-panel-admin+' . bin2hex(random_bytes(4)) . '@example.com';
    $ordinaryEmail = 'admin-panel-user+' . bin2hex(random_bytes(4)) . '@example.com';
    $blockedEmail = 'admin-panel-blocked+' . bin2hex(random_bytes(4)) . '@example.com';

    $adminUserId = create_user($pdo, [
        'first_name' => 'Admin',
        'last_name' => 'Tester',
        'email' => $adminEmail,
        'password' => $adminPassword,
        'role' => 'admin',
        'profile_status' => 'active',
        'is_verified' => false,
    ]);
    $createdUserIds[] = $adminUserId;

    $ordinaryUserId = create_user($pdo, [
        'first_name' => 'Normal',
        'last_name' => 'Tester',
        'email' => $ordinaryEmail,
        'password' => $ordinaryPassword,
        'role' => 'user',
        'profile_status' => 'active',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $ordinaryUserId;

    $blockedUserId = create_user($pdo, [
        'first_name' => 'Blocked',
        'last_name' => 'Tester',
        'email' => $blockedEmail,
        'password' => $blockedPassword,
        'role' => 'user',
        'profile_status' => 'blocked',
        'is_verified' => true,
    ]);
    $createdUserIds[] = $blockedUserId;

    $extraUserIds = [];
    for ($index = 1; $index <= 18; $index++) {
        $extraUserIds[] = create_user($pdo, [
            'first_name' => 'Extra' . $index,
            'last_name' => 'Tester',
            'email' => 'admin-panel-extra-' . $index . '+' . bin2hex(random_bytes(3)) . '@example.com',
            'password' => 'Extra-12345!',
            'role' => 'user',
            'profile_status' => 'active',
            'is_verified' => true,
        ]);
    }
    $createdUserIds = array_merge($createdUserIds, $extraUserIds);

    $unauthenticated = run_api(__DIR__ . '/../api/admin/users.php', 'GET', 0);
    assert_int_equals(401, (int) $unauthenticated['status'], 'Admin GET without a session should be rejected');

    $forbiddenForUser = run_api(__DIR__ . '/../api/admin/users.php', 'GET', $ordinaryUserId);
    assert_int_equals(403, (int) $forbiddenForUser['status'], 'Admin GET for a non-admin user should be rejected');

    $adminOverview = run_api(__DIR__ . '/../api/admin/users.php', 'GET', $adminUserId);
    assert_int_equals(200, (int) $adminOverview['status'], 'Admin GET should succeed for an admin');

    $body = $adminOverview['body'];
    $stats = $body['stats'] ?? [];
    $pagination = $body['pagination'] ?? [];
    $users = $body['users'] ?? [];
    $csrfToken = (string) ($body['csrfToken'] ?? '');

    assert_true($csrfToken !== '', 'Admin overview should return a CSRF token');
    assert_int_equals($baselineUsers + count($createdUserIds), (int) ($stats['totalUsersCount'] ?? -1), 'Total user counter should come from the database');
    assert_int_equals($baselineVerified + count($createdUserIds) - 1, (int) ($stats['verifiedUsersCount'] ?? -1), 'Verified user counter should come from the database');
    assert_int_equals($baselineBlocked + 1, (int) ($stats['blockedUsersCount'] ?? -1), 'Blocked user counter should come from the database');
    assert_int_equals(20, count($users), 'Admin list should be limited to 20 users per page');
    assert_int_equals(20, (int) ($pagination['pageSize'] ?? -1), 'Admin pagination should report a page size of 20');
    assert_true((int) ($pagination['totalUsers'] ?? 0) >= count($createdUserIds), 'Pagination should report the total number of matching users');
    assert_true((int) ($pagination['totalPages'] ?? 0) >= 2, 'Pagination should expose multiple pages when more than 20 users exist');

    $searchResults = run_api(__DIR__ . '/../api/admin/users.php', 'GET', $adminUserId, [], ['search' => $blockedEmail]);
    assert_int_equals(200, (int) $searchResults['status'], 'Admin search should succeed');
    assert_int_equals(1, count($searchResults['body']['users'] ?? []), 'Search by email should return a single user');

    $blockedLogin = run_api(__DIR__ . '/../api/auth/login.php', 'POST', 0, [
        'email' => $blockedEmail,
        'password' => $blockedPassword,
    ]);
    assert_int_equals(403, (int) $blockedLogin['status'], 'Blocked users should not be able to log in');

    $adminLogin = run_api(__DIR__ . '/../api/auth/login.php', 'POST', 0, [
        'email' => $adminEmail,
        'password' => $adminPassword,
    ]);
    assert_int_equals(200, (int) $adminLogin['status'], 'Admin users should log in without email verification');
    assert_true(($adminLogin['body']['user']['role'] ?? '') === 'admin', 'Admin login should return the admin role');
    assert_true(($adminLogin['body']['user']['profileStatus'] ?? '') === 'active', 'Admin login should return an active profile status');

    $page2 = run_api(__DIR__ . '/../api/admin/users.php', 'GET', $adminUserId, [], ['page' => 2]);
    assert_int_equals(200, (int) $page2['status'], 'Second page should be accessible');
    assert_true(count($page2['body']['users'] ?? []) > 0, 'Second admin page should contain at least one user');

    $blockResponse = run_api(
        __DIR__ . '/../api/admin/users.php',
        'PATCH',
        $adminUserId,
        ['userId' => $ordinaryUserId, 'status' => 'blocked'],
        [],
        ['X-CSRF-Token' => $csrfToken]
    );
    assert_int_equals(200, (int) $blockResponse['status'], 'Admin should be able to block a user');
    assert_true(($blockResponse['body']['user']['profileStatus'] ?? '') === 'blocked', 'Blocked response should report blocked status');

    $blockedProtectedRequest = run_api(__DIR__ . '/../api/auth/me.php', 'GET', $ordinaryUserId);
    assert_int_equals(403, (int) $blockedProtectedRequest['status'], 'Blocked users should be rejected by protected requests');

    $selfBlockResponse = run_api(
        __DIR__ . '/../api/admin/users.php',
        'PATCH',
        $adminUserId,
        ['userId' => $adminUserId, 'status' => 'blocked'],
        [],
        ['X-CSRF-Token' => $csrfToken]
    );
    assert_int_equals(422, (int) $selfBlockResponse['status'], 'Admin should not be able to block their own profile');

    $activateResponse = run_api(
        __DIR__ . '/../api/admin/users.php',
        'PATCH',
        $adminUserId,
        ['userId' => $ordinaryUserId, 'status' => 'active'],
        [],
        ['X-CSRF-Token' => $csrfToken]
    );
    assert_int_equals(200, (int) $activateResponse['status'], 'Admin should be able to reactivate a user');
    assert_true(($activateResponse['body']['user']['profileStatus'] ?? '') === 'active', 'Reactivated response should report active status');

    $reactivatedProtectedRequest = run_api(__DIR__ . '/../api/auth/me.php', 'GET', $ordinaryUserId);
    assert_int_equals(200, (int) $reactivatedProtectedRequest['status'], 'Reactivated users should regain access to protected requests');

    echo "admin_panel_integration_test: OK\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'admin_panel_integration_test: FAIL - ' . $e->getMessage() . "\n");
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