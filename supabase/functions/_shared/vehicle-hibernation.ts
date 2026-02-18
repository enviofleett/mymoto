export const HIBERNATION_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculateDaysOffline(lastOnlineIso: string | null | undefined, now: Date = new Date()) {
  if (!lastOnlineIso) return null;
  const last = new Date(lastOnlineIso);
  if (Number.isNaN(last.getTime())) return null;
  const diffMs = now.getTime() - last.getTime();
  return diffMs / MS_PER_DAY;
}

export function shouldHibernateVehicle(
  lastOnlineIso: string | null | undefined,
  now: Date = new Date(),
  thresholdDays: number = HIBERNATION_DAYS
) {
  const daysOffline = calculateDaysOffline(lastOnlineIso, now);
  if (daysOffline === null) {
    return { shouldHibernate: false, daysOffline: null as number | null };
  }
  return { shouldHibernate: daysOffline >= thresholdDays, daysOffline };
}

