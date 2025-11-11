import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn('uuid')
  id: string; // [cite: 530]

  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  email: string; // [cite: 531]

  @Column({ type: 'text', nullable: false, select: false }) // 'select: false' impede que a senha seja retornada em buscas
  password_hash: string; // [cite: 532]

  @Column({ type: 'varchar', length: 50, nullable: true })
  room_access: string | null;

  @Column({ type: 'boolean', default: false })
  is_super_admin: boolean; // [cite: 534]

  @CreateDateColumn()
  created_at: Date; // [cite: 535]
}
