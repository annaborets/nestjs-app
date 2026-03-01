import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { OutboxStatus } from './models/outbox-status.enum';

@Entity('outbox_messages')
export class OutboxMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  exchange: string;

  @Column()
  routingKey: string;

  @Column('jsonb')
  payload: object;

  @Column({ default: OutboxStatus.PENDING })
  status: OutboxStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;
}
