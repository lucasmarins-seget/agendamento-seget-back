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
  status: string;  

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

   // --- Data e Horário ---
  @Column({ type: 'date' })
  data: Date;

  @Column({ type: 'varchar', length: 10 }) // (HH:mm)
  hora_inicio: string;  // [cite: 495]

  @Column({ type: 'varchar', length: 10 }) // (HH:mm)
  hora_fim: string;  // [cite: 495]

   // --- Evento --- [cite: 496]
  @Column({ type: 'int' })
  numero_participantes: number;  // [cite: 499]

  @Column({ type: 'simple-array' })
  participantes: string[];  // [cite: 499]

  @Column({ type: 'varchar', length: 255 }) // ALTERADO
  finalidade: string;  // [cite: 500]

  @Column({ type: 'text' }) // MANTIDO
  descricao: string;  // [cite: 501]

   // --- Equipamentos --- [cite: 502]
  @Column({ type: 'varchar', length: 10 }) // ALTERADO (Sim/Não)
  projetor: string;  // [cite: 503]

  @Column({ type: 'varchar', length: 10, nullable: true }) // ALTERADO (Sim/Não)
  som_projetor: string;  // [cite: 504]

  @Column({ type: 'varchar', length: 10 }) // ALTERADO (Sim/Não)
  internet: string;  // [cite: 505]

  @Column({ type: 'varchar', length: 10, nullable: true }) // ALTERADO (Sim/Não)
  wifi_todos: string;  // [cite: 506]

  @Column({ type: 'varchar', length: 10, nullable: true }) // ALTERADO (Sim/Não)
  conexao_cabo: string;  // [cite: 507]

   // --- Específicos Escola --- [cite: 508]
  @Column({ type: 'varchar', length: 10, nullable: true }) // ALTERADO (Sim/Não)
  software_especifico: string;  // [cite: 509]

  @Column({ type: 'text', nullable: true }) // MANTIDO
  qual_software: string;  // [cite: 510]

  @Column({ type: 'text', nullable: true }) // MANTIDO
  papelaria: string;  // [cite: 511]

  @Column({ type: 'text', nullable: true }) // MANTIDO
  material_externo: string;  // [cite: 512]

  @Column({ type: 'varchar', length: 10, nullable: true }) // ALTERADO (Sim/Não)
  apoio_equipe: string;  // [cite: 513]

   // --- Metadata --- [cite: 514]
  @CreateDateColumn()
  created_at: Date;  // [cite: 515]

  @UpdateDateColumn()
  updated_at: Date;  // [cite: 516]

  @Column({ type: 'varchar', length: 255, nullable: true }) // ALTERADO (Email do Admin)
  approved_by: string;  // [cite: 517]

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date;  // [cite: 519]

  @Column({ type: 'varchar', length: 255, nullable: true }) // ALTERADO (Email do Admin)
  rejected_by: string;  // [cite: 520]

  @Column({ type: 'timestamp', nullable: true })
  rejected_at: Date;  // [cite: 521]

  @Column({ type: 'text', nullable: true }) // MANTIDO
  rejection_reason: string; // [cite: 522]

  // --- Relacionamento ---
  @OneToMany(() => AttendanceRecord, (record) => record.booking)
  attendance_records: AttendanceRecord[];
}