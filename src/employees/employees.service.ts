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

  /**
   * Adicionar (POST)
   */
  async create(createEmployeeDto: CreateEmployeeDto) {
    // 1. Verifica se o email já existe
    const existing = await this.employeeRepository.findOneBy({ 
      email: createEmployeeDto.email 
    });
    if (existing) {
      throw new ConflictException('O e-mail fornecido já está em uso.');
    }

    // 2. Cria e salva o novo colaborador
    const employee = this.employeeRepository.create({
      full_name: createEmployeeDto.fullName,
      email: createEmployeeDto.email,
      telefone: createEmployeeDto.telefone, // Corrigido
    });
    
    return this.employeeRepository.save(employee);
  }

  /**
   * Listar (GET)
   */
  async findAll() {
    // Retorna todos, ordenados por nome
    return await this.employeeRepository.find({
      select: ['id','full_name'],
      order: { full_name: 'ASC' }
    });
  }

  /**
   * Buscar Um (GET :id)
   */
  findOne(id: string) {
    // findOneByOrFail já lança um 404 Not Found se não encontrar
    return this.employeeRepository.findOneByOrFail({ id });
  }

  /**
   * Editar (PATCH :id)
   */
  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    // 1. Busca o colaborador
    const employee = await this.findOne(id);

    // 2. Se for trocar o e-mail, verifica se o NOVO e-mail já existe
    if (updateEmployeeDto.email && updateEmployeeDto.email !== employee.email) {
      const existing = await this.employeeRepository.findOneBy({ 
        email: updateEmployeeDto.email 
      });
      if (existing) {
        throw new ConflictException('O e-mail fornecido já está em uso por outro colaborador.');
      }
    }

    // 3. Mapeia os dados do DTO para a entidade
    const dtoData = {
      full_name: updateEmployeeDto.fullName,
      email: updateEmployeeDto.email,
      telefone: updateEmployeeDto.telefone, // Corrigido
    };

    // 4. Mescla e salva
    this.employeeRepository.merge(employee, dtoData);
    return this.employeeRepository.save(employee);
  }

  /**
   * Remover (DELETE :id)
   */
  async remove(id: string) {
    // 1. Busca o colaborador (para garantir que existe antes de deletar)
    const employee = await this.findOne(id);
    
    // 2. Remove
    await this.employeeRepository.remove(employee);
    
    // Retorna 'void' (vazio) ou uma mensagem de sucesso
    return {
      success: true,
      message: 'Colaborador removido com sucesso.'
    };
  }
}