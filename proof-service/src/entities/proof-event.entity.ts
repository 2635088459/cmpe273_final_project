import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

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

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
