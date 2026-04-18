import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProofEvent } from './entities';
import { ProofConsumerModule } from './proof-consumer/proof-consumer.module';
import { ProofModule } from './proof/proof.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../.env',
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
        entities: [ProofEvent],
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([ProofEvent]),
    ProofConsumerModule,
    ProofModule,
  ],
})
export class AppModule {}
