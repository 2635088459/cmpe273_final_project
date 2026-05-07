import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsConsumerModule } from './analytics-consumer/analytics-consumer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    AnalyticsConsumerModule,
  ],
})
export class AppModule {}
