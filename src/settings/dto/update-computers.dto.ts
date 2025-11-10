import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class UpdateComputersDto {
  @IsInt()
  @Min(0)
  availableComputers: number; //
}
