export type ServerTimeZone = "UTC" | "UTC+1" | "Europe/Berlin";

export type ServerTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const SERVER_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;

export function parseServerTime(value: string | null): ServerTimeParts | null {
  if (value === null) return null;
  const match = SERVER_TIME_RE.exec(value);
  if (match === null) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;

  return { year, month, day, hour, minute, second };
}

function lastSundayUtc(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0, 1, 0, 0));
  const offset = lastDay.getUTCDay();
  const day = lastDay.getUTCDate() - offset;
  return Date.UTC(year, month - 1, day, 1, 0, 0);
}

function isBerlinDstAtWallTime(parts: ServerTimeParts): boolean {
  const start = lastSundayUtc(parts.year, 3);
  const end = lastSundayUtc(parts.year, 10);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const month = parts.month;
  if (month > startDate.getUTCMonth() + 1 && month < endDate.getUTCMonth() + 1) {
    return true;
  }
  if (month === startDate.getUTCMonth() + 1) {
    if (parts.day > startDate.getUTCDate()) return true;
    if (parts.day < startDate.getUTCDate()) return false;
    return parts.hour >= 3;
  }
  if (month === endDate.getUTCMonth() + 1) {
    if (parts.day < endDate.getUTCDate()) return true;
    if (parts.day > endDate.getUTCDate()) return false;
    return parts.hour < 2 || parts.hour === 2;
  }
  return false;
}

export function serverTimeToEpoch(
  value: string | null,
  zone: ServerTimeZone,
): number | null {
  const parts = parseServerTime(value);
  if (parts === null) return null;

  const wallUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  if (zone === "UTC") return wallUtc;
  if (zone === "UTC+1") return wallUtc - 60 * 60 * 1000;

  const dstStart = lastSundayUtc(parts.year, 3);
  const dstEnd = lastSundayUtc(parts.year, 10);
  const startDate = new Date(dstStart);
  const endDate = new Date(dstEnd);

  const isSpringGap =
    parts.year === startDate.getUTCFullYear() &&
    parts.month === startDate.getUTCMonth() + 1 &&
    parts.day === startDate.getUTCDate() &&
    parts.hour === 2;
  if (isSpringGap) {
    // Non-existent wall time: use the standard +1 h offset.
    return wallUtc - 60 * 60 * 1000;
  }

  const isAutumnOverlap =
    parts.year === endDate.getUTCFullYear() &&
    parts.month === endDate.getUTCMonth() + 1 &&
    parts.day === endDate.getUTCDate() &&
    parts.hour === 2;
  if (isAutumnOverlap) {
    // Ambiguous wall time: take the first occurrence in DST (+2 h).
    // Exact 02:00:00 is the UTC 01:00 boundary and belongs to standard time.
    if (parts.minute === 0 && parts.second === 0) {
      return wallUtc - 60 * 60 * 1000;
    }
    return wallUtc - 2 * 60 * 60 * 1000;
  }

  const offsetHours = isBerlinDstAtWallTime(parts) ? 2 : 1;
  return wallUtc - offsetHours * 60 * 60 * 1000;
}
