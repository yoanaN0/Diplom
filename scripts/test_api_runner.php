<?php

declare(strict_types=1);

if ($argc < 6) {
    fwrite(STDERR, "Usage: php test_api_runner.php <endpoint> <method> <userId> <payloadBase64Json> <queryBase64Json> [sessionId] [headersBase64Json]\n");
    exit(2);
}

ob_start();
ini_set('display_errors', '0');

$endpoint = $argv[1];
$method = strtoupper((string) $argv[2]);
$userId = (int) $argv[3];
$payload = json_decode(base64_decode((string) $argv[4], true) ?: 'null', true);
$query = json_decode(base64_decode((string) $argv[5], true) ?: 'null', true);
$sessionId = $argc >= 7 ? (string) $argv[6] : '';
$headers = [];

if ($argc >= 8) {
    $headers = json_decode(base64_decode((string) $argv[7], true) ?: 'null', true);
}

if (!is_array($payload)) {
    $payload = [];
}
if (!is_array($query)) {
    $query = [];
}
if (!is_array($headers)) {
    $headers = [];
}

$_SERVER['REQUEST_METHOD'] = $method;
$_GET = $query;
$_POST = [];

foreach ($headers as $headerName => $headerValue) {
    $normalizedHeaderName = strtoupper(str_replace('-', '_', (string) $headerName));
    $_SERVER['HTTP_' . $normalizedHeaderName] = (string) $headerValue;
}

$sessionId = $sessionId !== '' ? $sessionId : substr(bin2hex(random_bytes(16)), 0, 26);
session_name('finly_session');
session_id($sessionId);
session_start();
$_SESSION['user_id'] = $userId;
session_write_close();
$_COOKIE['finly_session'] = $sessionId;

$GLOBALS['__finly_test_json_body'] = $payload;

register_shutdown_function(static function (): void {
    $rawOutput = (string) ob_get_contents();
    ob_end_clean();

    $decoded = json_decode(trim($rawOutput), true);
    if (!is_array($decoded) && preg_match('/(\{.*\})\s*$/s', $rawOutput, $matches) === 1) {
        $decoded = json_decode($matches[1], true);
    }

    if (!is_array($decoded)) {
        $decoded = ['raw' => $rawOutput];
    }

    echo json_encode([
        'status' => http_response_code(),
        'body' => $decoded,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
});

try {
    require $endpoint;
} catch (Throwable $throwable) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => $throwable->getMessage(),
        'type' => get_class($throwable),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
