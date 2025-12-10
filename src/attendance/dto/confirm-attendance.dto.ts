import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class ConfirmAttendanceDto {
  @IsUUID()
  bookingId: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsIn(['Presente', 'Ausente'])
  status: 'Presente' | 'Ausente';

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato YYYY-MM-DD' })
  date?: string; // Data específica da confirmação (para agendamentos com múltiplas datas)
}
