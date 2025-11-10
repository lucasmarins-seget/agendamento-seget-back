import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string; // [cite: 556]

  @Column({ type: 'varchar', length: 255, nullable: false })
  full_name: string; // [cite: 557]

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  email: string; // [cite: 558]

  @Column({ type: 'varchar', length: 255, nullable: true })
  sector: string; // [cite: 559]

  @CreateDateColumn()
  created_at: Date; // [cite: 560]
}
