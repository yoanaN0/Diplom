<?php

declare(strict_types=1);

require __DIR__ . '/../bootstrap.php';
require __DIR__ . '/../lib/response.php';
require __DIR__ . '/../lib/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
}

$input = read_json_body();
$currentPassword = (string) ($input['currentPassword'] ?? '');
$nextPassword = (string) ($input['nextPassword'] ?? '');

if ($currentPassword === '' || $nextPassword === '') {
    json_response(422, ['ok' => false, 'error' => 'Текущата и новата парола са задължителни.']);
}

if (mb_strlen($nextPassword) < 8) {
    json_response(422, ['ok' => false, 'error' => 'Новата парола трябва да е поне 8 символа.']);
}

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);

$stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
$stmt->execute(['id' => $userId]);
$user = $stmt->fetch();

if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
    json_response(401, ['ok' => false, 'error' => 'Невалидна текуща парола.']);
}

$updateStmt = $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
$updateStmt->execute([
    'password_hash' => password_hash($nextPassword, PASSWORD_BCRYPT),
    'id' => $userId,
]);

json_response(200, ['ok' => true]);
