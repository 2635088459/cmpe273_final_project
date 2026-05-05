import { Module } from '@nestjs/common';
import { SearchConsumerService } from './search-consumer.service';

@Module({
  providers: [SearchConsumerService],
})
export class SearchConsumerModule {}
