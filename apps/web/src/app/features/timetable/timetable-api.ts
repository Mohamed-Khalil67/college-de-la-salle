import { HttpClient, type HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  type CreateSlotExceptionRequest,
  type CreateTimetableSlotRequest,
  type FreeRoomDto,
  type FreeRoomsQuery,
  type Paginated,
  type RoomDto,
  type SlotScope,
  TIMETABLE_CONFLICT,
  type TimetableBlockedError,
  type TimetableCheckRequest,
  type TimetableCheckResult,
  type TimetableOccurrenceDto,
  type TimetableOccurrenceQuery,
  type TimetableSlotDto,
  type TimetableSlotListQuery,
  type TimetableWarningDto,
  type TimetableWriteResult,
  type UpdateTimetableSlotRequest,
  WARNINGS_NOT_ACKNOWLEDGED,
} from '@cdls/shared';

type Query = Readonly<Record<string, string | number | boolean | null | undefined>>;

function params(query: Query = {}): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') result = result.set(key, String(value));
  }
  return result;
}

/**
 * What a refused write answers with: hard conflicts or warnings to acknowledge (409 with a `code`).
 * Null for any other error.
 */
export function blockedOf(error: unknown): TimetableBlockedError | null {
  const http = error as HttpErrorResponse | undefined;
  const body = http?.error as Partial<TimetableBlockedError> | undefined;
  if (http?.status !== 409 || !body) return null;
  if (body.code !== TIMETABLE_CONFLICT && body.code !== WARNINGS_NOT_ACKNOWLEDGED) return null;
  return {
    statusCode: 409,
    message: String(body.message ?? ''),
    code: body.code,
    conflicts: body.conflicts ?? [],
    warnings: body.warnings ?? [],
    suggestions: body.suggestions ?? [],
  };
}

/** The timetable endpoints (/api/timetable) and the rooms list, one promise per call. */
@Injectable({ providedIn: 'root' })
export class TimetableApi {
  readonly #http = inject(HttpClient);

  readonly rooms = () => firstValueFrom(this.#http.get<RoomDto[]>('/api/rooms'));

  readonly occurrences = (query: TimetableOccurrenceQuery) =>
    firstValueFrom(
      this.#http.get<TimetableOccurrenceDto[]>('/api/timetable/occurrences', { params: params({ ...query }) }),
    );

  readonly slots = (query: TimetableSlotListQuery) =>
    firstValueFrom(
      this.#http.get<Paginated<TimetableSlotDto>>('/api/timetable/slots', { params: params({ ...query }) }),
    );

  readonly slot = (id: string) => firstValueFrom(this.#http.get<TimetableSlotDto>(`/api/timetable/slots/${id}`));

  readonly createSlot = (body: CreateTimetableSlotRequest) =>
    firstValueFrom(this.#http.post<TimetableWriteResult>('/api/timetable/slots', body));

  readonly updateSlot = (id: string, body: UpdateTimetableSlotRequest) =>
    firstValueFrom(this.#http.patch<TimetableWriteResult>(`/api/timetable/slots/${id}`, body));

  readonly deleteSlot = (id: string, scope: SlotScope, date?: string) =>
    firstValueFrom(
      this.#http.delete<TimetableWriteResult>(`/api/timetable/slots/${id}`, { params: params({ scope, date }) }),
    );

  readonly addException = (slotId: string, body: CreateSlotExceptionRequest) =>
    firstValueFrom(this.#http.post<TimetableWriteResult>(`/api/timetable/slots/${slotId}/exceptions`, body));

  readonly removeException = (id: string) =>
    firstValueFrom(this.#http.delete<TimetableWriteResult>(`/api/timetable/exceptions/${id}`));

  readonly check = (body: TimetableCheckRequest) =>
    firstValueFrom(this.#http.post<TimetableCheckResult>('/api/timetable/check', body));

  readonly warnings = (query: TimetableOccurrenceQuery) =>
    firstValueFrom(
      this.#http.get<TimetableWarningDto[]>('/api/timetable/warnings', { params: params({ ...query }) }),
    );

  readonly freeRooms = (query: FreeRoomsQuery) =>
    firstValueFrom(this.#http.get<FreeRoomDto[]>('/api/timetable/free-rooms', { params: params({ ...query }) }));
}
