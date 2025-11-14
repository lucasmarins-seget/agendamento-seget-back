import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeDto } from './create-employee.dto';

// PartialType torna todos os campos do CreateEmployeeDto opcionais
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}