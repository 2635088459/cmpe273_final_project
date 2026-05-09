import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { DeletionStep } from './deletion-step.entity';
import { ProofEvent } from './proof-event.entity';

export enum DeletionRequestStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  PARTIAL_COMPLETED = 'PARTIAL_COMPLETED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SLA_VIOLATED = 'SLA_VIOLATED'
}

@Entity('deletion_requests')
export class DeletionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  subject_id: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: DeletionRequestStatus.PENDING
  })
  status: DeletionRequestStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  trace_id: string;

  @Column({ type: 'timestamp', name: 'requested_at', default: () => 'now()' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date;

  @OneToMany(() => DeletionStep, step => step.request)
  steps: DeletionStep[];

  @OneToMany(() => ProofEvent, event => event.request)
  proof_events: ProofEvent[];
}