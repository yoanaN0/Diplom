<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/admin_helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
}

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);
admin_ensure_user_meta($pdo, $userId);
$meta = admin_get_user_meta($pdo, $userId) ?? [
    'role' => 'user',
    'profileStatus' => 'active',
    'isVerified' => false,
    'lastLoginAt' => null,
];

if (in_array($meta['profileStatus'], ['blocked', 'deleted'], true)) {
    session_unset();
    session_destroy();
    json_response(403, ['ok' => false, 'error' => 'Профилът е ограничен. Свържи се с администратор.']);
}

$stmt = $pdo->prepare(
    'SELECT u.id, u.first_name, u.last_name, u.email, p.phone, p.birth_date, p.city, p.country
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = :id
     LIMIT 1'
);
$stmt->execute(['id' => $userId]);
$user = $stmt->fetch();

if (!$user) {
    session_unset();
    session_destroy();
    json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
}

json_response(200, [
    'ok' => true,
    'user' => [
        'id' => (int) $user['id'],
        'firstName' => $user['first_name'],
        'lastName' => $user['last_name'],
        'email' => $user['email'],
        'phone' => $user['phone'],
        'birthDate' => $user['birth_date'],
        'city' => $user['city'],
        'country' => $user['country'] ?? 'България',
        'role' => $meta['role'],
        'profileStatus' => $meta['profileStatus'],
        'isVerified' => $meta['isVerified'],
        'lastLoginAt' => $meta['lastLoginAt'],
    ],
]);
