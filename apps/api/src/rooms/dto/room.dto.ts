import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  type CreateRoomRequest,
  ROOM_KINDS,
  ROOM_LIMITS,
  type RoomDto as RoomContract,
  type RoomKind,
} from '@cdls/shared';
import { trim } from '../../common/transforms.js';

export class RoomDto implements RoomContract {
  id: string;
  name: string;
  @ApiProperty({ type: Number, nullable: true })
  capacity: number | null;
  @ApiProperty({ enum: ROOM_KINDS })
  kind: RoomKind;
  active: boolean;
}

export class CreateRoomDto implements CreateRoomRequest {
  /** « Salle 12 », « Labo de physique »… unique. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(ROOM_LIMITS.name)
  name: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ROOM_LIMITS.capacity)
  capacity?: number | null;

  @ApiProperty({ enum: ROOM_KINDS })
  @IsIn(ROOM_KINDS)
  kind: RoomKind;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {}
