<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/admin_helpers.php';
require __DIR__ . '/../lib/email_verification.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$input = read_json_body();
$email = mb_strtolower(trim((string) ($input['email'] ?? '')));
$code = trim((string) ($input['code'] ?? ''));

if ($email === '' || $code === '') {
    json_response(422, ['ok' => false, 'error' => 'Имейлът и кодът са задължителни.']);
}

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);
email_verification_install_schema($pdo);

$stmt = $pdo->prepare(
    'SELECT id, first_name, last_name, email
     FROM users
     WHERE email = :email
     LIMIT 1'
);
$stmt->execute(['email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    json_response(404, ['ok' => false, 'error' => 'Потребителят не е намерен.']);
}

$userId = (int) $user['id'];
admin_ensure_user_meta($pdo, $userId);
$meta = admin_get_user_meta($pdo, $userId);

if (($meta['isVerified'] ?? false) === true) {
    $_SESSION['user_id'] = $userId;
    admin_track_login($pdo, $userId, $email, true);

    json_response(200, [
        'ok' => true,
        'user' => [
            'id' => $userId,
            'firstName' => $user['first_name'],
            'lastName' => $user['last_name'],
            'email' => $user['email'],
            'role' => $meta['role'] ?? 'user',
            'profileStatus' => $meta['profileStatus'] ?? 'active',
            'isVerified' => true,
            'lastLoginAt' => $meta['lastLoginAt'] ?? null,
        ],
    ]);
}

$verificationResult = email_verification_verify_code($pdo, $userId, $code);
if (!$verificationResult['ok']) {
    json_response(422, ['ok' => false, 'error' => $verificationResult['error'] ?? 'Невалиден код.']);
}

email_verification_mark_user_verified($pdo, $userId);
$_SESSION['user_id'] = $userId;
admin_track_login($pdo, $userId, $email, true);
$meta = admin_get_user_meta($pdo, $userId) ?? [
    'role' => 'user',
    'profileStatus' => 'active',
    'isVerified' => true,
    'lastLoginAt' => null,
];

json_response(200, [
    'ok' => true,
    'user' => [
        'id' => $userId,
        'firstName' => $user['first_name'],
        'lastName' => $user['last_name'],
        'email' => $user['email'],
        'role' => $meta['role'],
        'profileStatus' => $meta['profileStatus'],
        'isVerified' => true,
        'lastLoginAt' => $meta['lastLoginAt'],
    ],
]);
