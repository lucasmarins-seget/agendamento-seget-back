import { Controller, Get } from '@nestjs/common';
import { EmployeesService } from './employees.service';

/**
 * Este controlador expõe rotas públicas relacionadas a colaboradores.
 * A rota /api/employees é usada pelo front-end para
 * popular seletores e autocompletar.
 */
@Controller('employees') // Rota final: /api/employees
export class PublicEmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /**
   * Lista todos os colaboradores
   */
  @Get()
  findAll() {
    // Reutiliza o método 'findAll' do serviço que já existe
    return this.employeesService.findAll();
  }
}