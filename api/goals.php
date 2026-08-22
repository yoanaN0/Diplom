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

function goal_table_columns(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'goals'"
    );

    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN, 0));
}

function goal_column_exists(PDO $pdo, string $column): bool
{
    return in_array($column, goal_table_columns($pdo), true);
}

function decode_goal_funding_wallets(mixed $value): array
{
    if ($value === null || $value === '') {
        return [];
    }

    $decoded = is_string($value) ? json_decode($value, true) : $value;
    if (!is_array($decoded)) {
        return [];
    }

    $items = [];
    foreach ($decoded as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $walletId = api_int_or_null($entry['walletId'] ?? $entry['wallet_id'] ?? $entry['id'] ?? null);
        $amount = api_float_or_null($entry['amount'] ?? $entry['value'] ?? null);

        if ($walletId === null || $amount === null || $amount <= 0) {
            continue;
        }

        $items[] = [
            'walletId' => $walletId,
            'amount' => number_format($amount, 2, '.', ''),
        ];
    }

    return $items;
}

function encode_goal_funding_wallets(mixed $value): ?string
{
    $normalized = decode_goal_funding_wallets($value);
    if ($normalized === []) {
        return null;
    }

    return json_encode($normalized, JSON_UNESCAPED_UNICODE);
}

function merge_goal_funding_wallets(array $existing, array $incoming): array
{
    $totals = [];

    foreach (array_merge($existing, $incoming) as $entry) {
        $walletId = (int) ($entry['walletId'] ?? $entry['wallet_id'] ?? $entry['id'] ?? 0);
        $amount = (float) ($entry['amount'] ?? $entry['value'] ?? 0.0);

        if ($walletId <= 0 || $amount <= 0) {
            continue;
        }

        $totals[$walletId] = ($totals[$walletId] ?? 0.0) + $amount;
    }

    $merged = [];
    foreach ($totals as $walletId => $amount) {
        $merged[] = [
            'walletId' => $walletId,
            'amount' => number_format($amount, 2, '.', ''),
        ];
    }

    usort($merged, static fn (array $left, array $right): int => ((int) ($left['walletId'] ?? 0)) <=> ((int) ($right['walletId'] ?? 0)));

    return $merged;
}

