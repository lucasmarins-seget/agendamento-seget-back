import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  MinLength,
  MaxLength,
  Matches,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value, { toClassOnly: true })
  room_name: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  tipoReserva?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z\s]*$/, { message: 'Nome não pode conter números' })
  @Transform(({ value }) => value, { toClassOnly: true })
  nomeCompleto: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value, { toClassOnly: true })
  setorSolicitante: string;

  @IsString()
  @IsNotEmpty()
  responsavel: string;

  @IsString()
  @MinLength(10)
  @MaxLength(11)
  telefone: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  // Agora aceita um array de strings
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  dates: string[];

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value, { toClassOnly: true })
  horaInicio: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value, { toClassOnly: true })
  horaFim: string;

  @IsNumber()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? parseInt(value, 10) : value)
  numeroParticipantes: number;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsNotEmpty()
  participantes: string[];

  @IsString()
  @IsNotEmpty()
  finalidade: string;

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsString()
  @IsOptional()
  observacao?: string; // Campo Novo

  // ... Campos de equipamentos permanecem iguais
  @IsString()
  @IsNotEmpty()
  projetor: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  somProjetor?: string;

  @IsString()
  @IsNotEmpty()
  internet: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  wifiTodos?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  conexaoCabo?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  softwareEspecifico?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  qualSoftware?: string;

  @IsString()
  @IsOptional()
  papelaria?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  materialExterno?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value, { toClassOnly: true })
  apoioEquipe?: string;
}