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
$code = trim((string) ($input['code'] ?? ''));
$newPassword = (string) ($input['newPassword'] ?? '');
$confirmPassword = (string) ($input['confirmPassword'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
}

if (!preg_match('/^\d{6}$/', $code)) {
    json_response(422, ['ok' => false, 'error' => 'Кодът трябва да съдържа точно 6 цифри.']);
}

if (mb_strlen($newPassword) < 8) {
    json_response(422, ['ok' => false, 'error' => 'Паролата трябва да е поне 8 символа.']);
}

if ($newPassword !== $confirmPassword) {
    json_response(422, ['ok' => false, 'error' => 'Паролите не съвпадат.']);
}

$invalidCodeMessage = 'Кодът е невалиден или изтекъл.';

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);
password_reset_install_schema($pdo);

$stmt = $pdo->prepare(
    'SELECT u.id,
            COALESCE(m.profile_status, "active") AS profile_status,
            COALESCE(m.is_verified, 0) AS is_verified
     FROM users u
     LEFT JOIN user_admin_meta m ON m.user_id = u.id
     WHERE u.email = :email
     LIMIT 1'
);
$stmt->execute(['email' => $email]);
$user = $stmt->fetch();

if (!$user) {
    json_response(422, ['ok' => false, 'error' => $invalidCodeMessage]);
}

$userId = (int) ($user['id'] ?? 0);
if ($userId <= 0) {
    json_response(422, ['ok' => false, 'error' => $invalidCodeMessage]);
}

admin_ensure_user_meta($pdo, $userId);
$profileStatus = strtolower((string) ($user['profile_status'] ?? 'active'));
if (in_array($profileStatus, ['blocked', 'deleted'], true)) {
    json_response(422, ['ok' => false, 'error' => $invalidCodeMessage]);
}

$verifyResult = password_reset_verify_code($pdo, $userId, $code);
if (!($verifyResult['ok'] ?? false)) {
    json_response(422, ['ok' => false, 'error' => $invalidCodeMessage]);
}

$applyResult = password_reset_apply_new_password(
    $pdo,
    $userId,
    (int) ($verifyResult['codeId'] ?? 0),
    $newPassword
);

if (!($applyResult['ok'] ?? false)) {
    json_response(500, ['ok' => false, 'error' => 'Неуспешна смяна на паролата. Опитай отново.']);
}

json_response(200, [
    'ok' => true,
    'message' => 'Паролата е променена успешно. Вече можеш да влезеш в профила си.',
]);