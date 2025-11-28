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

  @Column({ type: 'varchar', length: 100, unique: true, nullable: false })
  room_name: string; // [cite: 578]

  @Column({ type: 'int', nullable: true })
  available_computers: number; // [cite: 579]

  @UpdateDateColumn()
  updated_at: Date; // [cite: 580]
}
