import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionConsumerModule } from './deletion-consumer/deletion-consumer.module';
import { User } from './entities/user.entity';

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
        entities: [User],
        synchronize: false, // Use migrations in production
        logging: configService.get('NODE_ENV') === 'development'
      }),
      inject: [ConfigService]
    }),
    DeletionConsumerModule
  ]
})
export class AppModule {}