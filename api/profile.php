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

if ($firstName === '' || $lastName === '') {
    json_response(422, ['ok' => false, 'error' => 'Името и фамилията са задължителни.']);
}

$updateUser = $pdo->prepare('UPDATE users SET first_name = :first_name, last_name = :last_name WHERE id = :id');
$updateUser->execute([
    'first_name' => $firstName,
    'last_name' => $lastName,
    'id' => $userId,
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
