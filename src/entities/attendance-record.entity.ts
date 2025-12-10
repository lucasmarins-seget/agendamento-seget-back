import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Booking } from './booking.entity';

@Entity('attendance_records')
// Removemos a constraint única aqui e faremos a validação no código
// para manter compatibilidade com registros antigos
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  booking_id: string;

  // Define o relacionamento: Muitos registros de presença para 1 agendamento
  @ManyToOne(() => Booking, (booking) => booking.attendance_records, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking: Booking;

  @Column({ type: 'varchar', length: 255, nullable: false })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  full_name: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  status: string;

  @Column({ type: 'boolean', default: false })
  is_visitor: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true, default: null })
  attendance_date: string | null; // Data específica da confirmação (formato YYYY-MM-DD)

  @Column({ type: 'timestamp', nullable: true })
  confirmed_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
