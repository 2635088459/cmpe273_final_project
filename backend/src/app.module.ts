import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DeletionRequestModule } from './deletion-request/deletion-request.module';
import { EventPublisherService } from './events/event-publisher.service';
import { EventConsumerService } from './events/event-consumer.service';
import { DeletionRequest, DeletionStep, ProofEvent, ProcessedEvent, User, DeletionNotification } from './database/entities';
import { UsersModule } from './users/users.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthAggregatorModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { SchemaBootstrapService } from './database/schema-bootstrap.service';

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
        entities: [DeletionRequest, DeletionStep, ProofEvent, ProcessedEvent, User, DeletionNotification],
        synchronize: false, // Use migrations in production
        logging: configService.get('NODE_ENV') === 'development'
      }),
      inject: [ConfigService]
    }),
    TypeOrmModule.forFeature([ProofEvent, ProcessedEvent]), // For EventConsumerService
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    DeletionRequestModule,
    UsersModule,
    MetricsModule,
    HealthAggregatorModule,
    AdminModule
  ],
  providers: [
    SchemaBootstrapService,
    EventPublisherService,
    EventConsumerService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ]
})
export class AppModule {}