function goal_payload(array $row): array
{
    $fundingWallets = [];
    foreach (['funding_wallets', 'funding_sources'] as $field) {
        if (isset($row[$field]) && $row[$field] !== null && $row[$field] !== '') {
            $fundingWallets = decode_goal_funding_wallets($row[$field]);
            if ($fundingWallets !== []) {
                break;
            }
        }
    }

    return [
        'id' => (int) $row['id'],
        'title' => $row['title'],
        'target' => (float) $row['target_amount'],
        'saved' => (float) $row['saved_amount'],
        'deadline' => $row['deadline'],
        'status' => $row['status'],
        'fundingWallets' => $fundingWallets,
        'spentAmount' => isset($row['spent_amount']) ? (float) $row['spent_amount'] : 0.0,
        'completedAt' => $row['completed_at'] ?? null,
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

if ($method === 'GET') {
    $id = api_int_or_null($data['id'] ?? null);

    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM goals WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $goal = $stmt->fetch();

        if (!$goal) {
            json_response(404, ['ok' => false, 'error' => 'Goal not found']);
        }

        json_response(200, ['ok' => true, 'goal' => goal_payload($goal)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM goals WHERE user_id = :user_id ORDER BY deadline ASC, id DESC');
    $stmt->execute(['user_id' => $userId]);

    json_response(200, ['ok' => true, 'goals' => array_map('goal_payload', $stmt->fetchAll())]);
}

if ($method === 'POST') {
    $title = api_text($data['title'] ?? null);
    $target = api_float_or_null($data['target'] ?? $data['target_amount'] ?? null);
    $deadline = api_date_or_null($data['deadline'] ?? null);

    if ($title === '') {
        json_response(422, ['ok' => false, 'error' => 'Title is required']);
    }

    if ($target === null || $target <= 0) {
        json_response(422, ['ok' => false, 'error' => 'Target must be greater than zero']);
    }

    if ($deadline === null) {
        json_response(422, ['ok' => false, 'error' => 'Deadline is required']);
    }

    $today = new DateTimeImmutable('today');
    $minimumDeadline = $today->modify('+1 day')->format('Y-m-d');
    if ($deadline < $minimumDeadline) {
        json_response(422, ['ok' => false, 'error' => 'Deadline must be at least 1 day after today']);
    }

    $availableColumns = goal_table_columns($pdo);
    $insertColumns = ['user_id', 'title', 'target_amount', 'saved_amount', 'deadline', 'status'];
    $insertPlaceholders = [':user_id', ':title', ':target_amount', ':saved_amount', ':deadline', ':status'];
    $params = [
        'user_id' => $userId,
        'title' => $title,
        'target_amount' => number_format($target, 2, '.', ''),
        'saved_amount' => number_format(api_float_or_null($data['saved'] ?? $data['saved_amount'] ?? null) ?? 0.0, 2, '.', ''),
        'deadline' => $deadline,
        'status' => api_text($data['status'] ?? null, 'active'),
    ];

    $sourceWalletId = api_int_or_null($data['sourceId'] ?? $data['source_wallet_id'] ?? $data['walletId'] ?? $data['wallet_id'] ?? null);
    $sourceAmount = api_float_or_null($data['amount'] ?? $data['sourceAmount'] ?? $data['source_amount'] ?? null);
    $fundingWallets = decode_goal_funding_wallets($data['fundingWallets'] ?? $data['funding_wallets'] ?? null);

    if ($sourceWalletId !== null && $sourceAmount !== null && $sourceAmount > 0) {
        $fundingWallets[] = ['walletId' => $sourceWalletId, 'amount' => number_format($sourceAmount, 2, '.', '')];
    }

    $fundingWallets = merge_goal_funding_wallets([], $fundingWallets);

    if (in_array('funding_wallets', $availableColumns, true)) {
        $insertColumns[] = 'funding_wallets';
        $insertPlaceholders[] = ':funding_wallets';
        $params['funding_wallets'] = encode_goal_funding_wallets($fundingWallets);
    }

    if (in_array('funding_sources', $availableColumns, true)) {
        $insertColumns[] = 'funding_sources';
        $insertPlaceholders[] = ':funding_sources';
        $params['funding_sources'] = $params['funding_wallets'];
    }

    if (in_array('spent_amount', $availableColumns, true)) {
        $insertColumns[] = 'spent_amount';
        $insertPlaceholders[] = ':spent_amount';
        $params['spent_amount'] = number_format(api_float_or_null($data['spentAmount'] ?? $data['spent_amount'] ?? null) ?? 0.0, 2, '.', '');
    }

    if (in_array('completed_at', $availableColumns, true)) {
        $insertColumns[] = 'completed_at';
        $insertPlaceholders[] = ':completed_at';
        $params['completed_at'] = api_datetime_or_null($data['completedAt'] ?? $data['completed_at'] ?? null);
    }

    $stmt = $pdo->prepare(sprintf(
        'INSERT INTO goals (%s) VALUES (%s)',
        implode(', ', $insertColumns),
        implode(', ', $insertPlaceholders)
    ));
    $stmt->execute($params);

    $id = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM goals WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(201, ['ok' => true, 'goal' => goal_payload($stmt->fetch())]);
}

if ($method === 'PUT') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Goal id is required']);
    }

    $stmt = $pdo->prepare('SELECT * FROM goals WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Goal not found']);
    }

    $title = api_text($data['title'] ?? null, $existing['title']);
    $target = api_float_or_null($data['target'] ?? $data['target_amount'] ?? null);
    $saved = api_float_or_null($data['saved'] ?? $data['saved_amount'] ?? null);
    $deadline = api_date_or_null($data['deadline'] ?? null) ?? $existing['deadline'];
    $spentAmount = api_float_or_null($data['spentAmount'] ?? $data['spent_amount'] ?? null);
    $completedAt = api_datetime_or_null($data['completedAt'] ?? $data['completed_at'] ?? null) ?? (isset($existing['completed_at']) ? $existing['completed_at'] : null);

    $setClauses = [
        'title = :title',
        'target_amount = :target_amount',
        'saved_amount = :saved_amount',
        'deadline = :deadline',
        'status = :status',
    ];
    $params = [
        'title' => $title,
        'target_amount' => number_format($target ?? (float) $existing['target_amount'], 2, '.', ''),
        'saved_amount' => number_format($saved ?? (float) $existing['saved_amount'], 2, '.', ''),
        'deadline' => $deadline,
        'status' => api_text($data['status'] ?? null, $existing['status']),
        'id' => $id,
        'user_id' => $userId,
    ];

    $sourceWalletId = api_int_or_null($data['sourceId'] ?? $data['source_wallet_id'] ?? $data['walletId'] ?? $data['wallet_id'] ?? null);
    $sourceAmount = api_float_or_null($data['amount'] ?? $data['sourceAmount'] ?? $data['source_amount'] ?? null);
    $fundingWallets = decode_goal_funding_wallets($existing['funding_wallets'] ?? $existing['funding_sources'] ?? null);
    $incomingFundingWallets = decode_goal_funding_wallets($data['fundingWallets'] ?? $data['funding_wallets'] ?? null);
    $fundingWallets = merge_goal_funding_wallets($fundingWallets, $incomingFundingWallets);

    if ($sourceWalletId !== null && $sourceAmount !== null && $sourceAmount > 0) {
        $fundingWallets = merge_goal_funding_wallets($fundingWallets, [['walletId' => $sourceWalletId, 'amount' => number_format($sourceAmount, 2, '.', '')]]);
    }

    if (in_array('funding_wallets', goal_table_columns($pdo), true)) {
        $setClauses[] = 'funding_wallets = :funding_wallets';
        $params['funding_wallets'] = encode_goal_funding_wallets($fundingWallets);
    }

    if (in_array('funding_sources', goal_table_columns($pdo), true)) {
        $setClauses[] = 'funding_sources = :funding_sources';
        $params['funding_sources'] = $params['funding_wallets'] ?? null;
    }

    if (in_array('spent_amount', goal_table_columns($pdo), true)) {
        $setClauses[] = 'spent_amount = :spent_amount';
        $params['spent_amount'] = number_format($spentAmount ?? (float) ($existing['spent_amount'] ?? 0), 2, '.', '');
    }

    if (in_array('completed_at', goal_table_columns($pdo), true)) {
        $setClauses[] = 'completed_at = :completed_at';
        $params['completed_at'] = $completedAt;
    }

    $stmt = $pdo->prepare(sprintf(
        'UPDATE goals SET %s WHERE id = :id AND user_id = :user_id',
        implode(', ', $setClauses)
    ));
    $stmt->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM goals WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true, 'goal' => goal_payload($stmt->fetch())]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? $_GET['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Задължително е въвеждането на goal ID']);
    }

    $skipRefund = filter_var($data['skipRefund'] ?? $data['skip_refund'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $refundWalletId = api_int_or_null($data['refundWalletId'] ?? $data['refund_wallet_id'] ?? $_GET['refundWalletId'] ?? null);

    try {
        $pdo->beginTransaction();

        $goalStmt = $pdo->prepare('SELECT id, title, saved_amount, funding_wallets, funding_sources FROM goals WHERE id = :id AND user_id = :user_id LIMIT 1 FOR UPDATE');
        $goalStmt->execute(['id' => $id, 'user_id' => $userId]);
        $goal = $goalStmt->fetch();

        if (!$goal) {
            $pdo->rollBack();
            json_response(404, ['ok' => false, 'error' => 'Целта не е намерена']);
        }

        if (!$skipRefund) {
            $sourceRefunds = [];
            if (in_array('funding_wallets', goal_table_columns($pdo), true) && isset($goal['funding_wallets'])) {
                $sourceRefunds = decode_goal_funding_wallets($goal['funding_wallets']);
            }

            if ($sourceRefunds === []) {
                $sourceRefundStmt = $pdo->prepare(
                    'SELECT wallet_id, ROUND(SUM(amount), 2) AS refund_amount
                     FROM transactions
                     WHERE user_id = :user_id AND goal_id = :goal_id AND wallet_id IS NOT NULL
                     GROUP BY wallet_id'
                );
                $sourceRefundStmt->execute(['user_id' => $userId, 'goal_id' => $id]);
                $sourceRefundRows = $sourceRefundStmt->fetchAll();

                foreach ($sourceRefundRows as $sourceRefund) {
                    $sourceRefunds[] = [
                        'walletId' => (int) $sourceRefund['wallet_id'],
                        'amount' => (float) $sourceRefund['refund_amount'],
                    ];
                }
            }

            foreach ($sourceRefunds as $sourceRefund) {
                $walletId = (int) ($sourceRefund['walletId'] ?? $sourceRefund['wallet_id'] ?? 0);
                $refundAmount = (float) ($sourceRefund['amount'] ?? $sourceRefund['value'] ?? 0.0);

                if ($walletId <= 0 || $refundAmount <= 0) {
                    continue;
                }

                $walletUpdate = $pdo->prepare(
                    'UPDATE wallets
                     SET balance = ROUND(balance + :delta, 2)
                     WHERE id = :wallet_id AND user_id = :user_id'
                );
                $walletUpdate->execute([
                    'delta' => number_format($refundAmount, 2, '.', ''),
                    'wallet_id' => $walletId,
                    'user_id' => $userId,
                ]);
            }

            if ($sourceRefunds === [] && $refundWalletId) {
                $walletStmt = $pdo->prepare('SELECT id, name FROM wallets WHERE id = :id AND user_id = :user_id LIMIT 1');
                $walletStmt->execute(['id' => $refundWalletId, 'user_id' => $userId]);
                $wallet = $walletStmt->fetch();

                if ($wallet) {
                    $walletUpdate = $pdo->prepare(
                        'UPDATE wallets
                         SET balance = ROUND(balance + :delta, 2)
                         WHERE id = :wallet_id AND user_id = :user_id'
                    );
                    $walletUpdate->execute([
                        'delta' => number_format((float) $goal['saved_amount'], 2, '.', ''),
                        'wallet_id' => $refundWalletId,
                        'user_id' => $userId,
                    ]);
                }
            }
        }

        $deleteGoalTx = $pdo->prepare('DELETE FROM transactions WHERE user_id = :user_id AND goal_id = :goal_id');
        $deleteGoalTx->execute(['user_id' => $userId, 'goal_id' => $id]);

        $rowCheck = $pdo->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'goal_movements' LIMIT 1");
        if ($rowCheck && $rowCheck->fetch()) {
            $pdo->prepare('DELETE FROM goal_movements WHERE user_id = :user_id AND goal_id = :goal_id')
                ->execute(['user_id' => $userId, 'goal_id' => $id]);
        }

        $deleteGoal = $pdo->prepare('DELETE FROM goals WHERE id = :id AND user_id = :user_id');
        $deleteGoal->execute(['id' => $id, 'user_id' => $userId]);

        $pdo->commit();
        json_response(200, ['ok' => true]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        json_response(500, ['ok' => false, 'error' => 'Грешка при изтриване: ' . $e->getMessage()]);
    }
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);