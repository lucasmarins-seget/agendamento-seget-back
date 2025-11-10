import { IsDateString, IsOptional, IsString } from 'class-validator';

export class SearchBookingDto {
  @IsString()
  @IsOptional()
  room?: string; //

  @IsDateString()
  @IsOptional()
  date?: string; //

  @IsString()
  @IsOptional()
  purpose?: string; //
}
