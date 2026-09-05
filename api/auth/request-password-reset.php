<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/admin_helpers.php';
require __DIR__ . '/../lib/password_reset.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$input = read_json_body();
$email = mb_strtolower(trim((string) ($input['email'] ?? '')));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
}

$publicMessage = 'Ако има профил с този имейл, ще получиш код за възстановяване.';

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);
password_reset_install_schema($pdo);

$stmt = $pdo->prepare(
    'SELECT u.id, u.email,
            COALESCE(m.profile_status, "active") AS profile_status
     FROM users u
     LEFT JOIN user_admin_meta m ON m.user_id = u.id
     WHERE u.email = :email
     LIMIT 1'
);
$stmt->execute(['email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    json_response(200, ['ok' => true, 'message' => $publicMessage]);
}

$userId = (int) ($user['id'] ?? 0);
if ($userId <= 0) {
    json_response(200, ['ok' => true, 'message' => $publicMessage]);
}

admin_ensure_user_meta($pdo, $userId);
$profileStatus = strtolower((string) ($user['profile_status'] ?? 'active'));
if (in_array($profileStatus, ['blocked', 'deleted'], true)) {
    json_response(200, ['ok' => true, 'message' => $publicMessage]);
}

$issueResult = password_reset_issue_code($pdo, $userId, $email, 10, 60);
if (!($issueResult['ok'] ?? false)) {
    json_response(200, ['ok' => true, 'message' => $publicMessage]);
}

json_response(200, ['ok' => true, 'message' => $publicMessage]);