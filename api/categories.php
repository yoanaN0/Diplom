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

function category_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'category' => $row['name'],
        'categoryType' => $row['category_type'],
        'isBuiltin' => (bool) $row['is_builtin'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function load_category(PDO $pdo, int $userId, int $id): array|false
{
    $stmt = $pdo->prepare('SELECT * FROM categories WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    return $stmt->fetch();
}

function ensure_unique_category(PDO $pdo, int $userId, string $name, string $categoryType, ?int $ignoreId = null): void
{
    $sql = 'SELECT id FROM categories WHERE user_id = :user_id AND name = :name AND category_type = :category_type';
    $params = [
        'user_id' => $userId,
        'name' => $name,
        'category_type' => $categoryType,
    ];

    if ($ignoreId !== null) {
        $sql .= ' AND id <> :ignore_id';
        $params['ignore_id'] = $ignoreId;
    }

    $stmt = $pdo->prepare($sql . ' LIMIT 1');
    $stmt->execute($params);

    if ($stmt->fetch()) {
        json_response(409, ['ok' => false, 'error' => 'Category already exists']);
    }
}

if ($method === 'GET') {
    $id = api_int_or_null($data['id'] ?? null);
    $categoryTypeFilter = api_text($data['type'] ?? $data['categoryType'] ?? '', '');

    if ($id) {
        $category = load_category($pdo, $userId, $id);

        if (!$category) {
            json_response(404, ['ok' => false, 'error' => 'Category not found']);
        }

        json_response(200, ['ok' => true, 'category' => category_payload($category)]);
    }

    $sql = 'SELECT * FROM categories WHERE user_id = :user_id';
    $params = ['user_id' => $userId];

    if ($categoryTypeFilter !== '' && in_array($categoryTypeFilter, ['income', 'expense'], true)) {
        $sql .= ' AND category_type = :category_type';
        $params['category_type'] = $categoryTypeFilter;
    }

    $sql .= ' ORDER BY is_builtin DESC, category_type ASC, name ASC, id ASC';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    json_response(200, ['ok' => true, 'categories' => array_map('category_payload', $stmt->fetchAll())]);
}

if ($method === 'POST') {
    $name = api_text($data['category'] ?? $data['name'] ?? null);
    if ($name === '') {
        json_response(422, ['ok' => false, 'error' => 'Category name is required']);
    }

    $categoryType = api_text($data['categoryType'] ?? $data['category_type'] ?? 'expense', 'expense');
    if (!in_array($categoryType, ['income', 'expense'], true)) {
        $categoryType = 'expense';
    }

    ensure_unique_category($pdo, $userId, $name, $categoryType);

    $stmt = $pdo->prepare(
        'INSERT INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 0)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => $name,
        'category_type' => $categoryType,
    ]);

    $id = (int) $pdo->lastInsertId();
    $category = load_category($pdo, $userId, $id);

    json_response(201, ['ok' => true, 'category' => category_payload($category)]);
}

if ($method === 'PUT') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Category id is required']);
    }

    $existing = load_category($pdo, $userId, $id);
    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Category not found']);
    }

    if ((int) $existing['is_builtin'] === 1) {
        json_response(403, ['ok' => false, 'error' => 'Builtin categories cannot be modified']);
    }

    $name = api_text($data['category'] ?? $data['name'] ?? null, $existing['name']);
    if ($name === '') {
        json_response(422, ['ok' => false, 'error' => 'Category name is required']);
    }

    $categoryType = api_text($data['categoryType'] ?? $data['category_type'] ?? null, $existing['category_type']);
    if (!in_array($categoryType, ['income', 'expense'], true)) {
        $categoryType = $existing['category_type'];
    }

    ensure_unique_category($pdo, $userId, $name, $categoryType, $id);

    $stmt = $pdo->prepare(
        'UPDATE categories
         SET name = :name,
             category_type = :category_type
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'name' => $name,
        'category_type' => $categoryType,
        'id' => $id,
        'user_id' => $userId,
    ]);

    $category = load_category($pdo, $userId, $id);

    json_response(200, ['ok' => true, 'category' => category_payload($category)]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Category id is required']);
    }

    $existing = load_category($pdo, $userId, $id);
    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Category not found']);
    }

    if ((int) $existing['is_builtin'] === 1) {
        json_response(403, ['ok' => false, 'error' => 'Builtin categories cannot be deleted']);
    }

    $stmt = $pdo->prepare('DELETE FROM categories WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true]);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);