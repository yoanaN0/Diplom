<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/api_helpers.php';
require __DIR__ . '/../lib/admin_helpers.php';

$method = api_method();
$pdo = api_pdo();
$userId = api_user_id();
$data = api_request_data();

admin_install_schema($pdo);
admin_ensure_user_meta($pdo, $userId);
admin_require_admin($pdo, $userId);

function admin_datetime(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    return str_replace(' ', 'T', $value);
}

function admin_count(PDO $pdo, string $table): int
{
    $stmt = $pdo->query(sprintf('SELECT COUNT(*) FROM %s', $table));
    return (int) $stmt->fetchColumn();
}

function admin_user_payload(array $row, array $logs): array
{
    return [
        'id' => (int) $row['id'],
        'name' => trim((string) $row['first_name'] . ' ' . (string) $row['last_name']),
        'firstName' => (string) $row['first_name'],
        'lastName' => (string) $row['last_name'],
        'email' => (string) $row['email'],
        'registeredAt' => admin_datetime((string) ($row['created_at'] ?? '')),
        'lastLoginAt' => admin_datetime($row['last_login_at'] ?? null),
        'profileStatus' => strtolower((string) ($row['profile_status'] ?? 'active')),
        'role' => strtolower((string) ($row['role'] ?? 'user')),
        'isVerified' => (bool) ($row['is_verified'] ?? false),
        'loginLogs' => $logs,
    ];
}

