import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ConfirmAttendanceDto {
  @IsUUID()
  bookingId: string; //

  @IsEmail()
  email: string; //

  @IsString()
  @IsNotEmpty()
  fullName: string; //

  @IsIn(['Presente', 'Ausente'])
  status: 'Presente' | 'Ausente'; //
}