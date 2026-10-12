import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class QueryConversationsDto {
  @ApiPropertyOptional({ description: 'Free-text search over design title and message body' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  designId?: string;

  @ApiPropertyOptional({ description: 'Filter to conversations that include this participant' })
  @IsOptional()
  @IsUUID()
  peerUserId?: string;

  @ApiPropertyOptional({ description: 'ISO date; conversations created on/after this date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date; conversations created on/before this date' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;
}

export class QueryMessagesDto {
  @ApiPropertyOptional({ description: 'Message id to page backwards (older) from' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateConversationDto {
  @ApiProperty({ description: 'Design the conversation is scoped to' })
  @IsUUID()
  designId!: string;

  @ApiProperty({
    type: [String],
    description: 'Other participant user ids (creator is always included automatically)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  participantUserIds!: string[];
}

export class CreateMessageDto {
  @ApiProperty({ enum: [MessageType.TEXT, MessageType.IMAGE, MessageType.AUDIO] })
  @IsIn([MessageType.TEXT, MessageType.IMAGE, MessageType.AUDIO])
  type!: typeof MessageType.TEXT | typeof MessageType.IMAGE | typeof MessageType.AUDIO;

  @ApiPropertyOptional()
  @ValidateIf((o) => o.type === MessageType.TEXT)
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Attachment upload id for IMAGE / AUDIO messages' })
  @ValidateIf((o) => o.type === MessageType.IMAGE || o.type === MessageType.AUDIO)
  @IsUUID()
  imageUploadId?: string;
}
