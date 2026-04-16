import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDeletionRequestDto {
  @ApiProperty({
    description: 'The subject ID to delete (e.g., user ID, email, username)',
    example: 'alice',
    minLength: 1,
    maxLength: 100
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'subject_id can only contain alphanumeric characters, dots, dashes, and underscores'
  })
  subject_id: string;
}