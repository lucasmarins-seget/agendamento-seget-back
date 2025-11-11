import { IsEmail, IsNotEmpty, IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

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

  @IsString()
  @IsOptional() // O acesso à sala é opcional
  roomAccess?: string | null;
}