import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Booking } from './booking.entity';

@Entity('attendance_records')
@Unique(['booking_id', 'email']) // [cite: 548]
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string; // [cite: 540]

  @Column({ type: 'uuid' }) // Coluna para a chave estrangeira
  booking_id: string; // [cite: 541]

  // Define o relacionamento: Muitos registros de presença para 1 agendamento
  @ManyToOne(() => Booking, (booking) => booking.attendance_records, {
    onDelete: 'CASCADE', // Se o agendamento for deletado, os registros de presença também são
  })
  @JoinColumn({ name: 'booking_id' }) // Especifica qual coluna faz a ligação
  booking: Booking;

  @Column({ type: 'varchar', length: 255, nullable: false })
  email: string; // [cite: 542]

  @Column({ type: 'varchar', length: 255, nullable: false })
  full_name: string; // [cite: 543]

  @Column({ type: 'varchar', length: 50, nullable: false })
  status: string; // [cite: 544]

  @Column({ type: 'boolean', default: false })
  is_visitor: boolean; // [cite: 545]

  @Column({ type: 'timestamp', nullable: true })
  confirmed_at: Date; // [cite: 546]

  @CreateDateColumn()
  created_at: Date; // [cite: 547]
}
