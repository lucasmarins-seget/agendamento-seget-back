import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { Booking } from 'src/entities/booking.entity';
import { Employee } from 'src/entities/employee.entity';
import { Repository } from 'typeorm';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ConfirmAttendanceDto } from './dto/confirm-attendance.dto';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly mailService: MailService,
  ) {}

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { email, bookingId } = verifyEmailDto;
    const verifyingEmail = email.toLowerCase();

    // 1. Busca o agendamento
    const booking = await this.bookingRepository.findOneBy({
      id: bookingId,
      status: 'approved',
    });

    if (!booking) {
      throw new NotFoundException(
        'Agendamento não encontrado ou não aprovado.',
      );
    }

    const employee = await this.employeeRepository.findOneBy({
      email: verifyingEmail,
    });

    if (employee) {
      // Se for colaborador, retorna o nome dele.
      return {
        exists: true,
        userData: {
          name: employee.full_name,
          isEmployee: true,
        },
      };
    }

    // CASO 2: É o Solicitante?
    const solicitanteEmail = booking.email.toLowerCase();
    const isSolicitante = verifyingEmail === solicitanteEmail;

    if (isSolicitante) {
      return {
        exists: true,
        userData: {
          name: booking.nome_completo,
          isEmployee: false,
        },
      };
    }

    // CASO 3: É um Convidado (não é colaborador, não é solicitante)
    return {
      exists: true,
      userData: {
        name: '', 
        isEmployee: false,
      },
    };
  }

  async confirmAttendance(confirmDto: ConfirmAttendanceDto) {
    const { bookingId, email, fullName, status } = confirmDto;

    const booking = await this.bookingRepository.findOneBy({
      id: bookingId,
      status: 'approved',
    });
    if (!booking) {
      throw new NotFoundException(
        'Agendamento não encontrado ou não aprovado.',
      );
    }

    const employee = await this.employeeRepository.findOneBy({
      email: email.toLowerCase(),
    });

    let attendance = await this.attendanceRepository.findOneBy({
      booking_id: bookingId,
      email: email.toLowerCase(),
    });

    if (attendance) {
      attendance.status = status;
      attendance.full_name = fullName;
      attendance.is_visitor = !employee;
      attendance.confirmed_at = new Date();
    } else {
      attendance = this.attendanceRepository.create({
        booking_id: bookingId,
        email: email.toLowerCase(),
        full_name: fullName,
        status: status,
        is_visitor: !employee,
        confirmed_at: new Date(),
      });
    }

    const savedRecord = await this.attendanceRepository.save(attendance);

    await this.mailService.sendAttendanceConfirmation(savedRecord, booking);

    return {
      success: true,
      message: 'Presença confirmada com sucesso',
      attendance: savedRecord, //
    };
  }
}
