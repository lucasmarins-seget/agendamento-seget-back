import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SearchBookingDto {
  @IsString()
  @IsOptional()
  room?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  sector?: string;
}
