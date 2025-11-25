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

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  room: string;

  @IsString()
  @IsNotEmpty()
  roomName: string;

  @IsString()
  @IsOptional()
  tipoReserva?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z\s]*$/, { message: 'Nome não pode conter números' })
  nomeCompleto: string;

  @IsString()
  @IsNotEmpty()
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
  horaInicio: string;

  @IsString()
  @IsNotEmpty()
  horaFim: string;

  @IsNumber()
  @IsNotEmpty()
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
  somProjetor?: string;

  @IsString()
  @IsNotEmpty()
  internet: string;

  @IsString()
  @IsOptional()
  wifiTodos?: string;

  @IsString()
  @IsOptional()
  conexaoCabo?: string;

  @IsString()
  @IsOptional()
  softwareEspecifico?: string;

  @IsString()
  @IsOptional()
  qualSoftware?: string;

  @IsString()
  @IsOptional()
  papelaria?: string;

  @IsString()
  @IsOptional()
  materialExterno?: string;

  @IsString()
  @IsOptional()
  apoioEquipe?: string;
}