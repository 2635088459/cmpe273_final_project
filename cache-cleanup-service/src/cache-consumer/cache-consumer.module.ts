import { Module } from '@nestjs/common';
import { CacheConsumerService } from './cache-consumer.service';

@Module({
  providers: [CacheConsumerService],
})
export class CacheConsumerModule {}
