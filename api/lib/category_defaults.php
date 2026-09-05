<?php

declare(strict_types=1);

function category_seed_default_categories(PDO $pdo, int $userId): void
{
    if ($userId <= 0) {
        return;
    }

    $categories = [
        ['Храна', 'expense'],
        ['Транспорт', 'expense'],
        ['Сметки', 'expense'],
        ['Ресторанти', 'expense'],
        ['Здраве', 'expense'],
        ['Пазаруване', 'expense'],
        ['Други', 'expense'],
        ['Заплата', 'income'],
        ['Други приходи', 'income'],
    ];

    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO categories (user_id, name, category_type, is_builtin)
         VALUES (:user_id, :name, :category_type, 1)'
    );

    foreach ($categories as [$name, $categoryType]) {
        $stmt->execute([
            'user_id' => $userId,
            'name' => $name,
            'category_type' => $categoryType,
        ]);
    }
}