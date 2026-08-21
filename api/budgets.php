<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/api_helpers.php';

$method = api_method();
$pdo = api_pdo();
$userId = api_user_id();
$data = api_request_data();

function budget_payload(array $row): array
{
    $isFixed = isset($row['is_fixed']) ? (bool) (int) $row['is_fixed'] : false;

    return [
        'id' => (int) $row['id'],
        'category' => $row['category_name'],
        'limit' => (float) $row['limit_amount'],
        'spent' => (float) $row['spent_amount'],
        'period' => $row['period'],
        'startDate' => $row['start_date'],
        'endDate' => $row['end_date'],
        'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
        'isFixed' => $isFixed,
        'type' => $isFixed ? 'fixed' : 'variable',
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function reset_monthly_budget_spend(PDO $pdo, int $userId): void
{
    $currentMonth = date('Y-m');
    $monthStart = date('Y-m-01');
    $monthEnd = date('Y-m-t');

    $stmt = $pdo->prepare(
        'SELECT id, start_date, end_date, spent_amount FROM budgets
         WHERE user_id = :user_id AND period = :period'
    );
    $stmt->execute([
        'user_id' => $userId,
        'period' => 'monthly',
    ]);

    foreach ($stmt->fetchAll() as $budget) {
        $startDate = $budget['start_date'];
        $endDate = $budget['end_date'];

        if ($startDate === null && $endDate === null) {
            $pdo->prepare(
                'UPDATE budgets
                 SET start_date = :start_date,
                     end_date = :end_date
                 WHERE id = :id AND user_id = :user_id'
            )->execute([
                'start_date' => $monthStart,
                'end_date' => $monthEnd,
                'id' => (int) $budget['id'],
                'user_id' => $userId,
            ]);
            continue;
        }

        $budgetMonth = $startDate ? date('Y-m', strtotime($startDate)) : $currentMonth;
        if ($budgetMonth === $currentMonth) {
            continue;
        }

        $pdo->prepare(
            'UPDATE budgets
             SET spent_amount = 0.00,
                 start_date = :start_date,
                 end_date = :end_date
             WHERE id = :id AND user_id = :user_id'
        )->execute([
            'start_date' => $monthStart,
            'end_date' => $monthEnd,
            'id' => (int) $budget['id'],
            'user_id' => $userId,
        ]);
    }
}

function ensure_budget_category(PDO $pdo, int $userId, string $name): int
{
    $stmt = $pdo->prepare(
        'SELECT id FROM categories WHERE user_id = :user_id AND name = :name AND category_type = :category_type LIMIT 1'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => $name,
        'category_type' => 'expense',
    ]);

    $existing = $stmt->fetch();
    if ($existing) {
        return (int) $existing['id'];
    }

    $stmt = $pdo->prepare(
        'INSERT INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 0)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => $name,
        'category_type' => 'expense',
    ]);

    return (int) $pdo->lastInsertId();
}

function budget_expense_delta(string $type, float $amount): float
{
    $normalizedType = strtolower(trim($type));
    if ($normalizedType !== 'expense') {
        return 0.0;
    }

    return $amount;
}

function sync_budget_spend(PDO $pdo, int $userId, ?int $categoryId, string $categoryName, string $type, float $amount): void
{
    if ($categoryId === null || $categoryName === '') {
        return;
    }

    $delta = budget_expense_delta($type, $amount);
    if ($delta <= 0) {
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT id, category_name, spent_amount FROM budgets
         WHERE user_id = :user_id AND category_id = :category_id LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId, 'category_id' => $categoryId]);
    $budget = $stmt->fetch();

    if (!$budget) {
        $stmt = $pdo->prepare(
            'INSERT INTO budgets (user_id, category_id, category_name, period, limit_amount, spent_amount, start_date, end_date)
             VALUES (:user_id, :category_id, :category_name, :period, :limit_amount, :spent_amount, :start_date, :end_date)'
        );
        $stmt->execute([
            'user_id' => $userId,
            'category_id' => $categoryId,
            'category_name' => $categoryName,
            'period' => 'monthly',
            'limit_amount' => 0,
            'spent_amount' => number_format($delta, 2, '.', ''),
            'start_date' => null,
            'end_date' => null,
        ]);
        return;
    }

    $nextSpent = (float) $budget['spent_amount'] + $delta;
    $stmt = $pdo->prepare(
        'UPDATE budgets
         SET spent_amount = :spent_amount
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'spent_amount' => number_format($nextSpent, 2, '.', ''),
        'id' => (int) $budget['id'],
        'user_id' => $userId,
    ]);
}

