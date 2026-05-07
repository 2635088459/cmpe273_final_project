import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { BulkDeletionService } from './bulk-deletion.service';
import { BulkDeletionResponseDto } from './dto/bulk-deletion-response.dto';

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('Deletion Requests')
@Controller('deletions')
export class BulkDeletionController {
  constructor(private readonly bulkDeletionService: BulkDeletionService) {}

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk CSV deletion upload',
    description: 'Upload a CSV file with a subject_id column. Creates one deletion request per unique, non-blank row.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'CSV file with subject_id column' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Per-row results with created/skipped counts' })
  @ApiResponse({ status: 400, description: 'No file attached or file is not a CSV' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async bulkDelete(
    @UploadedFile() file: MulterFile,
  ): Promise<BulkDeletionResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded. Attach a CSV file in the "file" field.');
    }

    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      (file.originalname && file.originalname.toLowerCase().endsWith('.csv'));

    if (!isCsv) {
      throw new BadRequestException('Only CSV files are accepted. Upload a .csv file.');
    }

    return this.bulkDeletionService.processCsvBuffer(file.buffer);
  }
}
