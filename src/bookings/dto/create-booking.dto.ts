import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  IsNumber,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateBookingDto{
    @IsString() @IsNotEmpty()
    room: string;

    @IsString() @IsNotEmpty()
    roomName: string;

    @IsString() @IsNotEmpty()
    tipoReserva?: string;

    @IsString() @IsNotEmpty()
    @Matches(/^[a-zA-Z\s]*$/, { message: 'nome não pode conter números' })
    nomeCompleto: string;

    @IsString() @IsNotEmpty()
    setorSolicitante: string;
    
    @IsString() @IsNotEmpty()
    responsavel: string;

    @IsString() @MinLength(10) @MaxLength(11)
    telefone: string;

    @IsEmail()
    email: string;

    @IsDateString()
    data: string;

    @IsString() @IsNotEmpty()
    horaInicio: string; //

    @IsString() @IsNotEmpty()
    horaFim: string; //

    @IsNumber()
    numeroParticipantes: number; //

    @IsArray() @IsEmail({}, { each: true })
    participantes: string[]; //

    @IsString() @IsNotEmpty()
    finalidade: string; //

    @IsString() @IsNotEmpty()
    descricao: string; //

    // --- Equipamentos ---
    @IsString() @IsNotEmpty()
    projetor: string; //

    @IsString() @IsOptional()
    somProjetor?: string; //

    @IsString() @IsNotEmpty()
    internet: string; //

    @IsString() @IsOptional()
    wifiTodos?: string; //

    @IsString() @IsOptional()
    conexaoCabo?: string; //

    // --- Específicos Escola --- [cite: 104-108]
    @IsString() @IsOptional()
    softwareEspecifico?: string; //

    @IsString() @IsOptional()
    qualSoftware?: string; //

    @IsString() @IsOptional()
    papelaria?: string; //

    @IsString() @IsOptional()
    materialExterno?: string; //

    @IsString() @IsOptional()
    apoioEquipe?: string;
}