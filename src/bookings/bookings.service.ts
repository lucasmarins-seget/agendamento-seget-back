import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from '../entities/booking.entity';
import { RoomBlock } from '../entities/room-block.entity';
import { RoomSetting } from '../entities/room-setting.entity';
import {
  Repository,
  FindOptionsWhere,
  Like,
  In,
  LessThan,
  MoreThan,
  Not,
} from 'typeorm';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MailService } from 'src/mail/mail.service';
import { SearchBookingDto } from './dto/search-booking.dto';
import { AdminUser } from 'src/entities/admin-user.entity';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(RoomBlock)
    private readonly roomBlockRepository: Repository<RoomBlock>,
    @InjectRepository(RoomSetting)
    private readonly roomSettingRepository: Repository<RoomSetting>,
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    private readonly mailService: MailService,
  ) {}

  async create(createBookingDto: CreateBookingDto) {
    const {
      dates,
      horaInicio,
      horaFim,
      room_name,
      tipoReserva,
      numeroParticipantes,
      observacao,
    } = createBookingDto;

    // --- 1. VALIDAÇÃO DE HORÁRIO E DURAÇÃO ---

    // Converter para minutos para facilitar comparação
    const [hIni, mIni] = horaInicio.split(':').map(Number);
    const [hFim, mFim] = horaFim.split(':').map(Number);
    const inicioMinutos = hIni * 60 + mIni;
    const fimMinutos = hFim * 60 + mFim;

    // Regra: Hora Fim deve ser maior que Hora Início
    if (fimMinutos <= inicioMinutos) {
      throw new BadRequestException(
        'A hora final deve ser maior que a hora inicial.',
      );
    }

    // Regra: Mínimo de 1 hora de duração
    if (fimMinutos - inicioMinutos < 60) {
      throw new BadRequestException(
        'O agendamento deve ter duração mínima de 1 hora.',
      );
    }

    // --- 2. VALIDAÇÃO DE FINAIS DE SEMANA ---
    for (const dateStr of dates) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay(); // 0 = Dom, 6 = Sab
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        throw new BadRequestException(
          `A data ${dateStr} cai em um final de semana. Não permitido.`,
        );
      }
    }

    let initialStatus = 'pending';

    // --- 3. REGRAS ESPECÍFICAS: ESCOLA FAZENDÁRIA ---
    if (room_name === 'escola_fazendaria') {
      // Regra: Exatamente 3 datas
      if (dates.length !== 3) {
        throw new BadRequestException(
          'Para a Escola Fazendária, é obrigatório selecionar exatamente 3 datas.',
        );
      }

      // Regra: Validação de Horários APENAS para reserva de SALA
      if (tipoReserva === 'sala') {
        // Horários Permitidos (09:00 as 17:00)
        // Início máximo 16:00, Fim máximo 17:00, Início mínimo 09:00
        if (horaInicio < '09:00' || horaInicio > '16:00') {
          throw new BadRequestException(
            'Horário de início inválido para Escola Fazendária (permitido entre 09:00 e 16:00).',
          );
        }
        if (horaFim < '10:00' || horaFim > '17:00') {
          throw new BadRequestException(
            'Horário de fim inválido para Escola Fazendária (permitido entre 10:00 e 17:00).',
          );
        }
      }
      // Para 'computador', não há restrição de horário

      // Regra: Status Inicial "Em Análise"
      initialStatus = 'pending';
    }

    // --- 4. VALIDAÇÃO DE BLOQUEIOS ADMINISTRATIVOS ---
    const blocks = await this.roomBlockRepository.findBy({ room_name });
    for (const dateStr of dates) {
      // Verifica se a data está na lista de bloqueios
      const blockOnDate = blocks.find((b) => b.dates.includes(dateStr));

      if (blockOnDate) {
        // Se houver bloqueio na data, verifica colisão de horário
        // Se o horário do bloqueio colidir com o do agendamento
        const isTimeBlocked = blockOnDate.times.some((blockedTime) => {
          // Lógica simplificada: se o horário bloqueado estiver DENTRO do intervalo do agendamento
          // ou se o agendamento tentar pegar o horário exato
          return blockedTime >= horaInicio && blockedTime < horaFim;
        });

        if (isTimeBlocked) {
          throw new BadRequestException(
            `O horário no dia ${dateStr} está bloqueado pela administração (Motivo: ${blockOnDate.reason}).`,
          );
        }
      }
    }

    // --- 5. VALIDAÇÃO DE CONFLITOS DE AGENDAMENTO ---

    // Caso A: Escola Fazendária - Computador
    // Limite de 5 computadores por hora (status diferente de 'rejected')
    if (room_name === 'escola_fazendaria' && tipoReserva === 'computador') {
      const MAX_COMPUTERS_PER_HOUR = 5;

      for (const dateStr of dates) {
        // Verifica disponibilidade para cada hora do intervalo solicitado
        const [startHour] = horaInicio.split(':').map(Number);
        const [endHour] = horaFim.split(':').map(Number);

        for (let hour = startHour; hour < endHour; hour++) {
          const hourStr = `${hour.toString().padStart(2, '0')}:00`;
          const nextHourStr = `${(hour + 1).toString().padStart(2, '0')}:00`;

          // Busca todas as reservas de computador que cobrem essa hora específica
          const bookingsInHour = await this.bookingRepository.find({
            where: {
              room_name: 'escola_fazendaria',
              tipo_reserva: 'computador',
              status: Not('rejected'), // Qualquer status exceto 'rejected'
              dates: Like(`%${dateStr}%`),
              hora_inicio: LessThan(nextHourStr),
              hora_fim: MoreThan(hourStr),
            },
          });

          const computersInUse = bookingsInHour.reduce(
            (sum, b) => sum + b.numero_participantes,
            0,
          );

          if (computersInUse + numeroParticipantes > MAX_COMPUTERS_PER_HOUR) {
            throw new BadRequestException(
              `Não há computadores suficientes no dia ${dateStr} às ${hourStr}. Máximo: ${MAX_COMPUTERS_PER_HOUR}, Em uso: ${computersInUse}, Solicitados: ${numeroParticipantes}.`,
            );
          }
        }
      }
    }

    // Caso B: Escola Fazendária - Sala
    // Segue padrão normal com validação de horário (09:00-17:00)
    // Não verifica conflitos pois existem múltiplas salas físicas
    else if (room_name === 'escola_fazendaria' && tipoReserva === 'sala') {
      // Validação de bloqueios administrativos já foi feita anteriormente
      // Não precisa verificar conflitos de agendamento
    }

    // Caso C: Salas Padrão (Delta e Receitório)
    // Bloqueio total se houver qualquer agendamento não recusado
    else if (room_name !== 'escola_fazendaria') {
      for (const dateStr of dates) {
        const existingBooking = await this.bookingRepository.findOne({
          where: {
            room_name,
            dates: Like(`%${dateStr}%`),
            status: Not('rejected'), // Qualquer status (pending, approved) bloqueia
            hora_inicio: LessThan(horaFim),
            hora_fim: MoreThan(horaInicio),
          },
        });

        if (existingBooking) {
          throw new BadRequestException(
            `Horário indisponível para a ${room_name} no dia ${dateStr}.`,
          );
        }
      }
    }

    // --- 6. SALVAR NO BANCO ---
    const newBooking = this.bookingRepository.create({
      ...createBookingDto,
      dates: dates,
      status: initialStatus,
      observacao,
      // Mapeamento explícito para garantir consistência
      room_name: createBookingDto.room_name,
      tipo_reserva: createBookingDto.tipoReserva,
      nome_completo: createBookingDto.nomeCompleto,
      setor_solicitante: createBookingDto.setorSolicitante,
      hora_inicio: createBookingDto.horaInicio,
      hora_fim: createBookingDto.horaFim,
      numero_participantes: createBookingDto.numeroParticipantes,
      software_especifico: createBookingDto.softwareEspecifico,
      qual_software: createBookingDto.qualSoftware,
      material_externo: createBookingDto.materialExterno,
      apoio_equipe: createBookingDto.apoioEquipe,
      som_projetor: createBookingDto.somProjetor,
      wifi_todos: createBookingDto.wifiTodos,
      conexao_cabo: createBookingDto.conexaoCabo,
    });

    const savedBooking = await this.bookingRepository.save(newBooking);

    // --- 7. AÇÕES PÓS-CRIAÇÃO (ASSÍNCRONO - NÃO BLOQUEIA RESPOSTA) ---
    // Envia e-mails em background sem bloquear a resposta
    setImmediate(() => {
      void (async () => {
        try {
          await this.mailService.sendBookingConfirmation(savedBooking);
          const admins = await this.adminUserRepository.find({
            where: [
              { room_access: savedBooking.room_name },
              { is_super_admin: true },
            ],
          });

          const adminEmails = [...new Set(admins.map((a) => a.email))];
          for (const email of adminEmails) {
            await this.mailService.sendAdminNotification(savedBooking, email);
          }
        } catch (emailError) {
          console.error('Erro ao enviar e-mails de notificação:', emailError);
          // Não falha a requisição por causa de erro de e-mail
        }
      })();
    });

    return {
      success: true,
      bookingId: savedBooking.id,
      message: 'Agendamento solicitado com sucesso',
      confirmationUrl: `/confirmar/${savedBooking.id}`,
      participants: savedBooking.participantes,
    };
  }

  // --- SEARCH (Listagem Pública) ---
  async search(searchBookingDto: SearchBookingDto) {
    const { room_name, dates, name, status, sector } = searchBookingDto;

    const where: FindOptionsWhere<Booking> = {};

    if (name) where.nome_completo = Like(`%${name}%`);
    if (status) where.status = status;
    if (sector) where.setor_solicitante = Like(`%${sector}%`);
    if (room_name) where.room_name = room_name;
    if (dates && dates.length > 0) {
      where.dates = In(dates);
    }

    const results = await this.bookingRepository.find({
      where,
      order: { created_at: 'DESC' },
      select: [
        'id',
        'room_name',
        'dates',
        'nome_completo',
        'setor_solicitante',
        'hora_inicio',
        'hora_fim',
        'status',
        'local',
      ],
    });

    return {
      results: results.map((b) => ({
        id: b.id,
        room: b.room_name,
        dates: b.dates,
        dateStr: b.dates
          .map((d) => {
            const [y, m, day] = d.split('-');
            return `${day}/${m}/${y}`;
          })
          .join(', '),
        name: b.nome_completo,
        sector: b.setor_solicitante,
        time: `${b.hora_inicio} às ${b.hora_fim}`,
        status: b.status,
        local: b.local,
      })),
    };
  }

  async findPublicOne(id: string) {
    const booking = await this.bookingRepository.findOneBy({ id });

    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    // Calcula se a confirmação de presença está habilitada
    // A confirmação só pode ser feita no dia e horário do agendamento (início até fim)
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM

    // Verifica se hoje é uma das datas do agendamento
    const isDateValid = booking.dates.includes(today);

    // Verifica se está dentro do horário (início até fim)
    const isTimeValid =
      currentTime >= booking.hora_inicio && currentTime <= booking.hora_fim;

    // Verifica se o status é "approved"
    const isApproved = booking.status === 'approved';

    // A confirmação só está habilitada se: é uma data válida, horário válido e status aprovado
    const canConfirm = isApproved && isDateValid && isTimeValid;

    // Prepara mensagem informativa sobre quando pode confirmar
    let confirmationMessage: string | null = null;
    if (!isApproved) {
      confirmationMessage =
        'O agendamento ainda não foi aprovado. Aguarde a aprovação para confirmar presença.';
    } else if (!isDateValid && !isTimeValid) {
      // Formata as datas para exibição
      const formattedDates = booking.dates
        .map((d) => {
          const [y, m, day] = d.split('-');
          return `${day}/${m}/${y}`;
        })
        .join(', ');
      confirmationMessage = `A confirmação de presença estará disponível nas datas ${formattedDates}, das ${booking.hora_inicio} às ${booking.hora_fim}.`;
    } else if (!isDateValid) {
      const formattedDates = booking.dates
        .map((d) => {
          const [y, m, day] = d.split('-');
          return `${day}/${m}/${y}`;
        })
        .join(', ');
      confirmationMessage = `A confirmação de presença só pode ser feita nas datas: ${formattedDates}.`;
    } else if (!isTimeValid) {
      confirmationMessage = `A confirmação de presença só pode ser feita das ${booking.hora_inicio} às ${booking.hora_fim}.`;
    }

    return {
      id: booking.id,
      room_name: booking.room_name,
      dates: booking.dates,
      startTime: booking.hora_inicio,
      endTime: booking.hora_fim,
      name: booking.nome_completo,
      sector: booking.setor_solicitante,
      status: booking.status,
      observacao: booking.observacao,
      canConfirm,
      confirmationMessage,
    };
  }

  // --- GET OCCUPIED HOURS (Calendário) ---
  async getOccupiedHours(
    room_name: string,
    date: string,
    tipoReserva?: string,
  ) {
    // Para Escola Fazendária - SALA:
    // Como há múltiplas salas independentes, NUNCA mostramos horário bloqueado
    if (room_name === 'escola_fazendaria' && tipoReserva === 'sala') {
      return { room_name, date, occupiedHours: [] };
    }

    // Para Escola Fazendária - COMPUTADOR:
    // Mostra horários onde 5 computadores já estão reservados
    if (room_name === 'escola_fazendaria' && tipoReserva === 'computador') {
      const MAX_COMPUTERS_PER_HOUR = 5;
      const occupiedHours = new Set<string>();
      const hoursToCheck = Array.from({ length: 24 }, (_, i) => i); // 0 a 23

      for (const hour of hoursToCheck) {
        const hourStr = `${hour.toString().padStart(2, '0')}:00`;
        const nextHourStr = `${(hour + 1).toString().padStart(2, '0')}:00`;

        const bookingsInHour = await this.bookingRepository.find({
          where: {
            room_name: 'escola_fazendaria',
            tipo_reserva: 'computador',
            status: Not('rejected'),
            dates: Like(`%${date}%`),
            hora_inicio: LessThan(nextHourStr),
            hora_fim: MoreThan(hourStr),
          },
        });

        const computersInUse = bookingsInHour.reduce(
          (sum, b) => sum + b.numero_participantes,
          0,
        );

        // Se atingiu o limite, marca como ocupado
        if (computersInUse >= MAX_COMPUTERS_PER_HOUR) {
          occupiedHours.add(hourStr);
        }
      }

      return {
        room_name,
        date,
        occupiedHours: Array.from(occupiedHours).sort(),
      };
    }

    // Para Delta e Receitório:
    // Bloqueia visualmente se houver qualquer agendamento não recusado.
    const bookings = await this.bookingRepository.find({
      where: {
        room_name,
        dates: Like(`%${date}%`),
        status: Not('rejected'),
      },
      select: ['hora_inicio', 'hora_fim'],
    });

    const occupiedHours = new Set<string>();

    bookings.forEach((booking) => {
      const [startHour, startMin] = booking.hora_inicio.split(':').map(Number);
      const [endHour, endMin] = booking.hora_fim.split(':').map(Number);

      // Adiciona todos os horários dentro do intervalo
      const hoursToCheck = [9, 10, 11, 12, 13, 14, 15, 16, 17];

      hoursToCheck.forEach((h) => {
        const hourInMinutes = h * 60;
        const startInMinutes = startHour * 60 + startMin;
        const endInMinutes = endHour * 60 + endMin;

        // Se o horário 'h' cai dentro do intervalo reservado (inclusive início, exclusive fim)
        // Ex: 13:00 as 14:00 -> Bloqueia 13:00.
        if (hourInMinutes >= startInMinutes && hourInMinutes < endInMinutes) {
          occupiedHours.add(`${h.toString().padStart(2, '0')}:00`);
        }
      });
    });

    return {
      room_name,
      date,
      occupiedHours: Array.from(occupiedHours).sort(),
    };
  }
}
