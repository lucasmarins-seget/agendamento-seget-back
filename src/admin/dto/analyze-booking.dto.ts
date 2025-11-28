import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AnalyzeBookingDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  observacao_admin?: string;
}