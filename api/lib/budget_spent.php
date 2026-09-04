<?php

declare(strict_types=1);

function budget_current_month_bounds(?DateTimeImmutable $reference = null): array
{
    $now = $reference ?? new DateTimeImmutable('now');
    return [
        'start_date' => $now->format('Y-m-01'),
        'end_date' => $now->format('Y-m-t'),
    ];
}

function budget_end_exclusive_from_end_date(string $endDate): string
{
    $date = new DateTimeImmutable($endDate . ' 00:00:00');
    return $date->modify('+1 day')->format('Y-m-d H:i:s');
}

function budget_calculate_spent(PDO $pdo, int $userId, ?int $categoryId, string $startDate, string $endDate): float
{
    if ($categoryId === null || $startDate === '' || $endDate === '') {
        return 0.0;
    }

    $startInclusive = $startDate . ' 00:00:00';
    $endExclusive = budget_end_exclusive_from_end_date($endDate);

    $stmt = $pdo->prepare(
        'SELECT COALESCE(SUM(t.amount), 0) AS spent
         FROM transactions t
         WHERE t.user_id = :user_id
           AND t.category_id = :category_id
           AND t.type = :type
           AND t.transaction_date >= :start_inclusive
           AND t.transaction_date < :end_exclusive
           AND t.source_goal_id IS NULL
           AND LOWER(TRIM(t.category_label)) NOT IN ("спестяване", "savings")
           AND LOWER(TRIM(t.title)) NOT LIKE :goal_archive_title
           AND (
                t.tags_text IS NULL
                OR (
                    LOWER(t.tags_text) NOT LIKE :goal_archive_tag
                    AND LOWER(t.tags_text) NOT LIKE :goal_completed_tag
                    AND LOWER(t.tags_text) NOT LIKE :goal_funding_tag
                    AND LOWER(t.tags_text) NOT LIKE :goal_transfer_tag
                )
           )'
    );
    $stmt->execute([
        'user_id' => $userId,
        'category_id' => $categoryId,
        'type' => 'expense',
        'start_inclusive' => $startInclusive,
        'end_exclusive' => $endExclusive,
        'goal_archive_title' => 'платени и архивирани:%',
        'goal_archive_tag' => '%#goal-archive%',
        'goal_completed_tag' => '%#goal-completed%',
        'goal_funding_tag' => '%#goal-funding%',
        'goal_transfer_tag' => '%#goal-transfer%',
    ]);

    return (float) $stmt->fetchColumn();
}

function budget_sync_monthly_period(PDO $pdo, int $userId, array $budget, ?DateTimeImmutable $reference = null): array
{
    $period = strtolower(trim((string) ($budget['period'] ?? 'monthly')));
    if ($period !== 'monthly') {
        return $budget;
    }

    $bounds = budget_current_month_bounds($reference);
    $needsUpdate = ($budget['start_date'] ?? null) !== $bounds['start_date']
        || ($budget['end_date'] ?? null) !== $bounds['end_date'];

    if (!$needsUpdate) {
        return $budget;
    }

    $stmt = $pdo->prepare(
        'UPDATE budgets
         SET start_date = :start_date,
             end_date = :end_date
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'start_date' => $bounds['start_date'],
        'end_date' => $bounds['end_date'],
        'id' => (int) $budget['id'],
        'user_id' => $userId,
    ]);

    $budget['start_date'] = $bounds['start_date'];
    $budget['end_date'] = $bounds['end_date'];

    return $budget;
}

function budget_refresh_spent(PDO $pdo, int $userId, array $budget, ?DateTimeImmutable $reference = null): array
{
    $budget = budget_sync_monthly_period($pdo, $userId, $budget, $reference);

    $startDate = (string) ($budget['start_date'] ?? '');
    $endDate = (string) ($budget['end_date'] ?? '');
    if ($startDate === '' || $endDate === '') {
        $bounds = budget_current_month_bounds($reference);
        $startDate = $bounds['start_date'];
        $endDate = $bounds['end_date'];

        $stmt = $pdo->prepare(
            'UPDATE budgets
             SET start_date = :start_date,
                 end_date = :end_date
             WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute([
            'start_date' => $startDate,
            'end_date' => $endDate,
            'id' => (int) $budget['id'],
            'user_id' => $userId,
        ]);

        $budget['start_date'] = $startDate;
        $budget['end_date'] = $endDate;
    }

    $spent = budget_calculate_spent(
        $pdo,
        $userId,
        $budget['category_id'] === null ? null : (int) $budget['category_id'],
        $startDate,
        $endDate
    );

    $stmt = $pdo->prepare(
        'UPDATE budgets
         SET spent_amount = :spent_amount
         WHERE id = :id AND user_id = :user_id'
    );
    $stmt->execute([
        'spent_amount' => number_format($spent, 2, '.', ''),
        'id' => (int) $budget['id'],
        'user_id' => $userId,
    ]);

    $budget['spent_amount'] = number_format($spent, 2, '.', '');

    return $budget;
}
