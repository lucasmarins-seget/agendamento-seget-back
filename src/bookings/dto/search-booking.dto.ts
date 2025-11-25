import { IsArray, IsOptional, IsString, IsDateString } from 'class-validator';

export class SearchBookingDto {
  @IsString()
  @IsOptional()
  room?: string;

  @IsArray()
  @IsOptional()
  @IsDateString({}, { each: true })
  dates?: string[];

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  sector?: string;

  @IsString()
  @IsOptional()
  purpose?: string;
}