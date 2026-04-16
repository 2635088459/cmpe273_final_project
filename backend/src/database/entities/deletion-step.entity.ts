import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DeletionRequest } from './deletion-request.entity';

export enum DeletionStepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING'
}

@Entity('deletion_steps')
export class DeletionStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'varchar', length: 50 })
  step_name: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: DeletionStepStatus.PENDING
  })
  status: DeletionStepStatus;

  @Column({ type: 'int', default: 0 })
  attempt_count: number;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  error_message: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => DeletionRequest, request => request.steps)
  @JoinColumn({ name: 'request_id' })
  request: DeletionRequest;
}