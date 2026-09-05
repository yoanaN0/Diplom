<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/api_helpers.php';
require __DIR__ . '/lib/budget_spent.php';

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

function resolve_budget_category(PDO $pdo, int $userId, ?int $categoryId, ?string $categoryName): array
{
    if ($categoryId !== null) {
        $stmt = $pdo->prepare('SELECT * FROM categories WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $categoryId]);
        $category = $stmt->fetch();

        if (!$category) {
            json_response(404, ['ok' => false, 'error' => 'Категорията не беше намерена.']);
        }

        if ((int) $category['user_id'] !== $userId) {
            json_response(404, ['ok' => false, 'error' => 'Категорията не принадлежи на текущия потребител.']);
        }

        if ((string) $category['category_type'] !== 'expense') {
            json_response(422, ['ok' => false, 'error' => 'Само разходна категория може да се използва за бюджет.']);
        }

        return [
            'id' => (int) $category['id'],
            'name' => (string) $category['name'],
        ];
    }

    $name = trim((string) ($categoryName ?? ''));
    if ($name === '') {
        json_response(422, ['ok' => false, 'error' => 'Category is required']);
    }

    $stmt = $pdo->prepare(
        'SELECT * FROM categories WHERE user_id = :user_id AND name = :name AND category_type = :category_type LIMIT 1'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => $name,
        'category_type' => 'expense',
    ]);
    $existing = $stmt->fetch();
    if ($existing) {
        return [
            'id' => (int) $existing['id'],
            'name' => (string) $existing['name'],
        ];
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

    return [
        'id' => (int) $pdo->lastInsertId(),
        'name' => $name,
    ];
}

if ($method === 'GET') {
    $id = api_int_or_null($data['id'] ?? null);

    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $budget = $stmt->fetch();

        if (!$budget) {
            json_response(404, ['ok' => false, 'error' => 'Budget not found']);
        }

        $budget = budget_refresh_spent($pdo, $userId, $budget);

        json_response(200, ['ok' => true, 'budget' => budget_payload($budget)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE user_id = :user_id ORDER BY id DESC');
    $stmt->execute(['user_id' => $userId]);

    $budgets = [];
    foreach ($stmt->fetchAll() as $budget) {
        $budgets[] = budget_payload(budget_refresh_spent($pdo, $userId, $budget));
    }

    json_response(200, ['ok' => true, 'budgets' => $budgets]);
}

if ($method === 'POST') {
    $limit = api_float_or_null($data['limit'] ?? $data['limit_amount'] ?? null);
    $isFixed = api_bool($data['isFixed'] ?? $data['is_fixed'] ?? null, false);
    if (isset($data['type']) && is_string($data['type'])) {
        $isFixed = strtolower(trim($data['type'])) === 'fixed';
    }

    if ($limit === null || $limit <= 0) {
        json_response(422, ['ok' => false, 'error' => 'Limit must be greater than zero']);
    }

    $categoryId = api_int_or_null($data['categoryId'] ?? $data['category_id'] ?? null);
    $resolvedCategory = resolve_budget_category($pdo, $userId, $categoryId, $data['category'] ?? $data['category_name'] ?? null);
    $category = $resolvedCategory['name'];
    $categoryId = (int) $resolvedCategory['id'];

    $stmt = $pdo->prepare(
        'SELECT id FROM budgets
         WHERE user_id = :user_id AND category_id = :category_id AND id <> :ignore_id
         LIMIT 1'
    );
    $stmt->execute([
        'user_id' => $userId,
        'category_id' => $categoryId,
        'ignore_id' => 0,
    ]);

    if ($stmt->fetch()) {
        json_response(409, ['ok' => false, 'error' => 'Вече съществува бюджет за тази категория.']);
    }

    $effectivePeriod = api_text($data['period'] ?? null, 'monthly');
    if (strtolower($effectivePeriod) === 'monthly') {
        $bounds = budget_current_month_bounds();
        $startDate = $bounds['start_date'];
        $endDate = $bounds['end_date'];
    } else {
        $startDate = api_date_or_null($data['startDate'] ?? $data['start_date'] ?? null) ?? date('Y-m-01');
        $endDate = api_date_or_null($data['endDate'] ?? $data['end_date'] ?? null) ?? date('Y-m-t');
    }

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
        'spent_amount' => number_format(0.0, 2, '.', ''),
        'is_fixed' => $isFixed ? 1 : 0,
        'start_date' => $startDate,
        'end_date' => $endDate,
    ]);

    $id = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    $budget = $stmt->fetch();
    $budget = budget_refresh_spent($pdo, $userId, $budget);

    json_response(201, ['ok' => true, 'budget' => budget_payload($budget)]);
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

    $categoryId = api_int_or_null($data['categoryId'] ?? $data['category_id'] ?? null);
    $resolvedCategory = resolve_budget_category(
        $pdo,
        $userId,
        $categoryId,
        $data['category'] ?? $data['category_name'] ?? ($existing['category_name'] ?? null)
    );
    $category = $resolvedCategory['name'];
    $categoryId = (int) $resolvedCategory['id'];
    $limit = api_float_or_null($data['limit'] ?? $data['limit_amount'] ?? null);
    $isFixed = api_bool($data['isFixed'] ?? $data['is_fixed'] ?? null, (bool) (int) $existing['is_fixed']);
    if (isset($data['type']) && is_string($data['type'])) {
        $isFixed = strtolower(trim($data['type'])) === 'fixed';
    }

    $stmt = $pdo->prepare(
        'SELECT id FROM budgets
         WHERE user_id = :user_id AND category_id = :category_id AND id <> :id
         LIMIT 1'
    );
    $stmt->execute([
        'user_id' => $userId,
        'category_id' => $categoryId,
        'id' => $id,
    ]);

    if ($stmt->fetch()) {
        json_response(409, ['ok' => false, 'error' => 'Вече съществува бюджет за тази категория.']);
    }

    $effectivePeriod = api_text($data['period'] ?? null, $existing['period']);
    if (strtolower($effectivePeriod) === 'monthly') {
        $bounds = budget_current_month_bounds();
        $startDate = $bounds['start_date'];
        $endDate = $bounds['end_date'];
    } else {
        $startDate = api_date_or_null($data['startDate'] ?? $data['start_date'] ?? null) ?? ($existing['start_date'] ?: date('Y-m-01'));
        $endDate = api_date_or_null($data['endDate'] ?? $data['end_date'] ?? null) ?? ($existing['end_date'] ?: date('Y-m-t'));
    }

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
        'category_id' => $categoryId,
        'category_name' => $category,
        'period' => $effectivePeriod,
        'limit_amount' => number_format($limit ?? (float) $existing['limit_amount'], 2, '.', ''),
        'spent_amount' => number_format((float) $existing['spent_amount'], 2, '.', ''),
        'is_fixed' => $isFixed ? 1 : 0,
        'start_date' => $startDate,
        'end_date' => $endDate,
        'id' => $id,
        'user_id' => $userId,
    ]);

    $stmt = $pdo->prepare('SELECT * FROM budgets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    $budget = $stmt->fetch();
    $budget = budget_refresh_spent($pdo, $userId, $budget);

    json_response(200, ['ok' => true, 'budget' => budget_payload($budget)]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Budget id is required']);
    }

    $stmt = $pdo->prepare('DELETE FROM budgets WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true]);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);