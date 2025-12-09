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
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ExternalParticipantDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  matricula?: string;
}

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

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @Transform(({ value }) => value, { toClassOnly: true })
  horaInicio: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @Transform(({ value }) => value, { toClassOnly: true })
  horaFim: string[];

  @IsArray()
  @IsEmail({}, { each: true })
  @IsNotEmpty()
  participantes: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalParticipantDto)
  @IsOptional()
  externalParticipants?: ExternalParticipantDto[];

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
