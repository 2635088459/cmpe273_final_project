import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchConsumerModule } from './search-consumer/search-consumer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    SearchConsumerModule,
  ],
})
export class AppModule {}
