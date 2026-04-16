import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { DeletionConsumerService } from './deletion-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [DeletionConsumerService],
})
export class DeletionConsumerModule {}
