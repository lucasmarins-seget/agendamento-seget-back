import { IsEmail, IsNotEmpty, IsUUID } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email: string; //

  @IsUUID()
  bookingId: string; //
}
