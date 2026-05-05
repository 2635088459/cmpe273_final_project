import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DeletionRequest } from './deletion-request.entity';

@Entity('proof_events')
export class ProofEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'varchar', length: 50 })
  service_name: string;

  @Column({ type: 'varchar', length: 50 })
  event_type: string;

  @Column({ type: 'varchar', length: 255 })
  dedupe_key: string;

  @Column({ type: 'jsonb', default: '{}' })
  payload: any;

  @Column({ type: 'varchar', length: 128, nullable: true })
  previous_hash: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  event_hash: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => DeletionRequest, request => request.proof_events)
  @JoinColumn({ name: 'request_id' })
  request: DeletionRequest;
}
