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

function wallet_payload(array $row): array
{
    $updatedAt = $row['updated_at'] ?? null;
    $lastSync = $row['last_sync_at'] ?? null;

    return [
        'id' => (int) $row['id'],
        'walletType' => $row['wallet_type'],
        'name' => $row['name'],
        'balance' => (float) $row['balance'],
        'bank' => $row['bank_name'] ?? '',
        'account' => $row['account_mask'] ?? '',
        'status' => $row['sync_status'] ?? null,
        'lastSync' => $lastSync ? str_replace(' ', 'T', (string) $lastSync) : null,
        'daysToReconnect' => $row['reconnect_in_days'] ?? null,
        'isActive' => (bool) ($row['is_active'] ?? true),
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $updatedAt ? str_replace(' ', 'T', (string) $updatedAt) : null,
    ];
}

if ($method === 'GET') {
    $id = api_int_or_null($data['id'] ?? null);

    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM wallets WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $wallet = $stmt->fetch();

        if (!$wallet) {
            json_response(404, ['ok' => false, 'error' => 'Wallet not found']);
        }

        json_response(200, ['ok' => true, 'wallet' => wallet_payload($wallet)]);
    }

    $stmt = $pdo->prepare('SELECT * FROM wallets WHERE user_id = :user_id ORDER BY wallet_type, name');
    $stmt->execute(['user_id' => $userId]);

    $wallets = array_map('wallet_payload', $stmt->fetchAll());
    json_response(200, ['ok' => true, 'wallets' => $wallets]);
}

if ($method === 'POST') {
    $name = api_text($data['name'] ?? null);
    if ($name === '') {
        json_response(422, ['ok' => false, 'error' => 'Wallet name is required']);
    }

    $walletType = api_text($data['walletType'] ?? $data['wallet_type'] ?? 'cash', 'cash');
    if (!in_array($walletType, ['cash', 'bank'], true)) {
        $walletType = 'cash';
    }

    $balance = api_float_or_null($data['balance'] ?? null) ?? 0.0;
    $bankName = api_text($data['bank'] ?? $data['bank_name'] ?? null, '');
    $accountMask = api_text($data['account'] ?? $data['account_mask'] ?? null, '');
    $syncStatus = api_text($data['status'] ?? $data['syncStatus'] ?? null, '');
    $lastSync = api_datetime_or_null($data['lastSync'] ?? $data['last_sync_at'] ?? null);
    $isActive = api_bool($data['isActive'] ?? $data['is_active'] ?? true, true);
    $stmt = $pdo->prepare(
        'INSERT INTO wallets (user_id, wallet_type, name, balance, bank_name, account_mask, sync_status, last_sync_at, reconnect_in_days, is_active)
         VALUES (:user_id, :wallet_type, :name, :balance, :bank_name, :account_mask, :sync_status, :last_sync_at, :reconnect_in_days, :is_active)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'wallet_type' => $walletType,
        'name' => $name,
        'balance' => number_format($balance, 2, '.', ''),
        'bank_name' => $bankName !== '' ? $bankName : null,
        'account_mask' => $accountMask !== '' ? $accountMask : null,
        'sync_status' => $syncStatus !== '' ? $syncStatus : null,
        'last_sync_at' => $lastSync,
        'reconnect_in_days' => null,
        'is_active' => $isActive ? 1 : 0,
    ]);

    $walletId = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM wallets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $walletId, 'user_id' => $userId]);

    json_response(201, ['ok' => true, 'wallet' => wallet_payload($stmt->fetch())]);
}

if ($method === 'PUT') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Wallet id is required']);
    }

    $stmt = $pdo->prepare('SELECT * FROM wallets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();
    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Wallet not found']);
    }

    $name = api_text($data['name'] ?? null, $existing['name']);
    $walletType = api_text($data['walletType'] ?? $data['wallet_type'] ?? null, $existing['wallet_type']);
    if (!in_array($walletType, ['cash', 'bank'], true)) {
        $walletType = $existing['wallet_type'];
    }

    $balance = api_float_or_null($data['balance'] ?? null);
    $bankName = api_text($data['bank'] ?? $data['bank_name'] ?? null, $existing['bank_name'] ?? '');
    $accountMask = api_text($data['account'] ?? $data['account_mask'] ?? null, $existing['account_mask'] ?? '');
    $syncStatus = api_text($data['status'] ?? $data['syncStatus'] ?? null, (string) ($existing['sync_status'] ?? ''));
    $lastSync = api_datetime_or_null($data['lastSync'] ?? $data['last_sync_at'] ?? null) ?? $existing['last_sync_at'] ?? null;
    $isActive = api_bool($data['isActive'] ?? $data['is_active'] ?? null, (bool) ($existing['is_active'] ?? true));
    $stmt = $pdo->prepare(
        'UPDATE wallets
         SET wallet_type = :wallet_type,
             name = :name,
             balance = :balance,
             bank_name = :bank_name,
             account_mask = :account_mask,
             sync_status = :sync_status,
             last_sync_at = :last_sync_at,
             reconnect_in_days = :reconnect_in_days,
             is_active = :is_active
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'wallet_type' => $walletType,
        'name' => $name,
        'balance' => number_format($balance ?? (float) ($existing['balance'] ?? 0), 2, '.', ''),
        'bank_name' => $bankName !== '' ? $bankName : null,
        'account_mask' => $accountMask !== '' ? $accountMask : null,
        'sync_status' => $syncStatus !== '' ? $syncStatus : null,
        'last_sync_at' => $lastSync,
        'reconnect_in_days' => $existing['reconnect_in_days'] ?? null,
        'is_active' => $isActive ? 1 : 0,
        'id' => $id,
        'user_id' => $userId,
    ]);

    $stmt = $pdo->prepare('SELECT * FROM wallets WHERE id = :id AND user_id = :user_id LIMIT 1');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true, 'wallet' => wallet_payload($stmt->fetch())]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Wallet id is required']);
    }

    $stmt = $pdo->prepare('DELETE FROM wallets WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true]);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);