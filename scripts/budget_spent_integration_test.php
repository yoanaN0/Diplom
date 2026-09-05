<?php

declare(strict_types=1);

require __DIR__ . '/../api/lib/db.php';

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

function assert_float_equals(float $expected, float $actual, string $message): void
{
    if (abs($expected - $actual) > 0.0001) {
        fail($message . ' (expected ' . $expected . ', got ' . $actual . ')');
    }
}

function run_api(string $endpointPath, string $method, int $userId, array $payload = [], array $query = []): array
{
    $runner = __DIR__ . '/test_api_runner.php';
    $payloadArg = base64_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $queryArg = base64_encode(json_encode($query, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

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
        . escapeshellarg($queryArg);

    $output = shell_exec($command);
    if (!is_string($output) || trim($output) === '') {
        fail('No output from API runner for ' . $endpointPath . ' ' . $method);
    }

    $decoded = json_decode($output, true);
    if (!is_array($decoded) || !array_key_exists('status', $decoded) || !array_key_exists('body', $decoded)) {
        fail('Invalid API runner response: ' . $output);
    }

    if (!is_array($decoded['body'])) {
        $decoded['body'] = ['raw' => $decoded['body']];
    }

    return $decoded;
}

function budget_by_category(array $budgets, int $categoryId): array
{
    foreach ($budgets as $budget) {
        if ((int) ($budget['categoryId'] ?? 0) === $categoryId) {
            return $budget;
        }
    }

    fail('Budget not found for category_id=' . $categoryId);
}

function create_transaction(int $userId, int $walletId, int $categoryId, string $title, float $amount, string $type, string $date, array $extra = []): array
{
    $payload = array_merge([
        'walletId' => $walletId,
        'categoryId' => $categoryId,
        'title' => $title,
        'amount' => $amount,
        'type' => $type,
        'date' => $date,
        'currency' => 'EUR',
    ], $extra);

    $response = run_api(__DIR__ . '/../api/transactions.php', 'POST', $userId, $payload);
    assert_true((int) $response['status'] === 201, 'Transaction POST should return 201');

    return $response['body']['transaction'] ?? [];
}

function get_all_budgets(int $userId): array
{
    $response = run_api(__DIR__ . '/../api/budgets.php', 'GET', $userId, [], []);
    assert_true((int) $response['status'] === 200, 'Budget GET should return 200');

    $budgets = $response['body']['budgets'] ?? [];
    assert_true(is_array($budgets), 'Budget list must be an array');

    return $budgets;
}

$config = require __DIR__ . '/../api/config.php';
$pdo = db_connection($config);

$now = new DateTimeImmutable('now');
$currentMonthDate = $now->format('Y-m-10 12:00:00');
$previousMonthDate = $now->modify('first day of last month')->format('Y-m-10 12:00:00');
$monthStart = $now->format('Y-m-01');
$monthEnd = $now->format('Y-m-t');
$previousMonthStart = $now->modify('first day of last month')->format('Y-m-01');
$previousMonthEnd = $now->modify('last day of last month')->format('Y-m-t');

$testEmail = 'budget-spent-test+' . bin2hex(random_bytes(4)) . '@example.com';
$passwordHash = password_hash('test-pass-123', PASSWORD_BCRYPT);

$userId = 0;

try {
    $insertUser = $pdo->prepare(
        'INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)'
    );
    $insertUser->execute([
        'first_name' => 'Budget',
        'last_name' => 'Tester',
        'email' => $testEmail,
        'password_hash' => $passwordHash,
    ]);
    $userId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO user_profiles (user_id, country) VALUES (:user_id, :country)')
        ->execute(['user_id' => $userId, 'country' => 'BG']);

    $insertWallet = $pdo->prepare(
        'INSERT INTO wallets (user_id, wallet_type, name, balance)
         VALUES (:user_id, :wallet_type, :name, :balance)'
    );
    $insertWallet->execute([
        'user_id' => $userId,
        'wallet_type' => 'cash',
        'name' => 'Test Wallet',
        'balance' => '0.00',
    ]);
    $walletId = (int) $pdo->lastInsertId();

    $insertCategory = $pdo->prepare(
        'INSERT INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 0)'
    );

    $insertCategory->execute(['user_id' => $userId, 'name' => 'Food', 'category_type' => 'expense']);
    $foodCategoryId = (int) $pdo->lastInsertId();

    $insertCategory->execute(['user_id' => $userId, 'name' => 'Transport', 'category_type' => 'expense']);
    $transportCategoryId = (int) $pdo->lastInsertId();

    $insertCategory->execute(['user_id' => $userId, 'name' => 'Savings', 'category_type' => 'expense']);
    $savingsCategoryId = (int) $pdo->lastInsertId();

    $insertCategory->execute(['user_id' => $userId, 'name' => 'Utilities', 'category_type' => 'expense']);
    $utilitiesCategoryId = (int) $pdo->lastInsertId();

    $insertCategory->execute(['user_id' => $userId, 'name' => 'Rollover', 'category_type' => 'expense']);
    $rolloverCategoryId = (int) $pdo->lastInsertId();

    $createFoodBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Food',
        'categoryId' => $foodCategoryId,
        'limit' => 1000,
        'period' => 'monthly',
    ]);
    assert_true((int) $createFoodBudget['status'] === 201, 'Food budget POST should return 201');

    $foodBudgetId = (int) ($createFoodBudget['body']['budget']['id'] ?? 0);
    assert_true($foodBudgetId > 0, 'Food budget id should exist');

    $expenseTx = create_transaction($userId, $walletId, $foodCategoryId, 'Food expense', 50, 'expense', $currentMonthDate);
    $expenseTxId = (int) ($expenseTx['id'] ?? 0);

    $budgets = get_all_budgets($userId);
    assert_float_equals(50.0, (float) budget_by_category($budgets, $foodCategoryId)['spent'], '1) Current month expense should be included in spent');

    create_transaction($userId, $walletId, $foodCategoryId, 'Food income', 90, 'income', $currentMonthDate);
    create_transaction($userId, $walletId, $foodCategoryId, 'Food transfer', 70, 'transfer', $currentMonthDate);
    create_transaction($userId, $walletId, $savingsCategoryId, 'Платени и архивирани: goal', 33, 'expense', $currentMonthDate, [
        'tags' => ['#goal-archive'],
    ]);

    $budgets = get_all_budgets($userId);
    assert_float_equals(50.0, (float) budget_by_category($budgets, $foodCategoryId)['spent'], '2) Income, transfer and savings operations should not be included');

    create_transaction($userId, $walletId, $foodCategoryId, 'Old month expense', 30, 'expense', $previousMonthDate);
    $budgets = get_all_budgets($userId);
    assert_float_equals(50.0, (float) budget_by_category($budgets, $foodCategoryId)['spent'], '3) Previous month expense should not be included in current budget');

    create_transaction($userId, $walletId, $transportCategoryId, 'Transport before budget', 40, 'expense', $currentMonthDate);
    $createTransportBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Transport',
        'categoryId' => $transportCategoryId,
        'limit' => 500,
        'period' => 'monthly',
    ]);
    assert_true((int) $createTransportBudget['status'] === 201, 'Transport budget POST should return 201');

    $budgets = get_all_budgets($userId);
    assert_float_equals(40.0, (float) budget_by_category($budgets, $transportCategoryId)['spent'], '4) Budget created after existing expense should include that expense');

    $updateExpenseAmount = run_api(__DIR__ . '/../api/transactions.php', 'PUT', $userId, [
        'id' => $expenseTxId,
        'amount' => 80,
    ]);
    assert_true((int) $updateExpenseAmount['status'] === 200, 'Transaction amount PUT should return 200');

    $budgets = get_all_budgets($userId);
    assert_float_equals(80.0, (float) budget_by_category($budgets, $foodCategoryId)['spent'], '5) Editing transaction amount should update budget spent');

    $moveCategory = run_api(__DIR__ . '/../api/transactions.php', 'PUT', $userId, [
        'id' => $expenseTxId,
        'categoryId' => $transportCategoryId,
    ]);
    assert_true((int) $moveCategory['status'] === 200, 'Transaction category PUT should return 200');

    $budgets = get_all_budgets($userId);
    assert_float_equals(0.0, (float) budget_by_category($budgets, $foodCategoryId)['spent'], '6) Category change should remove amount from old budget');
    assert_float_equals(120.0, (float) budget_by_category($budgets, $transportCategoryId)['spent'], '6) Category change should add amount to new budget');

    $moveDate = run_api(__DIR__ . '/../api/transactions.php', 'PUT', $userId, [
        'id' => $expenseTxId,
        'date' => $previousMonthDate,
    ]);
    assert_true((int) $moveDate['status'] === 200, 'Transaction date PUT should return 200');

    $budgets = get_all_budgets($userId);
    assert_float_equals(40.0, (float) budget_by_category($budgets, $transportCategoryId)['spent'], '7) Moving date to previous month should remove amount from current budget');

    $transportTxList = run_api(__DIR__ . '/../api/transactions.php', 'GET', $userId, [], []);
    assert_true((int) $transportTxList['status'] === 200, 'Transactions GET should return 200');
    $transportTxId = 0;
    foreach (($transportTxList['body']['transactions'] ?? []) as $tx) {
        if ((string) ($tx['title'] ?? '') === 'Transport before budget') {
            $transportTxId = (int) ($tx['id'] ?? 0);
            break;
        }
    }
    assert_true($transportTxId > 0, 'Transport transaction id should be found');

    $deleteTransport = run_api(__DIR__ . '/../api/transactions.php', 'DELETE', $userId, ['id' => $transportTxId]);
    assert_true((int) $deleteTransport['status'] === 200, 'Transaction DELETE should return 200');

    $budgets = get_all_budgets($userId);
    assert_float_equals(0.0, (float) budget_by_category($budgets, $transportCategoryId)['spent'], '8) Deleting transaction should decrease spent');

    $createUtilitiesBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Utilities',
        'categoryId' => $utilitiesCategoryId,
        'limit' => 300,
        'period' => 'monthly',
    ]);
    assert_true((int) $createUtilitiesBudget['status'] === 201, 'Utilities budget POST should return 201');

    create_transaction($userId, $walletId, $utilitiesCategoryId, 'Utilities old manual', 25, 'expense', $previousMonthDate);

    $budgets = get_all_budgets($userId);
    assert_float_equals(0.0, (float) budget_by_category($budgets, $utilitiesCategoryId)['spent'], '9) Old manual transaction should not increase current budget');

    $insertLegacyBudget = $pdo->prepare(
        'INSERT INTO budgets (user_id, category_id, category_name, period, limit_amount, spent_amount, start_date, end_date)
         VALUES (:user_id, :category_id, :category_name, :period, :limit_amount, :spent_amount, :start_date, :end_date)'
    );
    $insertLegacyBudget->execute([
        'user_id' => $userId,
        'category_id' => $rolloverCategoryId,
        'category_name' => 'Rollover',
        'period' => 'monthly',
        'limit_amount' => '600.00',
        'spent_amount' => '999.00',
        'start_date' => $previousMonthStart,
        'end_date' => $previousMonthEnd,
    ]);
    $rolloverBudgetId = (int) $pdo->lastInsertId();

    create_transaction($userId, $walletId, $rolloverCategoryId, 'Rollover prev month', 70, 'expense', $previousMonthDate);
    create_transaction($userId, $walletId, $rolloverCategoryId, 'Rollover current month', 30, 'expense', $currentMonthDate);

    $budgets = get_all_budgets($userId);
    $rolloverBudget = budget_by_category($budgets, $rolloverCategoryId);
    assert_float_equals(30.0, (float) $rolloverBudget['spent'], '10) Month rollover should compute spent from current month transactions');
    assert_true(($rolloverBudget['startDate'] ?? '') === $monthStart, '10) Month rollover should set startDate to current month start');
    assert_true(($rolloverBudget['endDate'] ?? '') === $monthEnd, '10) Month rollover should set endDate to current month end');

    $duplicateBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Food',
        'categoryId' => $foodCategoryId,
        'limit' => 111,
        'period' => 'monthly',
    ]);
    assert_true((int) $duplicateBudget['status'] === 409, '11) Duplicate budget by category should return 409');

    $newCategoryBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Нов разход',
        'limit' => 250,
        'period' => 'monthly',
    ]);
    assert_true((int) $newCategoryBudget['status'] === 201, '12) New expense category should be created and attached to budget');
    $newCategoryId = (int) ($newCategoryBudget['body']['budget']['categoryId'] ?? 0);
    assert_true($newCategoryId > 0, '12) Created budget should get categoryId for the new expense category');

    $categoryRow = $pdo->prepare('SELECT category_type, user_id FROM categories WHERE id = :id LIMIT 1');
    $categoryRow->execute(['id' => $newCategoryId]);
    $categoryRowData = $categoryRow->fetch();
    assert_true((string) ($categoryRowData['category_type'] ?? '') === 'expense', '12) New category must be created as expense category');
    assert_true((int) ($categoryRowData['user_id'] ?? 0) === $userId, '12) New category must belong to the current user');

    $foreignUserId = 0;
    $foreignUserEmail = 'budget-spent-foreign+' . bin2hex(random_bytes(4)) . '@example.com';
    $insertForeignUser = $pdo->prepare(
        'INSERT INTO users (first_name, last_name, email, password_hash)
         VALUES (:first_name, :last_name, :email, :password_hash)'
    );
    $insertForeignUser->execute([
        'first_name' => 'Foreign',
        'last_name' => 'Tester',
        'email' => $foreignUserEmail,
        'password_hash' => $passwordHash,
    ]);
    $foreignUserId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO user_profiles (user_id, country) VALUES (:user_id, :country)')
        ->execute(['user_id' => $foreignUserId, 'country' => 'BG']);

    $foreignIncomeCategory = $pdo->prepare(
        'INSERT INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 0)'
    );
    $foreignIncomeCategory->execute(['user_id' => $foreignUserId, 'name' => 'Income Foreign', 'category_type' => 'income']);
    $foreignIncomeCategoryId = (int) $pdo->lastInsertId();

    $invalidIncomeBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Income Foreign',
        'categoryId' => $foreignIncomeCategoryId,
        'limit' => 150,
        'period' => 'monthly',
    ]);
    assert_true((int) $invalidIncomeBudget['status'] === 422 || (int) $invalidIncomeBudget['status'] === 404, '13) Income or foreign category should be rejected');

    $foreignExpenseCategory = $pdo->prepare(
        'INSERT INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 0)'
    );
    $foreignExpenseCategory->execute(['user_id' => $foreignUserId, 'name' => 'Foreign Food', 'category_type' => 'expense']);
    $foreignExpenseCategoryId = (int) $pdo->lastInsertId();

    $invalidForeignBudget = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Foreign Food',
        'categoryId' => $foreignExpenseCategoryId,
        'limit' => 175,
        'period' => 'monthly',
    ]);
    assert_true((int) $invalidForeignBudget['status'] === 404, '14) Foreign category should be rejected with 404');

    $moveTargetCategory = $pdo->prepare(
        'INSERT INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 0)'
    );
    $moveTargetCategory->execute(['user_id' => $userId, 'name' => 'Move Target', 'category_type' => 'expense']);
    $moveTargetCategoryId = (int) $pdo->lastInsertId();

    $renameBudget = run_api(__DIR__ . '/../api/budgets.php', 'PUT', $userId, [
        'id' => $foodBudgetId,
        'categoryId' => $moveTargetCategoryId,
        'category' => 'Move Target',
        'limit' => 600,
        'isFixed' => false,
        'period' => 'monthly',
    ]);
    assert_true((int) $renameBudget['status'] === 200, '15) Budget category can be changed through a free categoryId');
    assert_true((int) ($renameBudget['body']['budget']['categoryId'] ?? 0) === $moveTargetCategoryId, '15) Updated budget should carry the new categoryId');

    $deleteBudgetWithoutCategory = run_api(__DIR__ . '/../api/budgets.php', 'POST', $userId, [
        'category' => 'Delete-safe',
        'limit' => 321,
        'period' => 'monthly',
    ]);
    assert_true((int) $deleteBudgetWithoutCategory['status'] === 201, '16) Budget can be created for a new category');
    $deleteBudgetWithoutCategoryId = (int) ($deleteBudgetWithoutCategory['body']['budget']['id'] ?? 0);
    $deleteBudgetWithoutCategoryCategoryId = (int) ($deleteBudgetWithoutCategory['body']['budget']['categoryId'] ?? 0);
    assert_true($deleteBudgetWithoutCategoryCategoryId > 0, '16) New category should be attached to the budget');

    $deleteBudgetResponse = run_api(__DIR__ . '/../api/budgets.php', 'DELETE', $userId, ['id' => $deleteBudgetWithoutCategoryId]);
    assert_true((int) $deleteBudgetResponse['status'] === 200, '17) Budget delete should return 200');

    $categoryAfterDelete = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE id = :id AND user_id = :user_id LIMIT 1');
    $categoryAfterDelete->execute(['id' => $deleteBudgetWithoutCategoryCategoryId, 'user_id' => $userId]);
    assert_true((int) $categoryAfterDelete->fetchColumn() === 1, '17) Deleting a budget should not delete its category');

    $updateLimitOnly = run_api(__DIR__ . '/../api/budgets.php', 'PUT', $userId, [
        'id' => $rolloverBudgetId,
        'limit' => 777,
    ]);
    assert_true((int) $updateLimitOnly['status'] === 200, '18) Limit-only budget update should return 200');
    assert_float_equals(30.0, (float) ($updateLimitOnly['body']['budget']['spent'] ?? -1), '18) Limit-only update should preserve computed spent');

    echo "budget_spent_integration_test: OK\n";
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, 'budget_spent_integration_test: FAIL - ' . $e->getMessage() . "\n");
    exit(1);
} finally {
    if ($userId > 0) {
        $cleanup = $pdo->prepare('DELETE FROM users WHERE id = :id');
        $cleanup->execute(['id' => $userId]);
    }
}
