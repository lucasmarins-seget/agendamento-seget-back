import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

    // Verifica se o email existe na tabela de employees
    const employee = await this.employeeRepository.findOneBy({
      email: verifyingEmail,
    });

    if (employee) {
      // Se for colaborador cadastrado, retorna o nome dele e isEmployee: true
      return {
        exists: true,
        userData: {
          name: employee.full_name,
          isEmployee: true,
        },
      };
    }

    // Se o email não estiver na tabela de employees, é um visitante
    // Retorna exists: false para indicar que é necessário pedir nome completo
    return {
      exists: false,
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

    // Validação de horário: só pode confirmar dentro do período do agendamento
    const now = new Date();
    const dates = booking.dates || [];

    if (dates.length > 0) {
      // Pega a primeira e última data do agendamento
      const sortedDates = [...dates].sort();
      const firstDateStr = sortedDates[0];
      const lastDateStr = sortedDates[sortedDates.length - 1];

      // Monta o horário de início (primeira data + hora_inicio)
      const [startYear, startMonth, startDay] = firstDateStr
        .split('-')
        .map(Number);
      const [startHour, startMinute] = booking.hora_inicio
        .split(':')
        .map(Number);
      const bookingStart = new Date(
        startYear,
        startMonth - 1,
        startDay,
        startHour,
        startMinute,
      );

      // Monta o horário de fim (última data + hora_fim)
      const [endYear, endMonth, endDay] = lastDateStr.split('-').map(Number);
      const [endHour, endMinute] = booking.hora_fim.split(':').map(Number);
      const bookingEnd = new Date(
        endYear,
        endMonth - 1,
        endDay,
        endHour,
        endMinute,
      );

      if (now < bookingStart) {
        const formattedStart = bookingStart.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        throw new BadRequestException(
          `A confirmação de presença só pode ser realizada a partir do início do agendamento (${formattedStart}).`,
        );
      }

      if (now > bookingEnd) {
        const formattedEnd = bookingEnd.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        throw new BadRequestException(
          `O período para confirmação de presença já encerrou (${formattedEnd}). Entre em contato com a administração.`,
        );
      }
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
