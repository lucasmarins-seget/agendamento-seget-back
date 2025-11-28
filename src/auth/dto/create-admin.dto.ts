import { IsEmail, IsNotEmpty, IsString, IsBoolean, IsOptional, MinLength, ValidateIf } from 'class-validator';

export class CreateAdminDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  password: string;

  @IsBoolean()
  isSuperAdmin: boolean;

  @ValidateIf((o) => !o.isSuperAdmin) // Valida apenas se NÃO é superadmin
  @IsString()
  @IsNotEmpty({ message: 'Usuários que não são Super Admin devem ter acesso a uma sala' })
  roomAccess?: string | null; // Obrigatório se não é superadmin, pode ser null se for superadmin
}