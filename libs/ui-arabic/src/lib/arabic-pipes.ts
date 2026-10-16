import { Pipe, type PipeTransform } from '@angular/core';
import {
  type CountedNoun,
  type DateStyle,
  formatClock,
  formatCount,
  formatDate,
  formatNumber,
  formatScore,
} from './arabic-format';

/** `{{ 3.5 | arNumber }}` → ٣٫٥ */
@Pipe({ name: 'arNumber' })
export class ArNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, fractionDigits = 1): string {
    return value === null || value === undefined
      ? '—'
      : formatNumber(value, { maximumFractionDigits: fractionDigits });
  }
}

/** `{{ ms | arDate: 'time' }}` */
@Pipe({ name: 'arDate' })
export class ArDatePipe implements PipeTransform {
  transform(value: number | null | undefined, style: DateStyle = 'datetime'): string {
    return value ? formatDate(value, style) : '—';
  }
}

/** `{{ remainingMs | arClock }}` → ٠٤:٥٧ */
@Pipe({ name: 'arClock' })
export class ArClockPipe implements PipeTransform {
  transform(ms: number): string {
    return formatClock(ms);
  }
}

/** `{{ 3 | arCount: 'question' }}` → ٣ أسئلة */
@Pipe({ name: 'arCount' })
export class ArCountPipe implements PipeTransform {
  transform(n: number, noun: CountedNoun): string {
    return formatCount(n, noun);
  }
}

/** `{{ score | arScore: max }}` → ٣ من ٥ */
@Pipe({ name: 'arScore' })
export class ArScorePipe implements PipeTransform {
  transform(score: number | null | undefined, max: number | null | undefined): string {
    return score === null || score === undefined || !max ? '—' : formatScore(score, max);
  }
}

export const ARABIC_PIPES = [ArNumberPipe, ArDatePipe, ArClockPipe, ArCountPipe, ArScorePipe] as const;
