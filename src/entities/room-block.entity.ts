import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('room_blocks')
export class RoomBlock {
  @PrimaryGeneratedColumn('uuid')
  id: string; // [cite: 565]

  @Column({ type: 'varchar', length: 50, nullable: false })
  room: string; // [cite: 566]

  @Column({ type: 'varchar', length: 100, nullable: false })
  room_name: string; // [cite: 567]

  // 'simple-array' para compatibilidade com MySQL
  @Column({ type: 'simple-array', nullable: false })
  dates: string[]; // [cite: 568]

  @Column({ type: 'simple-array', nullable: false })
  times: string[]; // [cite: 569]

  @Column({ type: 'simple-array', nullable: true })
  booking_types: string[]; // [cite: 570]

  @Column({ type: 'varchar', length: 255, nullable: false })
  reason: string; // [cite: 571]

  @Column({ type: 'varchar', length: 255, nullable: false })
  created_by: string; // [cite: 572]

  @CreateDateColumn()
  created_at: Date; // [cite: 573]
}
