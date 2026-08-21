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
$firstName = trim((string) ($input['firstName'] ?? ''));
$lastName = trim((string) ($input['lastName'] ?? ''));
$email = mb_strtolower(trim((string) ($input['email'] ?? '')));
$password = (string) ($input['password'] ?? '');

if ($firstName === '' || $lastName === '' || $email === '' || $password === '') {
    json_response(422, ['ok' => false, 'error' => 'Всички полета са задължителни.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
}

if (mb_strlen($password) < 8) {
    json_response(422, ['ok' => false, 'error' => 'Паролата трябва да е поне 8 символа.']);
}

$config = require __DIR__ . '/../config.php';
$pdo = db_connection($config);
admin_install_schema($pdo);

$checkStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
$checkStmt->execute(['email' => $email]);
if ($checkStmt->fetch()) {
    json_response(409, ['ok' => false, 'error' => 'Потребител с този имейл вече съществува.']);
}

$passwordHash = password_hash($password, PASSWORD_BCRYPT);

$insertStmt = $pdo->prepare('INSERT INTO users (first_name, last_name, email, password_hash) VALUES (:first_name, :last_name, :email, :password_hash)');
$insertStmt->execute([
    'first_name' => $firstName,
    'last_name' => $lastName,
    'email' => $email,
    'password_hash' => $passwordHash,
]);

$userId = (int) $pdo->lastInsertId();

$profileStmt = $pdo->prepare(
    'INSERT INTO user_profiles (user_id, country)
     VALUES (:user_id, :country)'
);
$profileStmt->execute([
    'user_id' => $userId,
    'country' => 'България',
]);

$_SESSION['user_id'] = $userId;
admin_ensure_user_meta($pdo, $userId);
$meta = admin_get_user_meta($pdo, $userId) ?? [
    'role' => 'user',
    'profileStatus' => 'active',
    'isVerified' => false,
    'lastLoginAt' => null,
];
admin_track_login($pdo, $userId, $email, true);

json_response(201, [
    'ok' => true,
    'user' => [
        'id' => $userId,
        'firstName' => $firstName,
        'lastName' => $lastName,
        'email' => $email,
        'country' => 'България',
        'role' => $meta['role'],
        'profileStatus' => $meta['profileStatus'],
        'isVerified' => $meta['isVerified'],
        'lastLoginAt' => $meta['lastLoginAt'],
    ],
]);
