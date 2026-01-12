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

type AttendanceEmailInfo = {
  fullName: string;
  isVisitor: boolean;
};

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
  ) { }

  private normalizeEmail(email?: string | null): string | null {
    return email ? email.toLowerCase().trim() : null;
  }

  private async getAttendanceEmailMap(
    bookingId: string,
  ): Promise<Map<string, AttendanceEmailInfo>> {
    const records = await this.attendanceRepository.find({
      where: { booking_id: bookingId },
      select: ['email', 'full_name', 'is_visitor'],
    });

    const map = new Map<string, AttendanceEmailInfo>();

    for (const record of records) {
      const normalizedEmail = this.normalizeEmail(record.email);
      if (!normalizedEmail) continue;

      map.set(normalizedEmail, {
        fullName: record.full_name,
        isVisitor: record.is_visitor,
      });
    }

    return map;
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { email, bookingId } = verifyEmailDto;
    const verifyingEmail = this.normalizeEmail(email);

    if (!verifyingEmail) {
      throw new BadRequestException('E-mail inválido.');
    }

    // 1. Busca o agendamento com participantes externos
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, status: 'approved' },
      relations: ['external_participants'],
    });

    if (!booking) {
      throw new NotFoundException(
        'Agendamento não encontrado ou não aprovado.',
      );
    }

    // 2. Email do solicitante do agendamento
    const solicitanteEmail = this.normalizeEmail(booking.email);

    // 3. Participantes SEGET - o campo 'participantes' já contém emails
    const participantEmails = (booking.participantes || [])
      .map((participantEmail) => this.normalizeEmail(participantEmail))
      .filter((value): value is string => Boolean(value));

    // 4. Busca emails dos participantes externos
    const externalEmails =
      booking.external_participants
        ?.map((participant) => this.normalizeEmail(participant.email))
        .filter((value): value is string => Boolean(value)) || [];

    // 5. Busca emails já existentes em registros de presença
    const attendanceEmailMap = await this.getAttendanceEmailMap(bookingId);

    // 6. Combina todos os emails permitidos eliminando duplicatas
    const allowedEmailsSet = new Set<string>();
    if (solicitanteEmail) allowedEmailsSet.add(solicitanteEmail);
    participantEmails.forEach((participantEmail) =>
      allowedEmailsSet.add(participantEmail),
    );
    externalEmails.forEach((externalEmail) =>
      allowedEmailsSet.add(externalEmail),
    );
    for (const attendanceEmail of attendanceEmailMap.keys()) {
      allowedEmailsSet.add(attendanceEmail);
    }

    console.log('Email verificando:', verifyingEmail);
    console.log('Emails permitidos:', Array.from(allowedEmailsSet));

    // 7. Valida se o email está na lista de permitidos
    if (!allowedEmailsSet.has(verifyingEmail)) {
      throw new BadRequestException(
        'E-mail não cadastrado na base de participantes deste agendamento. Por favor, dirija-se ao RH para atualizar seu e-mail.',
      );
    }

    // 8. Se é o solicitante do agendamento
    if (verifyingEmail === solicitanteEmail) {
      return {
        exists: true,
        userData: {
          name: booking.nome_completo,
          isEmployee: true,
        },
      };
    }

    // 9. Verifica se o email existe na tabela de employees
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

    // 10. Se não é employee, busca nos participantes externos
    const externalParticipant = booking.external_participants?.find(
      (participant) => this.normalizeEmail(participant.email) === verifyingEmail,
    );

    if (externalParticipant) {
      return {
        exists: true,
        userData: {
          name: externalParticipant.full_name,
          isEmployee: false,
        },
      };
    }

    // 11. Fallback utilizando registro de presença pré-existente
    const attendanceInfo = attendanceEmailMap.get(verifyingEmail);
    if (attendanceInfo) {
      return {
        exists: true,
        userData: {
          name: attendanceInfo.fullName || '',
          isEmployee: !attendanceInfo.isVisitor,
        },
      };
    }

    // 12. Fallback - email está na lista de participantes mas não encontrado em employees/externos
    // Isso pode acontecer se o email foi adicionado manualmente na lista de participantes
    return {
      exists: true,
      userData: {
        name: '',
        isEmployee: false,
      },
    };
  }

  async confirmAttendance(confirmDto: ConfirmAttendanceDto) {
    const { bookingId, email, fullName, status, date } = confirmDto;
    const verifyingEmail = this.normalizeEmail(email);

    if (!verifyingEmail) {
      throw new BadRequestException('E-mail inválido.');
    }

    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId, status: 'approved' },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException(
        'Agendamento não encontrado ou não aprovado.',
      );
    }

    // Validação: o email deve estar na lista de participantes SEGET, externos ou ser o solicitante
    // Email do solicitante
    const solicitanteEmail = this.normalizeEmail(booking.email);

    // Participantes SEGET - o campo 'participantes' já contém emails (não IDs)
    const participantEmails = (booking.participantes || [])
      .map((participantEmail) => this.normalizeEmail(participantEmail))
      .filter((value): value is string => Boolean(value));

    // Participantes externos
    const externalEmails =
      booking.external_participants
        ?.map((participant) => this.normalizeEmail(participant.email))
        .filter((value): value is string => Boolean(value)) || [];

    // Emails existentes em registros de presença
    const attendanceEmailMap = await this.getAttendanceEmailMap(bookingId);

    // Combina todos os emails permitidos
    const allowedEmailsSet = new Set<string>();
    if (solicitanteEmail) allowedEmailsSet.add(solicitanteEmail);
    participantEmails.forEach((participantEmail) =>
      allowedEmailsSet.add(participantEmail),
    );
    externalEmails.forEach((externalEmail) =>
      allowedEmailsSet.add(externalEmail),
    );
    for (const attendanceEmail of attendanceEmailMap.keys()) {
      allowedEmailsSet.add(attendanceEmail);
    }

    if (!allowedEmailsSet.has(verifyingEmail)) {
      throw new BadRequestException(
        'E-mail não cadastrado na base de participantes deste agendamento. Por favor, dirija-se ao RH para atualizar seu e-mail.',
      );
    }

    // Determina a data de confirmação
    const dates = booking.dates || [];
    let attendanceDate: string;

    if (date) {
      // Se uma data foi especificada, verifica se ela pertence ao agendamento
      if (!dates.includes(date)) {
        throw new BadRequestException(
          'A data especificada não faz parte deste agendamento.',
        );
      }
      attendanceDate = date;
    } else if (dates.length === 1) {
      // Se só tem uma data, usa ela automaticamente
      attendanceDate = dates[0];
    } else {
      // Se tem múltiplas datas e nenhuma foi especificada, usa a data atual se pertencer ao agendamento
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      if (dates.includes(today)) {
        attendanceDate = today;
      } else {
        // Se a data atual não está no agendamento, usa a primeira data
        const sortedDates = [...dates].sort();
        attendanceDate = sortedDates[0];
      }
    }

    // Validação de horário: só pode confirmar dentro do período do agendamento para a data específica
    const now = new Date();

    // Monta o horário de início e fim para a data específica
    const dateIndex = dates.indexOf(attendanceDate);
    const [year, month, day] = attendanceDate.split('-').map(Number);

    const horaInicioStr = Array.isArray(booking.hora_inicio)
      ? booking.hora_inicio[dateIndex] || booking.hora_inicio[0]
      : booking.hora_inicio;

    if (!horaInicioStr) {
      throw new BadRequestException('Horário de início não encontrado para esta data.');
    }

    const [startHour, startMinute] = horaInicioStr.split(':').map(Number);
    const bookingStart = new Date(year, month - 1, day, startHour, startMinute);

    const horaFimStr = Array.isArray(booking.hora_fim)
      ? booking.hora_fim[dateIndex] || booking.hora_fim[booking.hora_fim.length - 1]
      : booking.hora_fim;

    if (!horaFimStr) {
      throw new BadRequestException('Horário de término não encontrado para esta data.');
    }

    const [endHour, endMinute] = horaFimStr.split(':').map(Number);
    const bookingEnd = new Date(year, month - 1, day, endHour, endMinute);

    // Adiciona 1 hora ao horário de fim para permitir confirmação tardia
    const confirmationDeadline = new Date(bookingEnd.getTime() + 60 * 60 * 1000);

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

    if (now > confirmationDeadline) {
      const formattedDeadline = confirmationDeadline.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      throw new BadRequestException(
        `O período para confirmação de presença já encerrou (${formattedDeadline}). Entre em contato com a administração.`,
      );
    }

    const employee = await this.employeeRepository.findOneBy({
      email: verifyingEmail,
    });

    const sanitizedFullName = fullName.trim();
    const attendanceInfo = attendanceEmailMap.get(verifyingEmail);
    const derivedIsVisitor =
      attendanceInfo !== undefined ? attendanceInfo.isVisitor : !employee;

    // Busca registro existente para a mesma data
    let existingAttendance = await this.attendanceRepository.findOneBy({
      booking_id: bookingId,
      email: verifyingEmail,
      attendance_date: attendanceDate,
    });

    let savedRecord: AttendanceRecord;

    if (existingAttendance) {
      // Se já existe um registro mas ainda está pendente, atualiza
      if (existingAttendance.status === 'Pendente') {
        existingAttendance.status = status;
        existingAttendance.full_name = sanitizedFullName;
        existingAttendance.is_visitor = derivedIsVisitor;
        existingAttendance.confirmed_at = new Date();
        savedRecord = await this.attendanceRepository.save(existingAttendance);
      } else {
        // Se já confirmou (Presente ou Ausente), impede alteração
        const formattedDate = new Date(attendanceDate + 'T00:00:00').toLocaleDateString('pt-BR');
        const statusText = existingAttendance.status === 'Presente' ? 'presença' : 'ausência';
        throw new BadRequestException(
          `Você já confirmou sua ${statusText} para o dia ${formattedDate}. Não é possível alterar a confirmação.`,
        );
      }
    } else {
      // Se não existe registro (caso antigo ou erro), cria um novo
      const attendance = this.attendanceRepository.create({
        booking_id: bookingId,
        email: verifyingEmail,
        full_name: sanitizedFullName,
        status: status,
        is_visitor: derivedIsVisitor,
        attendance_date: attendanceDate,
        confirmed_at: new Date(),
      });
      savedRecord = await this.attendanceRepository.save(attendance);
    }

    await this.mailService.sendAttendanceConfirmation(savedRecord, booking);

    return {
      success: true,
      message: 'Presença confirmada com sucesso',
      attendance: savedRecord,
      date: attendanceDate,
    };
  }
}
