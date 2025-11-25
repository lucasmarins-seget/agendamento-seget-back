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
  id: string;

  @Column({ type: 'varchar', length: 50 })
  room: string;

  @Column({ type: 'varchar', length: 100 })
  room_name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tipo_reserva: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: string; // 'pending', 'approved', 'rejected', 'em_analise'

  // --- Solicitante ---
  @Column({ type: 'varchar', length: 255 })
  nome_completo: string;

  @Column({ type: 'varchar', length: 255 })
  setor_solicitante: string;

  @Column({ type: 'varchar', length: 255 })
  responsavel: string;

  @Column({ type: 'varchar', length: 20 })
  telefone: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'simple-array' })
  dates: string[];

  @Column({ type: 'varchar', length: 10 })
  hora_inicio: string;

  @Column({ type: 'varchar', length: 10 })
  hora_fim: string;

  // --- Evento ---
  @Column({ type: 'int' })
  numero_participantes: number;

  @Column({ type: 'simple-array' })
  participantes: string[];

  @Column({ type: 'varchar', length: 255 })
  finalidade: string;

  @Column({ type: 'text' })
  descricao: string;

  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  local: string | null;

  // --- Equipamentos ---
  @Column({ type: 'varchar', length: 10 })
  projetor: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  som_projetor: string;

  @Column({ type: 'varchar', length: 10 })
  internet: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  wifi_todos: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  conexao_cabo: string;

  // --- Específicos Escola ---
  @Column({ type: 'varchar', length: 10, nullable: true })
  software_especifico: string;

  @Column({ type: 'text', nullable: true })
  qual_software: string;

  @Column({ type: 'text', nullable: true })
  papelaria: string;

  @Column({ type: 'text', nullable: true })
  material_externo: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  apoio_equipe: string;

  // --- Metadata ---
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approved_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  rejected_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  rejected_at: Date | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @OneToMany(() => AttendanceRecord, (record) => record.booking)
  attendance_records: AttendanceRecord[];
}