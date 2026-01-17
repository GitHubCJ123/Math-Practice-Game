import { DateTime } from "luxon";

export const EASTERN_TIME_ZONE = "America/New_York";

export interface MonthBounds {
  startUtc: Date;
  endUtc: Date;
  year: number;
  month: number;
}

export function getCurrentEasternMonthBounds(): MonthBounds {
  const nowEastern = DateTime.now().setZone(EASTERN_TIME_ZONE);
  const start = nowEastern.startOf("month");
  const end = start.plus({ months: 1 });

  return {
    startUtc: start.toUTC().toJSDate(),
    endUtc: end.toUTC().toJSDate(),
    year: start.year,
    month: start.month,
  };
}

export function getPreviousEasternMonthBounds(): MonthBounds {
  const nowEastern = DateTime.now().setZone(EASTERN_TIME_ZONE);
  const start = nowEastern.startOf("month").minus({ months: 1 });
  const end = start.plus({ months: 1 });

  return {
    startUtc: start.toUTC().toJSDate(),
    endUtc: end.toUTC().toJSDate(),
    year: start.year,
    month: start.month,
  };
}

export function getEasternMonthBounds(year: number, month: number): MonthBounds {
  const eastern = DateTime.fromObject({ year, month, day: 1 }, { zone: EASTERN_TIME_ZONE });
  const start = eastern.startOf("month");
  const end = start.plus({ months: 1 });

  return {
    startUtc: start.toUTC().toJSDate(),
    endUtc: end.toUTC().toJSDate(),
    year: start.year,
    month: start.month,
  };
}


