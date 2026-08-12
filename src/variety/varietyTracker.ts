import type { ServedDish } from "../db/repositories/planHistoryRepo.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function excludeRecentDishes(
  history: ServedDish[],
  today: string,
  windowDays: number
): Set<string> {
  const todayMs = new Date(today).getTime();
  const excluded = new Set<string>();
  for (const entry of history) {
    const servedMs = new Date(entry.servedOn).getTime();
    const daysAgo = (todayMs - servedMs) / MS_PER_DAY;
    if (daysAgo >= 0 && daysAgo < windowDays) {
      excluded.add(entry.dishName);
    }
  }
  return excluded;
}
