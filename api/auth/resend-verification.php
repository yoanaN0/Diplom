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

if ($email === '') {
    json_response(422, ['ok' => false, 'error' => 'Имейлът е задължителен.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
}

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);
email_verification_install_schema($pdo);

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
$stmt->execute(['email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    json_response(404, ['ok' => false, 'error' => 'Потребителят не е намерен.']);
}

$userId = (int) $user['id'];
admin_ensure_user_meta($pdo, $userId);
$meta = admin_get_user_meta($pdo, $userId) ?? [
    'isVerified' => false,
];

if (($meta['isVerified'] ?? false) === true) {
    json_response(409, ['ok' => false, 'error' => 'Имейлът вече е потвърден.']);
}

$result = email_verification_issue_code($pdo, $userId, $email);
if (!$result['ok']) {
    $reason = (string) ($result['reason'] ?? 'unknown');
    $status = (int) ($result['statusCode'] ?? 500);

    $errorMessage = $result['error'] ?? 'Неуспешно изпращане на код.';
    if ($reason === 'sendFailed') {
        $errorMessage = 'Кодът не можа да бъде изпратен. Опитай отново след няколко минути.';
        $status = 503;
    }

    if ($reason === 'hourlyLimit') {
        $status = 429;
    }

    $payload = [
        'ok' => false,
        'error' => $errorMessage,
    ];

    if (isset($result['cooldownRemaining'])) {
        $payload['cooldownRemaining'] = (int) $result['cooldownRemaining'];
    }

    if (isset($result['retryAfterSeconds'])) {
        $payload['retryAfterSeconds'] = (int) $result['retryAfterSeconds'];
    }

    json_response($status, $payload);
}

json_response(200, [
    'ok' => true,
    'message' => 'Изпратихме нов код за потвърждение.',
]);
