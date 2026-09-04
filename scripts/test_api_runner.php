<?php

declare(strict_types=1);

if ($argc < 6) {
    fwrite(STDERR, "Usage: php test_api_runner.php <endpoint> <method> <userId> <payloadBase64Json> <queryBase64Json>\n");
    exit(2);
}

ob_start();
ini_set('display_errors', '0');

$endpoint = $argv[1];
$method = strtoupper((string) $argv[2]);
$userId = (int) $argv[3];
$payload = json_decode(base64_decode((string) $argv[4], true) ?: 'null', true);
$query = json_decode(base64_decode((string) $argv[5], true) ?: 'null', true);

if (!is_array($payload)) {
    $payload = [];
}
if (!is_array($query)) {
    $query = [];
}

$_SERVER['REQUEST_METHOD'] = $method;
$_GET = $query;
$_POST = [];

$sessionId = substr(bin2hex(random_bytes(16)), 0, 26);
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

require $endpoint;
