<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/admin_helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$input = read_json_body();
$email = mb_strtolower(trim((string) ($input['email'] ?? '')));
$password = (string) ($input['password'] ?? '');

if ($email === '' || $password === '') {
    json_response(422, ['ok' => false, 'error' => 'Имейлът и паролата са задължителни.']);
}

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);

$stmt = $pdo->prepare(
    'SELECT u.id, u.first_name, u.last_name, u.email, u.password_hash, m.role, m.profile_status, m.is_verified, m.last_login_at
     FROM users u
     LEFT JOIN user_admin_meta m ON m.user_id = u.id
     WHERE u.email = :email
     LIMIT 1'
);
$stmt->execute(['email' => $email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    admin_track_login($pdo, $user ? (int) $user['id'] : null, $email, false);
    json_response(401, ['ok' => false, 'error' => 'Невалиден имейл или парола.']);
}

admin_ensure_user_meta($pdo, (int) $user['id']);
$meta = admin_get_user_meta($pdo, (int) $user['id']);
$profileStatus = $meta['profileStatus'] ?? 'active';

if (in_array($profileStatus, ['blocked', 'deleted'], true)) {
    admin_track_login($pdo, (int) $user['id'], $email, false);
    json_response(403, ['ok' => false, 'error' => 'Профилът е ограничен. Свържи се с администратор.']);
}

$_SESSION['user_id'] = (int) $user['id'];
admin_track_login($pdo, (int) $user['id'], $email, true);
$meta = admin_get_user_meta($pdo, (int) $user['id']) ?? [
    'role' => 'user',
    'profileStatus' => 'active',
    'isVerified' => false,
    'lastLoginAt' => null,
];

json_response(200, [
    'ok' => true,
    'user' => [
        'id' => (int) $user['id'],
        'firstName' => $user['first_name'],
        'lastName' => $user['last_name'],
        'email' => $user['email'],
        'role' => $meta['role'],
        'profileStatus' => $meta['profileStatus'],
        'isVerified' => $meta['isVerified'],
        'lastLoginAt' => $meta['lastLoginAt'],
    ],
]);
