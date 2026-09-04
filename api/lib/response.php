<?php

declare(strict_types=1);

function json_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array
{
    if (array_key_exists('__finly_test_json_body', $GLOBALS) && is_array($GLOBALS['__finly_test_json_body'])) {
        return $GLOBALS['__finly_test_json_body'];
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}
