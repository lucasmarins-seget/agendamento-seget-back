import { IsEmail, IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class UpdateAdminDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres' })
  password?: string; // Para resetar a senha

  @IsBoolean()
  @IsOptional()
  isSuperAdmin?: boolean;

  @IsString()
  @IsOptional()
  roomAccess?: string | null;
}