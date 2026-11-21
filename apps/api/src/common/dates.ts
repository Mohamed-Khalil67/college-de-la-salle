import { dayInZone, isCalendarDay, timeInZone } from '@cdls/shared';
import { registerDecorator, type ValidationOptions } from 'class-validator';
import { activeSchool } from '../school/school-profile.js';
import { currentTime } from './clock.js';

/** A `@db.Date` column value as `YYYY-MM-DD`. */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` to the Date Prisma expects for a `@db.Date` column (UTC midnight). */
export function fromDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export const toIso = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** A real calendar day written `YYYY-MM-DD`. */
export function IsDay(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isDay',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: `« ${String(propertyName)} » doit être une date écrite AAAA-MM-JJ.`, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isCalendarDay(value),
      },
    });
}

/** The school's IANA time zone (profile `timeZone`, Africa/Cairo for CDLS). */
export function schoolTimeZone(): string {
  return activeSchool().timeZone;
}

/** The school's « today » (`YYYY-MM-DD` in its time zone), as the web reads it: sessions already held are never rewritten. */
export function schoolToday(now: Date = currentTime()): string {
  return dayInZone(schoolTimeZone(), now);
}

/** The time now at the school (`HH:MM`). */
export function schoolTimeNow(now: Date = currentTime()): string {
  return timeInZone(schoolTimeZone(), now);
}
