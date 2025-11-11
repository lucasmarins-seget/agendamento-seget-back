import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
  Request,
  Put,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
  Post,
  Delete,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import type { Response } from 'express';
import { SuperAdminGuard } from 'src/auth/guards/super-admin.guard';
import { CreateAdminDto } from 'src/auth/dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('users/create')
  @UseGuards(SuperAdminGuard) // Guardião 2: Garante que o usuário é SUPER ADMIN
  createAdmin(@Body() createAdminDto: CreateAdminDto) {
    return this.adminService.createAdmin(createAdminDto);
  }

  @Get('users') // <-- NOVA ROTA (R: Read All)
  @UseGuards(SuperAdminGuard)
  findAllAdmins() {
    return this.adminService.findAllAdmins();
  }

  @Get('users/:id') // <-- NOVA ROTA (R: Read One)
  @UseGuards(SuperAdminGuard)
  findOneAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findOneAdmin(id);
  }

  @Patch('users/:id') // <-- NOVA ROTA (U: Update)
  @UseGuards(SuperAdminGuard)
  updateAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAdminDto: UpdateAdminDto
  ) {
    return this.adminService.updateAdmin(id, updateAdminDto);
  }

  @Delete('users/:id') // <-- NOVA ROTA (D: Delete)
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  removeAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.removeAdmin(id);
  }

  @Get('bookings')
  findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '8',
    @Query('status') status: string,
    @Query('date') date: string,
    @Query('name') name: string,
    @Query('room') room: string,
    @Request() req,
  ) {
    const filters = { status, date, name, room };
    const pagination = { page: +page, limit: +limit };
    return this.adminService.findAll(pagination, filters, req.user);
  }

  @Get('bookings/:id/details')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.findOne(id, req.user);
  }

  @Patch('bookings/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.approve(id, req.user);
  }

  @Patch('bookings/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectBookingDto: RejectBookingDto,
    @Request() request,
  ) {
    return this.adminService.reject(id, rejectBookingDto, request.user);
  }

  @Put('bookings/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateBookingDto: UpdateBookingDto,
    @Request() request,
  ) {
    return this.adminService.update(id, updateBookingDto, request.user);
  }

  @Get('bookings/:id/attendance')
  getAttendance(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.getAttendance(id, req.user);
  }

  @Get('bookings/:id/attendance/pdf')
  async getAttendancePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.adminService.generateAttendancePdf(
      id,
      req.user,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': `attachment; filename=lista-presenca-${id}.pdf`,
    });

    res.end(pdfBuffer);
  }
}
