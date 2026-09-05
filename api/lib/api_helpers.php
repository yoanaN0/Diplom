<?php

declare(strict_types=1);

function api_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function api_config(): array
{
    static $config = null;

    if ($config === null) {
        $config = require __DIR__ . '/../config.php';
    }

    return $config;
}

function api_pdo(): PDO
{
    return db_connection(api_config());
}

function api_user_id(): int
{
    $userId = (int) ($_SESSION['user_id'] ?? 0);

    if ($userId <= 0) {
        json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
    }

    $pdo = api_pdo();
    if (api_table_exists($pdo, 'users')) {
        $userStmt = $pdo->prepare('SELECT 1 FROM users WHERE id = :user_id LIMIT 1');
        $userStmt->execute(['user_id' => $userId]);

        if (!$userStmt->fetchColumn()) {
            session_unset();
            session_destroy();
            json_response(401, ['ok' => false, 'error' => 'Unauthenticated']);
        }
    }

    if (api_table_exists($pdo, 'user_admin_meta')) {
        $stmt = $pdo->prepare('SELECT profile_status FROM user_admin_meta WHERE user_id = :user_id LIMIT 1');
        $stmt->execute(['user_id' => $userId]);
        $profileStatus = (string) ($stmt->fetchColumn() ?: 'active');

        if (in_array($profileStatus, ['blocked', 'deleted'], true)) {
            session_unset();
            session_destroy();
            json_response(403, ['ok' => false, 'error' => 'Профилът е ограничен. Свържи се с администратор.']);
        }
    }

    return $userId;
}

function api_table_exists(PDO $pdo, string $tableName): bool
{
    static $cache = [];

    if (array_key_exists($tableName, $cache)) {
        return $cache[$tableName];
    }

    $stmt = $pdo->prepare(
        'SELECT 1
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = :table_name
         LIMIT 1'
    );
    $stmt->execute(['table_name' => $tableName]);

    $cache[$tableName] = (bool) $stmt->fetchColumn();
    return $cache[$tableName];
}

function api_request_data(): array
{
    return api_method() === 'GET' ? $_GET : read_json_body();
}

function api_int_or_null(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    $intValue = filter_var($value, FILTER_VALIDATE_INT);
    return $intValue === false ? null : (int) $intValue;
}

function api_float_or_null(mixed $value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }

    $floatValue = filter_var($value, FILTER_VALIDATE_FLOAT);
    return $floatValue === false ? null : (float) $floatValue;
}

function api_bool(mixed $value, bool $fallback = false): bool
{
    if ($value === null || $value === '') {
        return $fallback;
    }

    return filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $fallback;
}

function api_text(mixed $value, string $fallback = ''): string
{
    $text = trim((string) ($value ?? ''));
    return $text === '' ? $fallback : $text;
}

function api_datetime_or_null(mixed $value): ?string
{
    $text = trim((string) ($value ?? ''));
    if ($text === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($text))->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return null;
    }
}

function api_date_or_null(mixed $value): ?string
{
    $text = trim((string) ($value ?? ''));
    if ($text === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable($text))->format('Y-m-d');
    } catch (Throwable) {
        return null;
    }
}

function api_now(): string
{
    return (new DateTimeImmutable('now'))->format('Y-m-d H:i:s');
}

function api_tags_to_text(mixed $value): ?string
{
    if (is_array($value)) {
        $tags = array_values(array_filter(array_map(static fn ($tag) => trim((string) $tag), $value)));
        return $tags ? implode(' ', $tags) : null;
    }

    $text = trim((string) ($value ?? ''));
    return $text === '' ? null : $text;
}

function api_tags_to_array(?string $value): array
{
    if ($value === null || trim($value) === '') {
        return [];
    }

    return preg_split('/\s+/', trim($value)) ?: [];
}
