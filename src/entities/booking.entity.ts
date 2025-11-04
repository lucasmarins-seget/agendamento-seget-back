import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { AttendanceRecord } from './attendance-record.entity';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string; // [cite: 482]

  @Column({ type: 'varchar', length: 50 })
  room: string; // [cite: 483]

  @Column({ type: 'varchar', length: 100 })
  room_name: string; // [cite: 483]

  @Column({ type: 'varchar', length: 50, nullable: true })
  tipo_reserva: string; // [cite: 484, 486]

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string; // [cite: 487]

  // --- Solicitante --- [cite: 488]
  @Column({ type: 'varchar', length: 255 })
  nome_completo: string; // [cite: 489]

  @Column({ type: 'varchar', length: 255 })
  setor_solicitante: string;

  @Column({ type: 'varchar', length: 255 })
  responsavel: string;

  @Column({ type: 'varchar', length: 20 }) // (11 dígitos + formatadores)
  telefone: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  // --- Data e Horário ---
  @Column({ type: 'varchar', length: 10 }) // (HH:mm)
  hora_inicio: string;

  @Column({ type: 'varchar', length: 10 }) // (HH:mm)
  hora_fim: string;

  // --- Evento --- [cite: 496]
  @Column({ type: 'int' })
  numero_participantes: number; // [cite: 499]

  // NOTA: 'simple-array' salva no MySQL como "email1@a.com,email2@b.com"
  @Column({ type: 'simple-array' })
  participantes: string[]; // [cite: 499]

  @Column({ type: 'text' })
  finalidade: string; // [cite: 500]

  @Column({ type: 'text' })
  descricao: string; // [cite: 501]

  // --- Equipamentos --- [cite: 502]
  @Column({ type: 'text' })
  projetor: string; // [cite: 503]

  @Column({ type: 'text', nullable: true })
  som_projetor: string; // [cite: 504]

  @Column({ type: 'text' })
  internet: string; // [cite: 505]

  @Column({ type: 'text', nullable: true })
  wifi_todos: string; // [cite: 506]

  @Column({ type: 'text', nullable: true })
  conexao_cabo: string; // [cite: 507]

  // --- Específicos Escola --- [cite: 508]
  @Column({ type: 'text', nullable: true })
  software_especifico: string; // [cite: 509]

  @Column({ type: 'text', nullable: true })
  qual_software: string; // [cite: 510]

  @Column({ type: 'text', nullable: true })
  papelaria: string; // [cite: 511]

  @Column({ type: 'text', nullable: true })
  material_externo: string; // [cite: 512]

  @Column({ type: 'text', nullable: true })
  apoio_equipe: string; // [cite: 513]

  // --- Metadata --- [cite: 514]
  @CreateDateColumn()
  created_at: Date; // [cite: 515]

  @UpdateDateColumn()
  updated_at: Date; // [cite: 516]

  @Column({ type: 'text', nullable: true })
  approved_by: string; // [cite: 517]

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date; // [cite: 519]

  @Column({ type: 'text', nullable: true })
  rejected_by: string; // [cite: 520]

  @Column({ type: 'timestamp', nullable: true })
  rejected_at: Date; // [cite: 521]

  @Column({ type: 'text', nullable: true })
  rejection_reason: string; // [cite: 522]

  // --- Relacionamento ---
  @OneToMany(() => AttendanceRecord, (record) => record.booking)
  attendance_records: AttendanceRecord[];
}