import { Module } from '@nestjs/common';
import { BackupConsumerService } from './backup-consumer.service';

@Module({
  providers: [BackupConsumerService],
})
export class BackupConsumerModule {}
