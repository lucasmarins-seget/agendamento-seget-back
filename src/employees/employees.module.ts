import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.admin.controller'; // 1. Mude o import para o arquivo renomeado
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from 'src/entities/employee.entity';
import { AuthModule } from 'src/auth/auth.module';
import { PublicEmployeesController } from './employees.public.controller'; // 2. Importe o controller público

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee]),
    AuthModule, 
  ],
  controllers: [
    EmployeesController,       // O controlador de Admin (privado)
    PublicEmployeesController, // 3. Adicione o controlador público
  ],
  providers: [EmployeesService],
})
export class EmployeesModule {}