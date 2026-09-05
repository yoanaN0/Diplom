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

function assert_int_equals(int $expected, int $actual, string $message): void
{
    if ($expected !== $actual) {
        fail($message . ' (expected ' . $expected . ', got ' . $actual . ')');
    }
}

function run_api(string $endpointPath, string $method, int $userId, array $payload = [], array $query = []): array
{
    static $sessionIds = [];

    $runner = __DIR__ . '/test_api_runner.php';
    $payloadArg = base64_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $queryArg = base64_encode(json_encode($query, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $sessionKey = (string) $userId;

    if (!isset($sessionIds[$sessionKey])) {
        $sessionIds[$sessionKey] = substr(bin2hex(random_bytes(16)), 0, 26);
    }

    $command = escapeshellarg(PHP_BINARY)
        . ' '
        . escapeshellarg($runner)
        . ' '
        . escapeshellarg($endpointPath)
        . ' '
        . escapeshellarg(strtoupper($method))
        . ' '
        . escapeshellarg((string) $userId)
        . ' '
        . escapeshellarg($payloadArg)
        . ' '
        . escapeshellarg($queryArg)
        . ' '
        . escapeshellarg($sessionIds[$sessionKey]);

    $output = shell_exec($command);
    if (!is_string($output) || trim($output) === '') {
        fail('No output from API runner for ' . $endpointPath . ' ' . $method);
    }

    $decoded = json_decode($output, true);
    if (!is_array($decoded) || !array_key_exists('status', $decoded) || !array_key_exists('body', $decoded)) {
        fail('Invalid API runner response: ' . $output);
    }

    return $decoded;
}

function create_user(PDO $pdo, string $email): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)'
    );
    $stmt->execute([
        'first_name' => 'Category',
        'last_name' => 'Tester',
        'email' => $email,
        'password_hash' => password_hash('test-pass-123', PASSWORD_BCRYPT),
    ]);

    $userId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO user_profiles (user_id, country) VALUES (:user_id, :country)')
        ->execute(['user_id' => $userId, 'country' => 'България']);

    return $userId;
}

$config = require __DIR__ . '/../api/config.php';
$pdo = db_connection($config);

$createdUserIds = [];

try {
    $email = 'category-seed-test+' . bin2hex(random_bytes(4)) . '@example.com';
    $userId = create_user($pdo, $email);
    $createdUserIds[] = $userId;

    category_seed_default_categories($pdo, $userId);
    category_seed_default_categories($pdo, $userId);

    $stmt = $pdo->prepare(
        'SELECT id, name, category_type, is_builtin
         FROM categories
         WHERE user_id = :user_id
         ORDER BY category_type ASC, name ASC, id ASC'
    );
    $stmt->execute(['user_id' => $userId]);
    $categories = $stmt->fetchAll();

    assert_int_equals(9, count($categories), 'New user should receive 9 default categories without duplicates');

    $expected = [
        'expense' => ['Храна', 'Транспорт', 'Сметки', 'Ресторанти', 'Здраве', 'Пазаруване', 'Други'],
        'income' => ['Заплата', 'Други приходи'],
    ];

    foreach ($categories as $category) {
        $type = (string) ($category['category_type'] ?? '');
        $name = (string) ($category['name'] ?? '');

        assert_true(isset($expected[$type]), 'Unexpected category type returned by seed helper');
        assert_true(in_array($name, $expected[$type], true), 'Unexpected category name returned by seed helper');
        assert_true((int) ($category['is_builtin'] ?? 0) === 0, 'Seeded categories should be editable and deletable');
    }

    $deleteCandidate = $pdo->prepare(
        'SELECT id FROM categories WHERE user_id = :user_id AND name = :name AND category_type = :category_type LIMIT 1'
    );
    $deleteCandidate->execute(['user_id' => $userId, 'name' => 'Храна', 'category_type' => 'expense']);
    $deleteCandidateId = (int) $deleteCandidate->fetchColumn();
    assert_true($deleteCandidateId > 0, 'Candidate category for deletion should exist');

    $deleteResponse = run_api(__DIR__ . '/../api/categories.php', 'DELETE', $userId, ['id' => $deleteCandidateId]);
    assert_true((int) $deleteResponse['status'] === 200, 'Unused category delete should return 200');

    $remainingStmt = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE user_id = :user_id');
    $remainingStmt->execute(['user_id' => $userId]);
    assert_int_equals(8, (int) $remainingStmt->fetchColumn(), 'Deleted category should be removed from user categories');

    $getAfterDelete = run_api(__DIR__ . '/../api/categories.php', 'GET', $userId);
    $returnedIds = array_map(static fn ($item) => (int) ($item['id'] ?? 0), $getAfterDelete['body']['categories'] ?? []);
    assert_true(!in_array($deleteCandidateId, $returnedIds, true), 'Deleted category should not be recreated on GET');

    $usedCategoryStmt = $pdo->prepare(
        'SELECT id FROM categories WHERE user_id = :user_id AND name = :name AND category_type = :category_type LIMIT 1'
    );
    $usedCategoryStmt->execute(['user_id' => $userId, 'name' => 'Транспорт', 'category_type' => 'expense']);
    $usedCategoryId = (int) $usedCategoryStmt->fetchColumn();
    assert_true($usedCategoryId > 0, 'Expense category used for budget should exist');

    $budgetResponse = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'categoryId' => $usedCategoryId,
        'category' => 'Транспорт',
        'limit' => 500,
        'period' => 'monthly',
    ]);
    assert_true((int) $budgetResponse['status'] === 201, 'Budget should be created for a valid expense category');

    $usedDeleteResponse = run_api(__DIR__ . '/../api/categories.php', 'DELETE', $userId, ['id' => $usedCategoryId]);
    assert_true((int) $usedDeleteResponse['status'] === 409, 'Used category delete should return 409');
    assert_true(strpos((string) ($usedDeleteResponse['body']['error'] ?? ''), 'използва') !== false, 'Delete error should explain that the category is in use');

    $stillExistsStmt = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE id = :id AND user_id = :user_id');
    $stillExistsStmt->execute(['id' => $usedCategoryId, 'user_id' => $userId]);
    assert_int_equals(1, (int) $stillExistsStmt->fetchColumn(), 'Used category should stay in the database after failed delete');

    echo "category_defaults_test: OK\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'category_defaults_test: FAIL - ' . $e->getMessage() . "\n");
    exit(1);
} finally {
    foreach ($createdUserIds as $id) {
        $pdo->prepare('DELETE FROM users WHERE id = :id')->execute(['id' => $id]);
    }
}