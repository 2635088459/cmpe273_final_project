import { Module } from '@nestjs/common';
import { BulkDeletionController } from './bulk-deletion.controller';
import { BulkDeletionService } from './bulk-deletion.service';
import { DeletionRequestModule } from '../deletion-request/deletion-request.module';

@Module({
  imports: [DeletionRequestModule],
  controllers: [BulkDeletionController],
  providers: [BulkDeletionService],
})
export class BulkDeletionModule {}
