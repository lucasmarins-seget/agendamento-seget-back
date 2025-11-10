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
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import type { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
