<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/db.php';

if (in_array(($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'PUT'], true) === false) {
    json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
}

$config = require __DIR__ . '/config.php';
$pdo = db_connection($config);

function load_profile(PDO $pdo, int $userId): array|false
{
    $stmt = $pdo->prepare(
        'SELECT u.id, u.first_name, u.last_name, u.email, p.phone, p.birth_date, p.city, p.country
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.id = :id
         LIMIT 1'
    );
    $stmt->execute(['id' => $userId]);

    return $stmt->fetch();
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $user = load_profile($pdo, $userId);

    if (!$user) {
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
        ],
    ]);
}

$input = read_json_body();
$firstName = trim((string) ($input['firstName'] ?? ''));
$lastName = trim((string) ($input['lastName'] ?? ''));
$email = mb_strtolower(trim((string) ($input['email'] ?? '')));
$phone = trim((string) ($input['phone'] ?? ''));
$birthDate = trim((string) ($input['birthDate'] ?? ''));
$city = trim((string) ($input['city'] ?? ''));
$country = trim((string) ($input['country'] ?? 'България'));

if ($firstName === '' || $lastName === '' || $email === '') {
    json_response(422, ['ok' => false, 'error' => 'Името, фамилията и имейлът са задължителни.']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(422, ['ok' => false, 'error' => 'Невалиден имейл адрес.']);
}

$checkStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email AND id <> :id LIMIT 1');
$checkStmt->execute(['email' => $email, 'id' => $userId]);
if ($checkStmt->fetch()) {
    json_response(409, ['ok' => false, 'error' => 'Потребител с този имейл вече съществува.']);
}

$updateUser = $pdo->prepare('UPDATE users SET first_name = :first_name, last_name = :last_name, email = :email WHERE id = :id');
$updateUser->execute([
    'first_name' => $firstName,
    'last_name' => $lastName,
    'email' => $email,
    'id' => $userId,
]);

$updateProfile = $pdo->prepare(
    'INSERT INTO user_profiles (user_id, phone, birth_date, city, country)
     VALUES (:user_id, :phone, :birth_date, :city, :country)
     ON DUPLICATE KEY UPDATE
        phone = VALUES(phone),
        birth_date = VALUES(birth_date),
        city = VALUES(city),
        country = VALUES(country)'
);
$updateProfile->execute([
    'user_id' => $userId,
    'phone' => $phone !== '' ? $phone : null,
    'birth_date' => $birthDate !== '' ? $birthDate : null,
    'city' => $city !== '' ? $city : null,
    'country' => $country !== '' ? $country : 'България',
]);

$user = load_profile($pdo, $userId);

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
    ],
]);
