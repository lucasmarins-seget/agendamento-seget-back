import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuthModule } from 'src/auth/auth.module'; // 1. Importar AuthModule
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from 'src/entities/booking.entity';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { MailModule } from 'src/mail/mail.module';
import { AdminUser } from 'src/entities/admin-user.entity';
import { Employee } from 'src/entities/employee.entity';
import { ExternalParticipant } from 'src/entities/external-participant.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Booking,
      AttendanceRecord,
      AdminUser,
      Employee,
      ExternalParticipant,
    ]),
    MailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
