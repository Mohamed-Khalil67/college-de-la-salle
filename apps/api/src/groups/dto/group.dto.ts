import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  type AddGroupMembersRequest,
  type CreateGroupRequest,
  type GroupDetailDto as GroupDetailContract,
  type GroupDto as GroupContract,
  type GroupListQuery,
  type GroupMemberDto as GroupMemberContract,
  GROUP_LIMITS,
  type GroupWithMembersDto as GroupWithMembersContract,
  type MyGroupDto as MyGroupContract,
  type UpdateGroupRequest,
} from '@cdls/shared';
import { StudentSummaryDto } from '../../classes/dto/class.dto.js';
import { trim } from '../../common/transforms.js';

export class GroupDto implements GroupContract {
  id: string;
  classId: string;
  classLabel: string;
  division: string;
  label: string;
  memberCount: number;
  createdAt: string;
}

export class GroupMemberDto extends StudentSummaryDto implements GroupMemberContract {
  joinedOn: string;
}

export class GroupDetailDto extends GroupDto implements GroupDetailContract {
  @ApiProperty({ type: [GroupMemberDto] })
  members: GroupMemberDto[];
}

export class GroupWithMembersDto extends GroupDto implements GroupWithMembersContract {
  memberIds: string[];
}

export class MyGroupDto implements MyGroupContract {
  id: string;
  classId: string;
  division: string;
  label: string;
  joinedOn: string;
}

export class GroupListQueryDto implements GroupListQuery {
  @IsUUID()
  classId: string;
}

export class CreateGroupDto implements CreateGroupRequest {
  @IsUUID()
  classId: string;

  /** « TP », « LV2 »: a student is in one group per division. */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_LIMITS.division)
  division: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_LIMITS.label)
  label: string;
}

export class UpdateGroupDto implements UpdateGroupRequest {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_LIMITS.division)
  division?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(GROUP_LIMITS.label)
  label?: string;
}

export class AddGroupMembersDto implements AddGroupMembersRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_LIMITS.members)
  @IsUUID(undefined, { each: true })
  studentIds: string[];

  /** Leave the other group of the same division (today) instead of refusing. */
  @IsOptional()
  @IsBoolean()
  move?: boolean;
}
