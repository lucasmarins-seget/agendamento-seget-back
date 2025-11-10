import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBlockDto {
  @IsIn(['receituario', 'escola_fazendaria', 'delta'])
  room: string; //

  @IsArray()
  @IsDateString({}, { each: true })
  dates: string[]; //

  @IsArray()
  @IsString({ each: true })
  times: string[]; //

  @IsArray()
  @IsOptional()
  bookingTypes?: string[]; //

  @IsString()
  @IsNotEmpty()
  reason: string; //
}
