import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { Booking } from '../entities/booking.entity';
import { AttendanceRecord } from '../entities/attendance-record.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, AttendanceRecord]), // Para acessar o banco
    MailModule, // Para enviar email
  ],
  providers: [TasksService],
})
export class TasksModule { }