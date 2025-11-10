import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectBookingDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string; //
}
