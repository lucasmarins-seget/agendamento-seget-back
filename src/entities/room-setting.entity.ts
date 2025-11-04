import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('room_settings')
export class RoomSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string; // [cite: 577]

  @Column({ type: 'varchar', length: 50, unique: true, nullable: false })
  room: string; // [cite: 578]

  @Column({ type: 'int', nullable: true })
  available_computers: number; // [cite: 579]

  @UpdateDateColumn()
  updated_at: Date; // [cite: 580]
}