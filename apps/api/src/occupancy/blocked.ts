import { ConflictException } from '@nestjs/common';
import {
  TIMETABLE_CONFLICT,
  type TimetableBlockedError,
  type TimetableConflictDto,
  type TimetableWarningDto,
  WARNINGS_NOT_ACKNOWLEDGED,
} from '@cdls/shared';

/** 409: a hard conflict (room, teacher or class) refuses the write. */
export function conflictBlocked(
  conflicts: readonly TimetableConflictDto[],
  warnings: readonly TimetableWarningDto[] = [],
): ConflictException {
  const body: TimetableBlockedError = {
    statusCode: 409,
    error: 'Conflict',
    message: conflicts.length
      ? conflicts[0]!.message
      : 'Cette salle, cet enseignant ou cette classe vient d’être pris : actualisez et réessayez.',
    code: TIMETABLE_CONFLICT,
    conflicts,
    warnings,
  };
  return new ConflictException(body);
}

/** 409: soft warnings need an acknowledgement with a reason each. */
export function warningsBlocked(warnings: readonly TimetableWarningDto[]): ConflictException {
  const body: TimetableBlockedError = {
    statusCode: 409,
    error: 'Conflict',
    message:
      'Cette modification déclenche des avertissements : confirmez-les, avec un motif pour chacun.',
    code: WARNINGS_NOT_ACKNOWLEDGED,
    conflicts: [],
    warnings,
  };
  return new ConflictException(body);
}
