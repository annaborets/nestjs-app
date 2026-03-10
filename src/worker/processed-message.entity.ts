import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('processed_messages')
export class ProcessedMessage {
  @PrimaryColumn('uuid')
  messageId: string;

  @Column()
  orderId: number;

  @Column({ nullable: true })
  handler: string;

  @CreateDateColumn()
  processedAt: Date;
}
