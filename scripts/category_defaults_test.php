<?php

declare(strict_types=1);

require __DIR__ . '/../api/lib/db.php';
require __DIR__ . '/../api/lib/category_defaults.php';

function fail(string $message): void
{
    throw new RuntimeException($message);
}

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fail($message);
    }
}

$config = require __DIR__ . '/../api/config.php';
$pdo = db_connection($config);

$email = 'category-seed-test+' . bin2hex(random_bytes(4)) . '@example.com';
$userId = 0;

try {
    $insertUser = $pdo->prepare(
        'INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)'
    );
    $insertUser->execute([
        'first_name' => 'Category',
        'last_name' => 'Tester',
        'email' => $email,
        'password_hash' => password_hash('test-pass-123', PASSWORD_BCRYPT),
    ]);
    $userId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO user_profiles (user_id, country) VALUES (:user_id, :country)')
        ->execute(['user_id' => $userId, 'country' => 'България']);

    category_seed_default_categories($pdo, $userId);
    category_seed_default_categories($pdo, $userId);

    $stmt = $pdo->prepare(
        'SELECT name, category_type, is_builtin
         FROM categories
         WHERE user_id = :user_id
         ORDER BY category_type ASC, name ASC'
    );
    $stmt->execute(['user_id' => $userId]);
    $categories = $stmt->fetchAll();

    assert_true(count($categories) === 9, 'New user should receive 9 default categories without duplicates');

    $expected = [
        'expense' => ['Храна', 'Транспорт', 'Сметки', 'Ресторанти', 'Здраве', 'Пазаруване', 'Други'],
        'income' => ['Заплата', 'Други приходи'],
    ];

    foreach ($categories as $category) {
        $type = (string) ($category['category_type'] ?? '');
        $name = (string) ($category['name'] ?? '');

        assert_true(isset($expected[$type]), 'Unexpected category type returned by seed helper');
        assert_true(in_array($name, $expected[$type], true), 'Unexpected category name returned by seed helper');
        assert_true((int) ($category['is_builtin'] ?? 0) === 1, 'Seeded category should be builtin');
    }

    echo "category_defaults_test: OK\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'category_defaults_test: FAIL - ' . $e->getMessage() . "\n");
    exit(1);
} finally {
    if ($userId > 0) {
        $pdo->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $userId]);
    }
}