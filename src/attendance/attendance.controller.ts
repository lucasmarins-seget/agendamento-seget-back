import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ConfirmAttendanceDto } from './dto/confirm-attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() verifyEmailDto: VerifyEmailDto){
    return this.attendanceService.verifyEmail(verifyEmailDto);
  }

  @Post('confirm')
  confirmAttendance(@Body() confirmAttendanceDto: ConfirmAttendanceDto){
    return this.attendanceService.confirmAttendance(confirmAttendanceDto)
  }
  
}
