import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Employee } from 'src/entities/employee.entity';
import { Repository } from 'typeorm';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async create(createEmployeeDto: CreateEmployeeDto) {
    
    const existing = await this.employeeRepository.findOneBy({ 
      email: createEmployeeDto.email 
    });
    if (existing) {
      throw new ConflictException('O e-mail fornecido já está em uso.');
    }

    const employee = this.employeeRepository.create({
      full_name: createEmployeeDto.fullName,
      email: createEmployeeDto.email,
      telefone: createEmployeeDto.telefone,
    });
    
    return this.employeeRepository.save(employee);
  }


  findAll() {
    return this.employeeRepository.find({
      order: { full_name: 'ASC' }
    });
  }

  findOne(id: string) {

    return this.employeeRepository.findOneByOrFail({ id });
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    const employee = await this.findOne(id);

    if (updateEmployeeDto.email && updateEmployeeDto.email !== employee.email) {
      const existing = await this.employeeRepository.findOneBy({ 
        email: updateEmployeeDto.email 
      });
      if (existing) {
        throw new ConflictException('O e-mail fornecido já está em uso por outro colaborador.');
      }
    }

    const dtoData = {
      full_name: updateEmployeeDto.fullName,
      email: updateEmployeeDto.email,
      telefone: updateEmployeeDto.telefone,
    };

    this.employeeRepository.merge(employee, dtoData);
    return this.employeeRepository.save(employee);
  }

  async remove(id: string) {
    const employee = await this.findOne(id);

    await this.employeeRepository.remove(employee);
    return {
      success: true,
      message: 'Colaborador removido com sucesso.'
    };
  }
}