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

function transaction_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'type' => $row['type'],
        'title' => $row['title'],
        'amount' => (float) $row['amount'],
        'wallet' => $row['wallet_label'],
        'category' => $row['category_label'],
        'note' => $row['note'],
        'tags' => api_tags_to_array($row['tags_text']),
        'receipt' => $row['source_reference'] ?? '',
        'date' => str_replace(' ', 'T', $row['transaction_date']),
        'currency' => $row['currency'],
        'walletId' => $row['wallet_id'] === null ? null : (int) $row['wallet_id'],
        'categoryId' => $row['category_id'] === null ? null : (int) $row['category_id'],
        'goalId' => $row['goal_id'] === null ? null : (int) $row['goal_id'],
        'sourceGoalId' => $row['source_goal_id'] === null ? null : (int) $row['source_goal_id'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function resolve_wallet(PDO $pdo, int $userId, array $data): array
{
    $walletId = api_int_or_null($data['walletId'] ?? $data['wallet_id'] ?? null);
    $walletLabel = api_text($data['wallet'] ?? $data['wallet_label'] ?? null);

    if ($walletId !== null) {
        $stmt = $pdo->prepare('SELECT id, name FROM wallets WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $walletId, 'user_id' => $userId]);
        $wallet = $stmt->fetch();

        if (!$wallet) {
            json_response(422, ['ok' => false, 'error' => 'Wallet not found']);
        }

        return ['id' => (int) $wallet['id'], 'label' => $wallet['name']];
    }

    if ($walletLabel !== '') {
        $stmt = $pdo->prepare('SELECT id, name FROM wallets WHERE user_id = :user_id AND name = :name LIMIT 1');
        $stmt->execute(['user_id' => $userId, 'name' => $walletLabel]);
        $wallet = $stmt->fetch();

        if ($wallet) {
            return ['id' => (int) $wallet['id'], 'label' => $wallet['name']];
        }

        return ['id' => null, 'label' => $walletLabel];
    }

    json_response(422, ['ok' => false, 'error' => 'Wallet is required']);
}

function resolve_category(PDO $pdo, int $userId, array $data): array
{
    $categoryId = api_int_or_null($data['categoryId'] ?? $data['category_id'] ?? null);
    $categoryLabel = api_text($data['category'] ?? $data['category_label'] ?? null);

    if ($categoryId !== null) {
        $stmt = $pdo->prepare('SELECT id, name FROM categories WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $categoryId, 'user_id' => $userId]);
        $category = $stmt->fetch();

        if (!$category) {
            json_response(422, ['ok' => false, 'error' => 'Category not found']);
        }

        return ['id' => (int) $category['id'], 'label' => $category['name']];
    }

    if ($categoryLabel !== '') {
        $stmt = $pdo->prepare('SELECT id, name FROM categories WHERE user_id = :user_id AND name = :name LIMIT 1');
        $stmt->execute(['user_id' => $userId, 'name' => $categoryLabel]);
        $category = $stmt->fetch();

        if ($category) {
            return ['id' => (int) $category['id'], 'label' => $category['name']];
        }

        return ['id' => null, 'label' => $categoryLabel];
    }

    json_response(422, ['ok' => false, 'error' => 'Category is required']);
}

function is_goal_funding_transfer(array $data, string $type, string $categoryLabel, string $title): bool
{
    $normalizedType = strtolower(trim($type));
    if ($normalizedType !== 'transfer') {
        return false;
    }

    $category = strtolower(trim($categoryLabel));
    if ($category !== 'спестяване' && $category !== 'savings') {
        return false;
    }

    $normalizedTitle = strtolower(trim($title));
    if (!str_starts_with($normalizedTitle, 'трансфер към цел:')) {
        $rawTags = $data['tags'] ?? $data['tags_text'] ?? null;
        $tags = is_array($rawTags) ? $rawTags : api_tags_to_array((string) $rawTags);

        foreach ($tags as $tag) {
            $normalizedTag = strtolower(trim((string) $tag));
            if ($normalizedTag === '#goal-funding' || $normalizedTag === '#goal-transfer') {
                return true;
            }
        }

        return false;
    }

    return true;
}

function is_goal_archive_transaction(array $data, string $type, string $categoryLabel, string $title): bool
{
    $normalizedType = strtolower(trim($type));
    if ($normalizedType !== 'expense') {
        return false;
    }

    $category = strtolower(trim($categoryLabel));
    if ($category !== 'спестяване' && $category !== 'savings') {
        return false;
    }

    $normalizedTitle = strtolower(trim($title));
    if (str_starts_with($normalizedTitle, 'платени и архивирани:')) {
        return true;
    }

    $rawTags = $data['tags'] ?? $data['tags_text'] ?? null;
    $tags = is_array($rawTags) ? $rawTags : api_tags_to_array((string) $rawTags);

    foreach ($tags as $tag) {
        $normalizedTag = strtolower(trim((string) $tag));
        if ($normalizedTag === '#goal-archive' || $normalizedTag === '#goal-completed') {
            return true;
        }
    }

    return false;
}

function transaction_wallet_delta(string $type, float $amount): float
{
    $normalizedType = strtolower(trim($type));

    if ($normalizedType === 'income') {
        return $amount;
    }

    if ($normalizedType === 'expense') {
        return -$amount;
    }

    return 0.0;
}

function adjust_wallet_balance(PDO $pdo, int $userId, ?int $walletId, float $delta): void
{
    if ($walletId === null) {
        return;
    }

    $stmt = $pdo->prepare(
        'UPDATE wallets
         SET balance = ROUND(balance + :delta, 2)
         WHERE id = :wallet_id AND user_id = :user_id'
    );
    $stmt->execute([
        'delta' => number_format($delta, 2, '.', ''),
        'wallet_id' => $walletId,
        'user_id' => $userId,
    ]);
}

function reset_monthly_budget_spend(PDO $pdo, int $userId): void
{
    $currentMonth = date('Y-m');
    $monthStart = date('Y-m-01');
    $monthEnd = date('Y-m-t');

    $stmt = $pdo->prepare(
        'SELECT id, start_date, end_date, spent_amount FROM budgets
         WHERE user_id = :user_id'
    );
    $stmt->execute([
        'user_id' => $userId,
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

function is_savings_category(string $categoryName): bool
{
    $normalized = strtolower(trim($categoryName));

    return $normalized === 'спестяване' || $normalized === 'savings';
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
    reset_monthly_budget_spend($pdo, $userId);

    if ($categoryId === null || $categoryName === '') {
        return;
    }

    if (is_savings_category($categoryName)) {
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
         SET spent_amount = :spent_amount, category_name = :category_name
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'spent_amount' => number_format($nextSpent, 2, '.', ''),
        'category_name' => $categoryName,
        'id' => (int) $budget['id'],
        'user_id' => $userId,
    ]);
}

function reverse_budget_spend(PDO $pdo, int $userId, ?int $categoryId, string $categoryName, string $type, float $amount): void
{
    reset_monthly_budget_spend($pdo, $userId);

    if ($categoryId === null || $categoryName === '') {
        return;
    }

    if (is_savings_category($categoryName)) {
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
         SET spent_amount = :spent_amount, category_name = :category_name
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'spent_amount' => number_format($nextSpent, 2, '.', ''),
        'category_name' => $categoryName,
        'id' => (int) $budget['id'],
        'user_id' => $userId,
    ]);
}

if ($method === 'GET') {
    $id = api_int_or_null($data['id'] ?? null);

    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $transaction = $stmt->fetch();

        if (!$transaction) {
            json_response(404, ['ok' => false, 'error' => 'Transaction not found']);
        }

        json_response(200, ['ok' => true, 'transaction' => transaction_payload($transaction)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE user_id = :user_id ORDER BY transaction_date DESC, id DESC');
    $stmt->execute(['user_id' => $userId]);

    json_response(200, ['ok' => true, 'transactions' => array_map('transaction_payload', $stmt->fetchAll())]);
}

if ($method === 'POST') {
    $title = api_text($data['title'] ?? null);
    $amount = api_float_or_null($data['amount'] ?? null);
    $type = api_text($data['type'] ?? 'expense', 'expense');

    if (!in_array($type, ['income', 'expense', 'transfer'], true)) {
        json_response(422, ['ok' => false, 'error' => 'Invalid transaction type']);
    }

    if ($title === '') {
        json_response(422, ['ok' => false, 'error' => 'Title is required']);
    }

    if ($amount === null || $amount <= 0) {
        json_response(422, ['ok' => false, 'error' => 'Amount must be greater than zero']);
    }

    $wallet = resolve_wallet($pdo, $userId, $data);
    $category = resolve_category($pdo, $userId, $data);

    $stmt = $pdo->prepare(
        'INSERT INTO transactions (
            user_id, wallet_id, category_id, goal_id, source_goal_id, type, title, amount, currency,
            wallet_label, category_label, note, tags_text, receipt_raw_text, transaction_date, source_reference
         ) VALUES (
            :user_id, :wallet_id, :category_id, :goal_id, :source_goal_id, :type, :title, :amount, :currency,
            :wallet_label, :category_label, :note, :tags_text, :receipt_raw_text, :transaction_date, :source_reference
         )'
    );
    $stmt->execute([
        'user_id' => $userId,
        'wallet_id' => $wallet['id'],
        'category_id' => $category['id'],
        'goal_id' => api_int_or_null($data['goalId'] ?? $data['goal_id'] ?? null),
        'source_goal_id' => api_int_or_null($data['sourceGoalId'] ?? $data['source_goal_id'] ?? null),
        'type' => $type,
        'title' => $title,
        'amount' => number_format($amount, 2, '.', ''),
        'currency' => api_text($data['currency'] ?? null, 'EUR'),
        'wallet_label' => $wallet['label'],
        'category_label' => $category['label'],
        'note' => api_text($data['note'] ?? null, ''),
        'tags_text' => api_tags_to_text($data['tags'] ?? $data['tags_text'] ?? null),
        'receipt_raw_text' => api_text($data['receiptRawText'] ?? $data['receipt_raw_text'] ?? null, ''),
        'transaction_date' => api_datetime_or_null($data['date'] ?? $data['transaction_date'] ?? null) ?? api_now(),
        'source_reference' => api_text($data['receipt'] ?? $data['source_reference'] ?? null, ''),
    ]);

    $id = (int) $pdo->lastInsertId();
    if (is_goal_funding_transfer($data, $type, $category['label'], $title)) {
        $walletDelta = -((float) $amount);
    } elseif (is_goal_archive_transaction($data, $type, $category['label'], $title)) {
        $walletDelta = 0.0;
    } else {
        $walletDelta = transaction_wallet_delta($type, (float) $amount);
    }

    adjust_wallet_balance($pdo, $userId, $wallet['id'], $walletDelta);
    sync_budget_spend($pdo, $userId, $category['id'], $category['label'], $type, (float) $amount);

    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(201, ['ok' => true, 'transaction' => transaction_payload($stmt->fetch())]);
}

if ($method === 'PUT') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Transaction id is required']);
    }

    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Transaction not found']);
    }

    $title = api_text($data['title'] ?? null, $existing['title']);
    $amount = api_float_or_null($data['amount'] ?? null);
    $type = api_text($data['type'] ?? null, $existing['type']);

    if (!in_array($type, ['income', 'expense', 'transfer'], true)) {
        $type = $existing['type'];
    }

    $wallet = resolve_wallet($pdo, $userId, array_merge($data, ['wallet' => $data['wallet'] ?? $existing['wallet_label']]));
    $category = resolve_category($pdo, $userId, array_merge($data, ['category' => $data['category'] ?? $existing['category_label']]));

    $oldWalletId = $existing['wallet_id'] === null ? null : (int) $existing['wallet_id'];
    $oldAmount = (float) $existing['amount'];
    $oldIsFundingTransfer = is_goal_funding_transfer(['tags' => $existing['tags_text'] ?? ''], (string) $existing['type'], (string) ($existing['category_label'] ?? ''), (string) ($existing['title'] ?? ''));
    $oldIsArchive = is_goal_archive_transaction(['tags' => $existing['tags_text'] ?? ''], (string) $existing['type'], (string) ($existing['category_label'] ?? ''), (string) ($existing['title'] ?? ''));
    $newIsFundingTransfer = is_goal_funding_transfer($data, $type, $category['label'], $title);
    $newIsArchive = is_goal_archive_transaction($data, $type, $category['label'], $title);
    $oldDelta = $oldIsFundingTransfer ? -$oldAmount : ($oldIsArchive ? 0.0 : transaction_wallet_delta((string) $existing['type'], $oldAmount));
    $newAmount = (float) ($amount ?? $oldAmount);
    $newDelta = $newIsFundingTransfer ? -$newAmount : ($newIsArchive ? 0.0 : transaction_wallet_delta($type, $newAmount));

    $stmt = $pdo->prepare(
        'UPDATE transactions
         SET wallet_id = :wallet_id,
             category_id = :category_id,
             goal_id = :goal_id,
             source_goal_id = :source_goal_id,
             type = :type,
             title = :title,
             amount = :amount,
             currency = :currency,
             wallet_label = :wallet_label,
             category_label = :category_label,
             note = :note,
             tags_text = :tags_text,
             receipt_raw_text = :receipt_raw_text,
             transaction_date = :transaction_date,
             source_reference = :source_reference
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'wallet_id' => $wallet['id'],
        'category_id' => $category['id'],
        'goal_id' => api_int_or_null($data['goalId'] ?? $data['goal_id'] ?? null) ?? $existing['goal_id'],
        'source_goal_id' => api_int_or_null($data['sourceGoalId'] ?? $data['source_goal_id'] ?? null) ?? $existing['source_goal_id'],
        'type' => $type,
        'title' => $title,
        'amount' => number_format($newAmount, 2, '.', ''),
        'currency' => api_text($data['currency'] ?? null, $existing['currency']),
        'wallet_label' => $wallet['label'],
        'category_label' => $category['label'],
        'note' => api_text($data['note'] ?? null, $existing['note'] ?? ''),
        'tags_text' => api_tags_to_text($data['tags'] ?? $data['tags_text'] ?? null) ?? $existing['tags_text'],
        'receipt_raw_text' => api_text($data['receiptRawText'] ?? $data['receipt_raw_text'] ?? null, $existing['receipt_raw_text'] ?? ''),
        'transaction_date' => api_datetime_or_null($data['date'] ?? $data['transaction_date'] ?? null) ?? $existing['transaction_date'],
        'source_reference' => api_text($data['receipt'] ?? $data['source_reference'] ?? null, $existing['source_reference'] ?? ''),
        'id' => $id,
        'user_id' => $userId,
    ]);

    if ($oldWalletId !== null && $oldWalletId !== $wallet['id']) {
        adjust_wallet_balance($pdo, $userId, $oldWalletId, -$oldDelta);
    }

    if ($oldWalletId === $wallet['id']) {
        adjust_wallet_balance($pdo, $userId, $wallet['id'], $newDelta - $oldDelta);
    } elseif ($wallet['id'] !== null) {
        adjust_wallet_balance($pdo, $userId, $wallet['id'], $newDelta);
    }

    reverse_budget_spend($pdo, $userId, $existing['category_id'] === null ? null : (int) $existing['category_id'], $existing['category_label'] ?? '', (string) $existing['type'], (float) $existing['amount']);
    sync_budget_spend($pdo, $userId, $category['id'], $category['label'], $type, $newAmount);

    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true, 'transaction' => transaction_payload($stmt->fetch())]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Transaction id is required']);
    }

    $stmt = $pdo->prepare('SELECT * FROM transactions WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Transaction not found']);
    }

    $walletId = $existing['wallet_id'] === null ? null : (int) $existing['wallet_id'];
    $isFundingTransferDelete = is_goal_funding_transfer(['tags' => $existing['tags_text'] ?? ''], (string) $existing['type'], (string) ($existing['category_label'] ?? ''), (string) ($existing['title'] ?? ''));
    $isArchiveDelete = is_goal_archive_transaction(['tags' => $existing['tags_text'] ?? ''], (string) $existing['type'], (string) ($existing['category_label'] ?? ''), (string) ($existing['title'] ?? ''));
    $walletDelta = $isFundingTransferDelete ? -((float) $existing['amount']) : ($isArchiveDelete ? 0.0 : transaction_wallet_delta((string) $existing['type'], (float) $existing['amount']));

    $stmt = $pdo->prepare('DELETE FROM transactions WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    adjust_wallet_balance($pdo, $userId, $walletId, -$walletDelta);
    reverse_budget_spend($pdo, $userId, $existing['category_id'] === null ? null : (int) $existing['category_id'], $existing['category_label'] ?? '', (string) $existing['type'], (float) $existing['amount']);

    json_response(200, ['ok' => true]);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);