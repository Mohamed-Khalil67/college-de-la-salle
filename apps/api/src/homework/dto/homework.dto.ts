import { IsOptional } from 'class-validator';
import type {
  HomeworkCompletionDto as HomeworkCompletionContract,
  HomeworkDto as HomeworkContract,
} from '@cdls/shared';
import { StudentSummaryDto } from '../../classes/dto/class.dto.js';
import { IsDay } from '../../common/dates.js';
import { EventDto } from '../../events/dto/event.dto.js';

export class HomeworkDto implements HomeworkContract {
  event: EventDto;
  done: boolean;
  doneAt: string | null;
}

export class HomeworkCompletionDto implements HomeworkCompletionContract {
  student: StudentSummaryDto;
  doneAt: string;
}

export class HomeworkQueryDto {
  /** Due on or after this day (default: a week ago). */
  @IsOptional()
  @IsDay()
  from?: string;
}
