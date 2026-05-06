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

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'previous_hash' })
  previous_hash: string;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'event_hash' })
  event_hash: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
