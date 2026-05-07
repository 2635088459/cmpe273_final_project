import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheConsumerModule } from './cache-consumer/cache-consumer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    CacheConsumerModule,
  ],
})
export class AppModule {}
