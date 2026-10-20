import { isCalendarDay } from '@cdls/shared';
import { registerDecorator, type ValidationOptions } from 'class-validator';

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
      options: { message: `${String(propertyName)} must be a date written YYYY-MM-DD`, ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isCalendarDay(value),
      },
    });
}
