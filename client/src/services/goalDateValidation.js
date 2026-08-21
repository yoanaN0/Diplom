export function isGoalDeadlineValid(deadline, now = new Date()) {
  if (!deadline) {
    return false;
  }

  const selected = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(selected.getTime())) {
    return false;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const minimumAllowed = new Date(today);
  minimumAllowed.setDate(minimumAllowed.getDate() + 1);

  return selected >= minimumAllowed;
}

export function getMinimumGoalDeadline(now = new Date()) {
  const minimum = new Date(now);
  minimum.setHours(0, 0, 0, 0);
  minimum.setDate(minimum.getDate() + 1);

  return minimum.toISOString().slice(0, 10);
}
