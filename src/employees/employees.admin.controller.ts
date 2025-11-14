import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  ParseUUIDPipe, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from 'src/auth/guards/super-admin.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

// 1. Define a rota base para /api/admin/employees
@Controller('admin/employees')
// 2. Protege TODAS as rotas deste controlador
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /**
   * Adicionar (POST /api/admin/employees)
   */
  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  /**
   * Listar (GET /api/admin/employees)
   */
  @Get()
  findAll() {
    return this.employeesService.findAll();
  }

  /**
   * Buscar Um (GET /api/admin/employees/:id)
   */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.findOne(id);
  }

  /**
   * Editar (PATCH /api/admin/employees/:id)
   */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateEmployeeDto: UpdateEmployeeDto
  ) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  /**
   * Remover (DELETE /api/admin/employees/:id)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK) // Retorna 200 OK em vez de 204 No Content
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employeesService.remove(id);
  }
}