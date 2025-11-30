import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveBookingDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  local?: string;
}
