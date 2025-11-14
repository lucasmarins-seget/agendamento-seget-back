import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  fullName: string; 

  @IsEmail()
  @IsNotEmpty()
  email: string; 

  @IsString()
  @IsOptional()
  @MinLength(10)
  @MaxLength(11)
  telefone?: string;
}