import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events')
export class ProcessedEvent {
  @PrimaryColumn({ type: 'uuid' })
  event_id: string;

  @Column({ type: 'uuid' })
  request_id: string;

  @Column({ type: 'varchar', length: 100 })
  service_name: string;

  @CreateDateColumn({ name: 'processed_at' })
  processed_at: Date;
}
