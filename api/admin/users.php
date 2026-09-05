<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/api_helpers.php';
require __DIR__ . '/../lib/admin_helpers.php';
require __DIR__ . '/../lib/category_defaults.php';

$method = api_method();
$pdo = api_pdo();
$userId = api_user_id();
$data = api_request_data();

admin_install_schema($pdo);
admin_ensure_user_meta($pdo, $userId);
requireAdmin($pdo);

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
        'profileStatus' => strtolower((string) ($row['profile_status'] ?? 'active')),
        'isVerified' => (bool) ($row['is_verified'] ?? false),
    ];
}

function admin_load_users(PDO $pdo, array $filters): array
{
    $where = ['1 = 1'];
    $params = [];

    $search = strtolower(trim((string) ($filters['search'] ?? '')));
    if ($search !== '') {
        $where[] = 'LOWER(u.email) LIKE :search';
        $params['search'] = '%' . $search . '%';
    }

    $countSql = sprintf(
        'SELECT COUNT(*)
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE %s',
        implode(' AND ', $where)
    );
    $countStmt = $pdo->prepare($countSql);
    $countStmt->execute($params);
    $totalUsers = (int) $countStmt->fetchColumn();

    $page = max(1, (int) ($filters['page'] ?? 1));
    $pageSize = max(1, min(20, (int) ($filters['pageSize'] ?? 20)));
    $offset = ($page - 1) * $pageSize;

    $sql = sprintf(
        'SELECT u.id, u.first_name, u.last_name, u.email, u.created_at,
                m.profile_status, m.is_verified
         FROM users u
         LEFT JOIN user_admin_meta m ON m.user_id = u.id
         WHERE %s
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT :limit OFFSET :offset',
        implode(' AND ', $where)
    );

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue(':' . $key, $value, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    return [
        'users' => $stmt->fetchAll(),
        'pagination' => [
            'page' => $page,
            'pageSize' => $pageSize,
            'totalUsers' => $totalUsers,
            'totalPages' => $totalUsers > 0 ? (int) ceil($totalUsers / $pageSize) : 0,
        ],
    ];
}

function admin_stats(PDO $pdo): array
{
    return [
        'totalUsersCount' => admin_count($pdo, 'users'),
        'verifiedUsersCount' => (int) $pdo->query('SELECT COUNT(*) FROM user_admin_meta WHERE is_verified = 1')->fetchColumn(),
        'blockedUsersCount' => (int) $pdo->query("SELECT COUNT(*) FROM user_admin_meta WHERE profile_status = 'blocked'")->fetchColumn(),
    ];
}

if ($method === 'GET') {
    $filters = [
        'search' => $_GET['search'] ?? '',
        'page' => $_GET['page'] ?? 1,
        'pageSize' => 20,
    ];

    $result = admin_load_users($pdo, $filters);
    $users = array_map(
        static fn (array $row): array => admin_user_payload($row, []),
        $result['users']
    );

    json_response(200, [
        'ok' => true,
        'stats' => admin_stats($pdo),
        'pagination' => $result['pagination'],
        'csrfToken' => admin_csrf_token(),
        'users' => $users,
    ]);
}

if ($method === 'POST') {
    admin_require_csrf();

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
    category_seed_default_categories($pdo, $newUserId);
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
    admin_require_csrf();

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

    if ($nextStatus !== '' && $nextStatus !== 'active' && $nextStatus !== 'blocked') {
        json_response(422, ['ok' => false, 'error' => 'Невалиден статус. Позволени: active, blocked.']);
    }

    $userStmt = $pdo->prepare('SELECT role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
    $userStmt->execute(['id' => $targetUserId]);
    $existingMeta = $userStmt->fetch();
    if (!$existingMeta) {
        admin_ensure_user_meta($pdo, $targetUserId);
        $existingMeta = $pdo->prepare('SELECT role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
        $existingMeta->execute(['id' => $targetUserId]);
        $existingMeta = $existingMeta->fetch();
    }

    if (!$existingMeta) {
        json_response(404, ['ok' => false, 'error' => 'Потребителят не е намерен.']);
    }

    if ($nextStatus !== '' && $targetUserId === $userId && $nextStatus === 'blocked') {
        json_response(422, ['ok' => false, 'error' => 'Не можеш да блокираш собствения си профил.']);
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
    admin_require_csrf();

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
    admin_require_csrf();

    $targetUserId = api_int_or_null($data['userId'] ?? $data['id'] ?? null);

    if (!$targetUserId) {
        json_response(422, ['ok' => false, 'error' => 'Изисква се userId.']);
    }

    if ($targetUserId === $userId) {
        json_response(422, ['ok' => false, 'error' => 'Не можеш да изтриеш собствения си профил.']);
    }

    $userStmt = $pdo->prepare('SELECT role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
    $userStmt->execute(['id' => $targetUserId]);
    $meta = $userStmt->fetch();

    if (!$meta) {
        admin_ensure_user_meta($pdo, $targetUserId);
        $userStmt = $pdo->prepare('SELECT role FROM user_admin_meta WHERE user_id = :id LIMIT 1');
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