function admin_load_users(PDO $pdo, array $filters): array
{
    $where = ['1 = 1'];
    $params = [];

    $search = strtolower(trim((string) ($filters['search'] ?? '')));
    if ($search !== '') {
        $where[] = '(LOWER(u.first_name) LIKE :search OR LOWER(u.last_name) LIKE :search OR LOWER(u.email) LIKE :search)';
        $params['search'] = '%' . $search . '%';
    }

    $status = strtolower(trim((string) ($filters['status'] ?? 'all')));
    if ($status !== '' && $status !== 'all' && in_array($status, ['active', 'blocked', 'deleted'], true)) {
        $where[] = 'm.profile_status = :profile_status';
        $params['profile_status'] = $status;
    }

    $role = strtolower(trim((string) ($filters['role'] ?? 'all')));
    if ($role !== '' && $role !== 'all' && in_array($role, ['admin', 'user'], true)) {
        $where[] = 'm.role = :role';
        $params['role'] = $role;
    }

    $sql = sprintf(
        'SELECT u.id, u.first_name, u.last_name, u.email, u.created_at,
                m.role, m.profile_status, m.is_verified, m.last_login_at
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE %s
         ORDER BY u.created_at DESC, u.id DESC',
        implode(' AND ', $where)
    );

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function admin_stats(PDO $pdo): array
{
    $blockedStmt = $pdo->prepare('SELECT COUNT(*) FROM user_admin_meta WHERE profile_status = :profile_status');
    $blockedStmt->execute(['profile_status' => 'blocked']);

    $recent7Stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    $recent7Stmt->execute();

    $recent30Stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    $recent30Stmt->execute();

    return [
        'usersCount' => admin_count($pdo, 'users'),
        'blockedUsersCount' => (int) $blockedStmt->fetchColumn(),
        'recent7Days' => (int) $recent7Stmt->fetchColumn(),
        'recent30Days' => (int) $recent30Stmt->fetchColumn(),
    ];
}

if ($method === 'GET') {
    $pdo->exec(
        "INSERT INTO user_admin_meta (user_id, role, profile_status, is_verified)
         SELECT u.id,
                CASE WHEN u.id = 1 THEN 'admin' ELSE 'user' END,
                'active',
                0
         FROM users u
         ON DUPLICATE KEY UPDATE
            role = COALESCE(role, VALUES(role)),
            is_verified = COALESCE(is_verified, VALUES(is_verified))"
    );

    $filters = [
        'search' => $_GET['search'] ?? '',
        'status' => $_GET['status'] ?? 'all',
        'role' => $_GET['role'] ?? 'all',
    ];

    $rows = admin_load_users($pdo, $filters);
    $userIds = array_values(array_filter(array_map(static fn (array $row): int => (int) $row['id'], $rows)));
    $logsByUser = [];

    if ($userIds !== []) {
        $placeholders = implode(', ', array_fill(0, count($userIds), '?'));
        $logsStmt = $pdo->prepare(
            "SELECT id, user_id, email, ip_address, user_agent, is_success, login_at
             FROM user_login_logs
             WHERE user_id IN ($placeholders)
             ORDER BY login_at DESC, id DESC"
        );
        $logsStmt->execute($userIds);
        $rawLogs = $logsStmt->fetchAll();

        foreach ($rawLogs as $logRow) {
            $logUserId = (int) ($logRow['user_id'] ?? 0);
            if ($logUserId <= 0) {
                continue;
            }

            if (!isset($logsByUser[$logUserId])) {
                $logsByUser[$logUserId] = [];
            }

            if (count($logsByUser[$logUserId]) >= 5) {
                continue;
            }

            $logsByUser[$logUserId][] = [
                'id' => (int) $logRow['id'],
                'email' => $logRow['email'],
                'ipAddress' => $logRow['ip_address'],
                'userAgent' => $logRow['user_agent'],
                'isSuccess' => (bool) $logRow['is_success'],
                'loggedAt' => admin_datetime((string) ($logRow['login_at'] ?? '')),
            ];
        }
    }

    $users = array_map(
        static fn (array $row): array => admin_user_payload($row, $logsByUser[(int) $row['id']] ?? []),
        $rows
    );

    json_response(200, [
        'ok' => true,
        'stats' => admin_stats($pdo),
        'users' => $users,
    ]);
}

if ($method === 'POST') {
    $firstName = trim((string) ($data['firstName'] ?? ''));
    $lastName = trim((string) ($data['lastName'] ?? ''));
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    $password = (string) ($data['password'] ?? '');
    $nextRole = mb_strtolower(trim((string) ($data['role'] ?? 'user')));
    $nextStatus = mb_strtolower(trim((string) ($data['status'] ?? 'active')));

    if ($firstName === '' || $lastName === '' || $email === '') {
        json_response(422, ['ok' => false, 'error' => 'Името, фамилията и имейлът са задължителни.']);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
    }

    if (mb_strlen($password) < 8) {
        json_response(422, ['ok' => false, 'error' => 'Паролата трябва да е поне 8 символа.']);
    }

    if (!in_array($nextRole, ['admin', 'user'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Невалидна роля. Позволени: admin, user.']);
    }

    if (!in_array($nextStatus, ['active', 'blocked', 'deleted'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Невалиден статус. Позволени: active, blocked, deleted.']);
    }

    $checkStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $checkStmt->execute(['email' => $email]);
    if ($checkStmt->fetch()) {
        json_response(409, ['ok' => false, 'error' => 'Потребител с този имейл вече съществува.']);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    $insertUser = $pdo->prepare(
        'INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)'
    );
    $insertUser->execute([
        'first_name' => $firstName,
        'last_name' => $lastName,
        'email' => $email,
        'password_hash' => $passwordHash,
    ]);

    $newUserId = (int) $pdo->lastInsertId();
    $profileStmt = $pdo->prepare(
        'INSERT INTO user_profiles (user_id, country)
         VALUES (:user_id, :country)'
    );
    $profileStmt->execute([
        'user_id' => $newUserId,
        'country' => 'България',
    ]);

    admin_ensure_user_meta($pdo, $newUserId);
    $metaStmt = $pdo->prepare(
        'UPDATE user_admin_meta
         SET role = :role, profile_status = :profile_status
         WHERE user_id = :user_id'
    );
    $metaStmt->execute([
        'role' => $nextRole,
        'profile_status' => $nextStatus,
        'user_id' => $newUserId,
    ]);

    $createdStmt = $pdo->prepare(
        'SELECT u.id, u.first_name, u.last_name, u.email, u.created_at,
                m.role, m.profile_status, m.is_verified, m.last_login_at
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE u.id = :id
         LIMIT 1'
    );
    $createdStmt->execute(['id' => $newUserId]);
    $row = $createdStmt->fetch();

    if (!$row) {
        json_response(500, ['ok' => false, 'error' => 'Неуспешно създаване на потребителя.']);
    }

    json_response(201, [
        'ok' => true,
        'user' => admin_user_payload($row, []),
    ]);
}

if ($method === 'PATCH') {
    $targetUserId = api_int_or_null($data['userId'] ?? $data['id'] ?? null);
    $nextStatus = mb_strtolower(trim((string) ($data['status'] ?? '')));
    $nextRole = mb_strtolower(trim((string) ($data['role'] ?? '')));

    if (!$targetUserId) {
        json_response(422, ['ok' => false, 'error' => 'Изисква се userId.']);
    }

    if ($targetUserId === $userId) {
        json_response(422, ['ok' => false, 'error' => 'Не можеш да промениш собствен профил.']);
    }

    if ($nextStatus !== '' && !in_array($nextStatus, ['active', 'blocked', 'deleted'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Невалиден статус. Позволени: active, blocked, deleted.']);
    }

    if ($nextRole !== '' && !in_array($nextRole, ['admin', 'user'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Невалидна роля. Позволени: admin, user.']);
    }

    if ($nextStatus === '' && $nextRole === '') {
        json_response(422, ['ok' => false, 'error' => 'Няма посочена промяна.']);
    }

    $userStmt = $pdo->prepare('SELECT id, role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
    $userStmt->execute(['id' => $targetUserId]);
    $existingMeta = $userStmt->fetch();
    if (!$existingMeta) {
        admin_ensure_user_meta($pdo, $targetUserId);
        $existingMeta = $pdo->prepare('SELECT id, role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
        $existingMeta->execute(['id' => $targetUserId]);
        $existingMeta = $existingMeta->fetch();
    }

    if (!$existingMeta) {
        json_response(404, ['ok' => false, 'error' => 'Потребителят не е намерен.']);
    }

    $updates = [];
    $bindings = ['user_id' => $targetUserId];
    if ($nextStatus !== '') {
        $updates[] = 'profile_status = :profile_status';
        $bindings['profile_status'] = $nextStatus;
    }
    if ($nextRole !== '') {
        $updates[] = 'role = :role';
        $bindings['role'] = $nextRole;
    }

    $pdo->prepare(
        'UPDATE user_admin_meta
         SET ' . implode(', ', $updates) . '
         WHERE user_id = :user_id'
    )->execute($bindings);

    $updatedStmt = $pdo->prepare(
        'SELECT u.id, u.first_name, u.last_name, u.email, u.created_at,
                m.role, m.profile_status, m.is_verified, m.last_login_at
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE u.id = :id
         LIMIT 1'
    );
    $updatedStmt->execute(['id' => $targetUserId]);
    $row = $updatedStmt->fetch();

    if (!$row) {
        json_response(500, ['ok' => false, 'error' => 'Неуспешно обновяване на потребителя.']);
    }

    json_response(200, [
        'ok' => true,
        'user' => admin_user_payload($row, []),
    ]);
}

if ($method === 'PUT') {
    $targetUserId = api_int_or_null($data['userId'] ?? $data['id'] ?? null);
    $firstName = trim((string) ($data['firstName'] ?? ''));
    $lastName = trim((string) ($data['lastName'] ?? ''));
    $email = mb_strtolower(trim((string) ($data['email'] ?? '')));
    $nextRole = mb_strtolower(trim((string) ($data['role'] ?? '')));
    $nextStatus = mb_strtolower(trim((string) ($data['status'] ?? '')));

    if (!$targetUserId) {
        json_response(422, ['ok' => false, 'error' => 'Изисква се userId.']);
    }

    if ($targetUserId === $userId) {
        json_response(422, ['ok' => false, 'error' => 'Не можеш да редактираш собствения си профил от тук.']);
    }

    if ($firstName === '' || $lastName === '' || $email === '') {
        json_response(422, ['ok' => false, 'error' => 'Името, фамилията и имейлът са задължителни.']);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
    }

    if ($nextRole !== '' && !in_array($nextRole, ['admin', 'user'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Невалидна роля.']);
    }

    if ($nextStatus !== '' && !in_array($nextStatus, ['active', 'blocked', 'deleted'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Невалиден статус.']);
    }

    $existsStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email AND id <> :id LIMIT 1');
    $existsStmt->execute(['email' => $email, 'id' => $targetUserId]);
    if ($existsStmt->fetch()) {
        json_response(409, ['ok' => false, 'error' => 'Потребител с този имейл вече съществува.']);
    }

    $updateUser = $pdo->prepare(
        'UPDATE users
         SET first_name = :first_name, last_name = :last_name, email = :email
         WHERE id = :id'
    );
    $updateUser->execute([
        'first_name' => $firstName,
        'last_name' => $lastName,
        'email' => $email,
        'id' => $targetUserId,
    ]);

    admin_ensure_user_meta($pdo, $targetUserId);
    if ($nextRole !== '' || $nextStatus !== '') {
        $metaUpdates = [];
        $metaBindings = ['user_id' => $targetUserId];
        if ($nextRole !== '') {
            $metaUpdates[] = 'role = :role';
            $metaBindings['role'] = $nextRole;
        }
        if ($nextStatus !== '') {
            $metaUpdates[] = 'profile_status = :profile_status';
            $metaBindings['profile_status'] = $nextStatus;
        }
        $pdo->prepare(
            'UPDATE user_admin_meta
             SET ' . implode(', ', $metaUpdates) . '
             WHERE user_id = :user_id'
        )->execute($metaBindings);
    }

    $updatedStmt = $pdo->prepare(
        'SELECT u.id, u.first_name, u.last_name, u.email, u.created_at,
                m.role, m.profile_status, m.is_verified, m.last_login_at
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE u.id = :id
         LIMIT 1'
    );
    $updatedStmt->execute(['id' => $targetUserId]);
    $row = $updatedStmt->fetch();

    if (!$row) {
        json_response(500, ['ok' => false, 'error' => 'Неуспешно обновяване на потребителя.']);
    }

    json_response(200, [
        'ok' => true,
        'user' => admin_user_payload($row, []),
    ]);
}

if ($method === 'DELETE') {
    $targetUserId = api_int_or_null($data['userId'] ?? $data['id'] ?? null);

    if (!$targetUserId) {
        json_response(422, ['ok' => false, 'error' => 'Изисква се userId.']);
    }

    if ($targetUserId === $userId) {
        json_response(422, ['ok' => false, 'error' => 'Не можеш да изтриеш собствения си профил.']);
    }

    $userStmt = $pdo->prepare('SELECT id, role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
    $userStmt->execute(['id' => $targetUserId]);
    $meta = $userStmt->fetch();

    if (!$meta) {
        admin_ensure_user_meta($pdo, $targetUserId);
        $userStmt = $pdo->prepare('SELECT id, role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
        $userStmt->execute(['id' => $targetUserId]);
        $meta = $userStmt->fetch();
    }

    if (!$meta) {
        json_response(404, ['ok' => false, 'error' => 'Потребителят не е намерен.']);
    }

    if ((string) ($meta['role'] ?? 'user') === 'admin') {
        $adminCountStmt = $pdo->query("SELECT COUNT(*) FROM user_admin_meta WHERE role = 'admin' AND profile_status <> 'deleted'");
        if ((int) $adminCountStmt->fetchColumn() <= 1) {
            json_response(422, ['ok' => false, 'error' => 'Трябва да остане поне един активен администратор.']);
        }
    }

    $softDeleteStmt = $pdo->prepare(
        'UPDATE user_admin_meta
         SET profile_status = :profile_status
         WHERE user_id = :user_id'
    );
    $softDeleteStmt->execute([
        'profile_status' => 'deleted',
        'user_id' => $targetUserId,
    ]);

    json_response(200, ['ok' => true, 'deletedUserId' => $targetUserId, 'profileStatus' => 'deleted']);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
