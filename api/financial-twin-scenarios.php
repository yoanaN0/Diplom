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

function twin_scenario_decode_payload(?string $raw): array
{
    if ($raw === null || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function twin_scenario_payload(array $row): array
{
    $decoded = twin_scenario_decode_payload($row['modifiers_text'] ?? null);

    $draft = [];
    $modifiers = [];

    if (array_key_exists('draft', $decoded) || array_key_exists('modifiers', $decoded)) {
        $draft = is_array($decoded['draft'] ?? null) ? $decoded['draft'] : [];
        $modifiers = is_array($decoded['modifiers'] ?? null) ? $decoded['modifiers'] : [];
    } else {
        // Backward compatibility: old rows may contain modifiers only.
        $modifiers = $decoded;
    }

    return [
        'id' => (int) $row['id'],
        'name' => $row['name'] ?? '',
        'horizonMonths' => (int) $row['horizon_months'],
        'draft' => $draft,
        'modifiers' => $modifiers,
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function twin_scenario_encode_payload(array $draft, array $modifiers): string
{
    return json_encode([
        'draft' => $draft,
        'modifiers' => $modifiers,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
}

if ($method === 'GET') {
    $id = api_int_or_null($data['id'] ?? null);

    if ($id) {
        $stmt = $pdo->prepare(
            'SELECT id, user_id, name, horizon_months, modifiers_text, created_at, updated_at
             FROM financial_twin_scenarios
             WHERE id = :id AND user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $scenario = $stmt->fetch();

        if (!$scenario) {
            json_response(404, ['ok' => false, 'error' => 'Scenario not found']);
        }

        json_response(200, ['ok' => true, 'scenario' => twin_scenario_payload($scenario)]);
    }

    $stmt = $pdo->prepare(
        'SELECT id, user_id, name, horizon_months, modifiers_text, created_at, updated_at
         FROM financial_twin_scenarios
         WHERE user_id = :user_id
         ORDER BY updated_at DESC, id DESC'
    );
    $stmt->execute(['user_id' => $userId]);

    json_response(200, [
        'ok' => true,
        'scenarios' => array_map('twin_scenario_payload', $stmt->fetchAll()),
    ]);
}

if ($method === 'POST') {
    $name = api_text($data['name'] ?? null);
    if ($name === '') {
        json_response(422, ['ok' => false, 'error' => 'Scenario name is required']);
    }

    $horizonMonths = api_int_or_null($data['horizonMonths'] ?? $data['horizon_months'] ?? null);
    $horizonMonths = $horizonMonths === null ? 12 : max(1, min(120, $horizonMonths));

    $draft = is_array($data['draft'] ?? null) ? $data['draft'] : [];
    $modifiers = is_array($data['modifiers'] ?? null) ? $data['modifiers'] : [];

    $stmt = $pdo->prepare(
        'INSERT INTO financial_twin_scenarios (user_id, name, horizon_months, modifiers_text)
         VALUES (:user_id, :name, :horizon_months, :modifiers_text)'
    );
    $stmt->execute([
        'user_id' => $userId,
        'name' => mb_substr($name, 0, 120),
        'horizon_months' => $horizonMonths,
        'modifiers_text' => twin_scenario_encode_payload($draft, $modifiers),
    ]);

    $scenarioId = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare(
        'SELECT id, user_id, name, horizon_months, modifiers_text, created_at, updated_at
         FROM financial_twin_scenarios
         WHERE id = :id AND user_id = :user_id
         LIMIT 1'
    );
    $stmt->execute(['id' => $scenarioId, 'user_id' => $userId]);

    json_response(201, ['ok' => true, 'scenario' => twin_scenario_payload($stmt->fetch())]);
}

if ($method === 'PUT') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Scenario id is required']);
    }

    $stmt = $pdo->prepare(
        'SELECT id, user_id, name, horizon_months, modifiers_text
         FROM financial_twin_scenarios
         WHERE id = :id AND user_id = :user_id
         LIMIT 1'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        json_response(404, ['ok' => false, 'error' => 'Scenario not found']);
    }

    $existingDecoded = twin_scenario_decode_payload($existing['modifiers_text'] ?? null);
    $existingDraft = is_array($existingDecoded['draft'] ?? null) ? $existingDecoded['draft'] : [];
    $existingModifiers = is_array($existingDecoded['modifiers'] ?? null)
        ? $existingDecoded['modifiers']
        : $existingDecoded;

    $name = api_text($data['name'] ?? null, (string) ($existing['name'] ?? ''));
    if ($name === '') {
        json_response(422, ['ok' => false, 'error' => 'Scenario name is required']);
    }

    $horizonMonths = api_int_or_null($data['horizonMonths'] ?? $data['horizon_months'] ?? null);
    $horizonMonths = $horizonMonths === null
        ? (int) ($existing['horizon_months'] ?? 12)
        : max(1, min(120, $horizonMonths));

    $draft = is_array($data['draft'] ?? null) ? $data['draft'] : $existingDraft;
    $modifiers = is_array($data['modifiers'] ?? null) ? $data['modifiers'] : $existingModifiers;

    $stmt = $pdo->prepare(
        'UPDATE financial_twin_scenarios
         SET name = :name,
             horizon_months = :horizon_months,
             modifiers_text = :modifiers_text
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'name' => mb_substr($name, 0, 120),
        'horizon_months' => $horizonMonths,
        'modifiers_text' => twin_scenario_encode_payload($draft, $modifiers),
        'id' => $id,
        'user_id' => $userId,
    ]);

    $stmt = $pdo->prepare(
        'SELECT id, user_id, name, horizon_months, modifiers_text, created_at, updated_at
         FROM financial_twin_scenarios
         WHERE id = :id AND user_id = :user_id
         LIMIT 1'
    );
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true, 'scenario' => twin_scenario_payload($stmt->fetch())]);
}

if ($method === 'DELETE') {
    $id = api_int_or_null($data['id'] ?? null);
    if (!$id) {
        json_response(422, ['ok' => false, 'error' => 'Scenario id is required']);
    }

    $stmt = $pdo->prepare('DELETE FROM financial_twin_scenarios WHERE id = :id AND user_id = :user_id');
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    json_response(200, ['ok' => true]);
}

json_response(405, ['ok' => false, 'error' => 'Method not allowed']);
