import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('deletion_notifications')
export class DeletionNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  request_id: string;

  @Column({ type: 'varchar', length: 255 })
  subject_id: string;

  @Column({ type: 'varchar', length: 50 })
  notification_type: string;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn({ name: 'delivered_at' })
  delivered_at: Date;
}
