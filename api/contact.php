<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$input = read_json_body();
$name = trim((string) ($input['name'] ?? ''));
$email = mb_strtolower(trim((string) ($input['email'] ?? '')));
$message = trim((string) ($input['message'] ?? ''));

if ($name === '' || $email === '' || $message === '') {
    json_response(422, ['ok' => false, 'error' => 'Всички полета са задължителни.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
}

$config = require __DIR__ . '/config.php';
$pdo = db_connection($config);

$stmt = $pdo->prepare(
    'INSERT INTO contact_messages (name, email, message, status)
     VALUES (:name, :email, :message, :status)'
);
$stmt->execute([
    'name' => $name,
    'email' => $email,
    'message' => $message,
    'status' => 'new',
]);

json_response(201, ['ok' => true]);
