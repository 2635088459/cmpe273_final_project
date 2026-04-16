import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  ValidationPipe,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiResponse, 
  ApiParam 
} from '@nestjs/swagger';
import { DeletionRequestService } from './deletion-request.service';
import { 
  CreateDeletionRequestDto,
  DeletionRequestCreatedDto,
  DeletionRequestResponseDto,
  DeletionProofResponseDto 
} from './dto';

@ApiTags('Deletion Requests')
@Controller('deletions')
export class DeletionRequestController {
  constructor(private readonly deletionRequestService: DeletionRequestService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ 
    summary: 'Create a new deletion request',
    description: 'Initiates a verifiable deletion process for the specified subject ID'
  })
  @ApiResponse({ 
    status: 202, 
    description: 'Deletion request created successfully',
    type: DeletionRequestCreatedDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid request payload'
  })
  async createDeletionRequest(
    @Body(ValidationPipe) dto: CreateDeletionRequestDto
  ): Promise<DeletionRequestCreatedDto> {
    return this.deletionRequestService.createDeletionRequest(dto);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get deletion request status',
    description: 'Retrieves the current status and progress of a deletion request'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Deletion request UUID',
    example: 'ffe07b3a-93cd-4c0d-8b0a-9c5e8d2f1a6b'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Deletion request details',
    type: DeletionRequestResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Deletion request not found'
  })
  async getDeletionRequest(
    @Param('id') id: string
  ): Promise<DeletionRequestResponseDto> {
    return this.deletionRequestService.getDeletionRequest(id);
  }

  @Get(':id/proof')
  @ApiOperation({ 
    summary: 'Get deletion proof and audit trail',
    description: 'Retrieves the complete audit trail and proof events for a deletion request'
  })
  @ApiParam({ 
    name: 'id', 
    description: 'Deletion request UUID',
    example: 'ffe07b3a-93cd-4c0d-8b0a-9c5e8d2f1a6b'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Deletion proof and audit trail',
    type: DeletionProofResponseDto
  })
  @ApiResponse({ 
    status: 404, 
    description: 'Deletion request not found'
  })
  async getDeletionProof(
    @Param('id') id: string
  ): Promise<DeletionProofResponseDto> {
    return this.deletionRequestService.getDeletionProof(id);
  }
}