import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CONTACT_BULK_MAX,
  CONTACT_LIMITS,
  type HandleContactMessagesRequest,
  type HandleContactMessagesResponse,
  type ContactMessageDto as ContactMessageContract,
  type ContactMessageListQuery,
  type ContactMessageRequest,
  type UpdateContactMessageRequest,
} from '@cdls/shared';
import { PaginationQueryDto } from '../../common/pagination.js';
import { queryBoolean, trim } from '../../common/transforms.js';

/** The public contact form. Messages are in French: the site shows them to visitors. */
export class CreateContactMessageDto implements ContactMessageRequest {
  /** @example Mariam Saad */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Saisissez votre nom.' })
  @MaxLength(CONTACT_LIMITS.name, {
    message: `Le nom fait ${CONTACT_LIMITS.name} caractères au plus.`,
  })
  name: string;

  /** @example mariam@example.com */
  @Transform(trim)
  @IsEmail({}, { message: 'Saisissez une adresse e-mail complète, par exemple nom@domaine.com.' })
  @MaxLength(CONTACT_LIMITS.email, { message: 'Adresse e-mail trop longue.' })
  email: string;

  /** @example Demande d’inscription */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Précisez l’objet du message.' })
  @MaxLength(CONTACT_LIMITS.subject, {
    message: `L’objet fait ${CONTACT_LIMITS.subject} caractères au plus.`,
  })
  subject: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Écrivez votre message.' })
  @MaxLength(CONTACT_LIMITS.message, {
    message: `Le message fait ${CONTACT_LIMITS.message} caractères au plus.`,
  })
  message: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CONTACT_LIMITS.phone, { message: 'Numéro de téléphone trop long.' })
  phone?: string;

  /** @example Bac français, lycée */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CONTACT_LIMITS.track, { message: 'Filière et classe : texte trop long.' })
  track?: string;

  /** Honeypot, hidden from people: filled in by robots only. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

export class ContactMessageDto implements ContactMessageContract {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  track: string;
  message: string;
  createdAt: string;
  @ApiProperty({ type: String, nullable: true })
  handledAt: string | null;
  @ApiProperty({ type: String, nullable: true })
  handledByName: string | null;
}

export class ContactMessageListQueryDto
  extends PaginationQueryDto
  implements ContactMessageListQuery
{
  /** true: handled only; false: waiting only; omitted: all. */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(queryBoolean)
  @IsBoolean()
  handled?: boolean;
}

export class UpdateContactMessageDto implements UpdateContactMessageRequest {
  @IsBoolean()
  handled: boolean;
}

export class HandleContactMessagesDto implements HandleContactMessagesRequest {
  /** @example ["0193f1a2-7c4e-7d1a-9b2f-3c5d6e7f8a9b"] */
  @IsArray()
  @ArrayMinSize(1, { message: 'Sélectionnez au moins un message.' })
  @ArrayMaxSize(CONTACT_BULK_MAX, {
    message: `${CONTACT_BULK_MAX} messages au plus à la fois.`,
  })
  @ArrayUnique({ message: 'Chaque message ne figure qu’une fois dans la sélection.' })
  @IsUUID('all', { each: true, message: 'Identifiant de message invalide.' })
  ids: string[];
}

export class HandleContactMessagesResponseDto implements HandleContactMessagesResponse {
  handled: number;
}