function reverse_budget_spend(PDO $pdo, int $userId, ?int $categoryId, string $categoryName, string $type, float $amount): void
{
    if ($categoryId === null || $categoryName === '') {
        return;
    }

    $delta = budget_expense_delta($type, $amount);
    if ($delta <= 0) {
        return;
    }

    $stmt = $pdo->prepare(
        'SELECT id, spent_amount FROM budgets
         WHERE user_id = :user_id AND category_id = :category_id LIMIT 1'
    );
    $stmt->execute(['user_id' => $userId, 'category_id' => $categoryId]);
    $budget = $stmt->fetch();

    if (!$budget) {
        return;
    }

    $nextSpent = max(0.0, (float) $budget['spent_amount'] - $delta);
    $stmt = $pdo->prepare(
        'UPDATE budgets
         SET spent_amount = :spent_amount
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'spent_amount' => number_format($nextSpent, 2, '.', ''),
        'id' => (int) $budget['id'],
        'user_id' => $userId,
    ]);
}

if ($method === 'GET') {
    reset_monthly_budget_spend($pdo, $userId);

    $id = api_int_or_null($data['id'] ?? null);

    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $budget = $stmt->fetch();

        if (!$budget) {
            json_response(404, ['ok' => false, 'error' => 'Budget not found']);
        }

        json_response(200, ['ok' => true, 'budget' => budget_payload($budget)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE user_id = :user_id ORDER BY id DESC');
    $stmt->execute(['user_id' => $userId]);

    json_response(200, ['ok' => true, 'budgets' => array_map('budget_payload', $stmt->fetchAll())]);
}

if ($method === 'POST') {
    $category = api_text($data['category'] ?? $data['category_name'] ?? null);
    $limit = api_float_or_null($data['limit'] ?? $data['limit_amount'] ?? null);
    $isFixed = api_bool($data['isFixed'] ?? $data['is_fixed'] ?? null, false);
    if (isset($data['type']) && is_string($data['type'])) {
        $isFixed = strtolower(trim($data['type'])) === 'fixed';
    }

    if ($category === '') {
        json_response(422, ['ok' => false, 'error' => 'Category is required']);
    }

    if ($limit === null || $limit <= 0) {
        json_response(422, ['ok' => false, 'error' => 'Limit must be greater than zero']);
    }

    $categoryId = api_int_or_null($data['categoryId'] ?? $data['category_id'] ?? null);
    if ($categoryId === null) {
        $categoryId = ensure_budget_category($pdo, $userId, $category);
    } else {
        $stmt = $pdo->prepare('SELECT id FROM categories WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $categoryId, 'user_id' => $userId]);

        if (!$stmt->fetch()) {
            $categoryId = ensure_budget_category($pdo, $userId, $category);
        }
    }

    $effectivePeriod = api_text($data['period'] ?? null, 'monthly');
    $startDate = api_date_or_null($data['startDate'] ?? $data['start_date'] ?? null) ?? date('Y-m-01');
    $endDate = api_date_or_null($data['endDate'] ?? $data['end_date'] ?? null) ?? date('Y-m-t');

    $stmt = $pdo->prepare(
        'INSERT INTO budgets (user_id, category_id, category_name, period, limit_amount, spent_amount, is_fixed, start_date, end_date)
         VALUES (:user_id, :category_id, :category_name, :period, :limit_amount, :spent_amount, :is_fixed, :start_date, :end_date)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'category_id' => $categoryId,
        'category_name' => $category,
        'period' => $effectivePeriod,
        'limit_amount' => number_format($limit, 2, '.', ''),
        'spent_amount' => number_format(api_float_or_null($data['spent'] ?? $data['spent_amount'] ?? null) ?? 0.0, 2, '.', ''),
        'is_fixed' => $isFixed ? 1 : 0,
        'start_date' => $startDate,
        'end_date' => $endDate,
    ]);

    $id = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(201, ['ok' => true, 'budget' => budget_payload($stmt->fetch())]);
}

if ($method === 'PUT') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Budget id is required']);
    }

    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Budget not found']);
    }

    $category = api_text($data['category'] ?? $data['category_name'] ?? null, $existing['category_name']);
    $limit = api_float_or_null($data['limit'] ?? $data['limit_amount'] ?? null);
    $spent = api_float_or_null($data['spent'] ?? $data['spent_amount'] ?? null);
    $isFixed = api_bool($data['isFixed'] ?? $data['is_fixed'] ?? null, (bool) (int) $existing['is_fixed']);
    if (isset($data['type']) && is_string($data['type'])) {
        $isFixed = strtolower(trim($data['type'])) === 'fixed';
    }

    $categoryId = api_int_or_null($data['categoryId'] ?? $data['category_id'] ?? null);
    if ($categoryId === null) {
        $categoryId = ensure_budget_category($pdo, $userId, $category);
    } else {
        $stmt = $pdo->prepare('SELECT id FROM categories WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $categoryId, 'user_id' => $userId]);

        if (!$stmt->fetch()) {
            $categoryId = ensure_budget_category($pdo, $userId, $category);
        }
    }

    $effectivePeriod = api_text($data['period'] ?? null, $existing['period']);
    $startDate = api_date_or_null($data['startDate'] ?? $data['start_date'] ?? null) ?? ($existing['start_date'] ?: date('Y-m-01'));
    $endDate = api_date_or_null($data['endDate'] ?? $data['end_date'] ?? null) ?? ($existing['end_date'] ?: date('Y-m-t'));

    $stmt = $pdo->prepare(
        'UPDATE budgets
         SET category_id = :category_id,
             category_name = :category_name,
             period = :period,
             limit_amount = :limit_amount,
             spent_amount = :spent_amount,
             is_fixed = :is_fixed,
             start_date = :start_date,
             end_date = :end_date
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'category_id' => $categoryId ?? $existing['category_id'],
        'category_name' => $category,
        'period' => $effectivePeriod,
        'limit_amount' => number_format($limit ?? (float) $existing['limit_amount'], 2, '.', ''),
        'spent_amount' => number_format($spent ?? (float) $existing['spent_amount'], 2, '.', ''),
        'is_fixed' => $isFixed ? 1 : 0,
        'start_date' => $startDate,
        'end_date' => $endDate,
        'id' => $id,
        'user_id' => $userId,
    ]);

    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true, 'budget' => budget_payload($stmt->fetch())]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Budget id is required']);
    }

    $stmt = $pdo->prepare('SELECT category_id FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $budget = $stmt->fetch();
    $categoryId = $budget['category_id'] ?? null;

    $stmt = $pdo->prepare('DELETE FROM budgets WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($categoryId !== null && $categoryId !== '') {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM budgets WHERE user_id = :user_id AND category_id = :category_id');
        $stmt->execute(['user_id' => $userId, 'category_id' => $categoryId]);
        $remainingBudgets = (int) $stmt->fetchColumn();

        if ($remainingBudgets === 0) {
            $stmt = $pdo->prepare('SELECT is_builtin FROM categories WHERE id = :id AND user_id = :user_id LIMIT 1');
            $stmt->execute(['id' => $categoryId, 'user_id' => $userId]);
            $category = $stmt->fetch();

            if ($category && (int) $category['is_builtin'] === 0) {
                $pdo->prepare('DELETE FROM categories WHERE id = :id AND user_id = :user_id')->execute([
                    'id' => $categoryId,
                    'user_id' => $userId,
                ]);
            }
        }
    }

    json_response(200, ['ok' => true]);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);