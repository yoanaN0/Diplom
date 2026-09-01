<?php

declare(strict_types=1);

$defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176',
    'http://127.0.0.1:5177',
];

$envOrigins = getenv('FRONTEND_ORIGIN') ?: getenv('FRONTEND_ORIGINS') ?: '';
$configuredOrigins = array_filter(array_map('trim', preg_split('/\s*,\s*/', (string) $envOrigins) ?: []));

return [
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => (int) (getenv('DB_PORT') ?: 3306),
        'name' => getenv('DB_NAME') ?: 'finly',
        'user' => getenv('DB_USER') ?: 'root',
        'pass' => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],
    'frontend_origin' => $configuredOrigins[0] ?? 'http://localhost:5173',
    'frontend_origins' => array_values(array_unique(array_merge($defaultOrigins, $configuredOrigins))),
];
