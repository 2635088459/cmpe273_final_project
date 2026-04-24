import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionRequestModule } from './deletion-request/deletion-request.module';
import { EventPublisherService } from './events/event-publisher.service';
import { EventConsumerService } from './events/event-consumer.service';
import { DeletionRequest, DeletionStep, ProofEvent, User } from './database/entities';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env'
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 5434),
        username: configService.get('DB_USERNAME', 'erasegraph'),
        password: configService.get('DB_PASSWORD', 'erasegraph_secret'),
        database: configService.get('DB_DATABASE', 'erasegraph'),
        entities: [DeletionRequest, DeletionStep, ProofEvent, User],
        synchronize: false, // Use migrations in production
        logging: configService.get('NODE_ENV') === 'development'
      }),
      inject: [ConfigService]
    }),
    TypeOrmModule.forFeature([ProofEvent]), // For EventConsumerService
    DeletionRequestModule,
    UsersModule
  ],
  providers: [EventPublisherService, EventConsumerService]
})
export class AppModule {}
