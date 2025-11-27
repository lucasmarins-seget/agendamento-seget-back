import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApprovePartialBookingDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  datesToApprove: string[];

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  rejectionReason?: string;
}
