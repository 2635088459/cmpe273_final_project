import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BackupConsumerModule } from './backup-consumer/backup-consumer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
    }),
    BackupConsumerModule,
  ],
})
export class AppModule {}
