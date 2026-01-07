import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from '../entities/booking.entity';
import { RoomBlock } from '../entities/room-block.entity';
import { RoomSetting } from '../entities/room-setting.entity';
import { ExternalParticipant } from '../entities/external-participant.entity';
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
    @InjectRepository(ExternalParticipant)
    private readonly externalParticipantRepository: Repository<ExternalParticipant>,
    private readonly mailService: MailService,
  ) { }

  async create(createBookingDto: CreateBookingDto) {
    const {
      dates,
      horaInicio,
      horaFim,
      room_name,
      tipoReserva,
      observacao,
      externalParticipants,
    } = createBookingDto;

    // --- 1. VALIDAÇÃO DE ARRAYS DE HORÁRIOS ---
    // Validar que horaInicio, horaFim e dates tenham o mesmo tamanho
    if (horaInicio.length !== dates.length || horaFim.length !== dates.length) {
      throw new BadRequestException(
        'Os arrays de horários devem ter o mesmo tamanho do array de datas.',
      );
    }

    // --- 2. VALIDAÇÃO DE HORÁRIO E DURAÇÃO PARA CADA PAR ---
    for (let i = 0; i < dates.length; i++) {
      const inicio = horaInicio[i];
      const fim = horaFim[i];

      const [hIni, mIni] = inicio.split(':').map(Number);
      const [hFim, mFim] = fim.split(':').map(Number);
      const inicioMinutos = hIni * 60 + mIni;
      const fimMinutos = hFim * 60 + mFim;

      // Regra: Hora Fim deve ser maior que Hora Início
      if (fimMinutos <= inicioMinutos) {
        throw new BadRequestException(
          `Na data ${dates[i]}: a hora final deve ser maior que a hora inicial.`,
        );
      }

      // Regra: Mínimo de 1 hora de duração
      if (fimMinutos - inicioMinutos < 60) {
        throw new BadRequestException(
          `Na data ${dates[i]}: o agendamento deve ter duração mínima de 1 hora.`,
        );
      }
    }

    // --- 3. VALIDAÇÃO DE FINAIS DE SEMANA ---
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

    // --- 4. REGRAS ESPECÍFICAS: ESCOLA FAZENDÁRIA ---
    if (room_name === 'escola_fazendaria') {
      // Regra: Exatamente 3 datas e 3 horários
      if (dates.length !== 3) {
        throw new BadRequestException(
          'Para a Escola Fazendária, é obrigatório selecionar exatamente 3 datas.',
        );
      }

      // Regra: Validação de Horários APENAS para reserva de SALA
      if (tipoReserva === 'sala') {
        // Cada um dos 3 horários deve respeitar a janela 08:00-17:00
        for (let i = 0; i < horaInicio.length; i++) {
          const inicio = horaInicio[i];
          const fim = horaFim[i];

          // Horários Permitidos (08:00 as 17:00)
          // Início máximo 16:00, Fim máximo 17:00, Início mínimo 08:00
          if (inicio < '08:00' || inicio > '16:00') {
            throw new BadRequestException(
              `Horário de início inválido para Escola Fazendária na data ${dates[i]} (permitido entre 08:00 e 16:00).`,
            );
          }
          if (fim < '09:00' || fim > '17:00') {
            throw new BadRequestException(
              `Horário de fim inválido para Escola Fazendária na data ${dates[i]} (permitido entre 09:00 e 17:00).`,
            );
          }
        }
      }
      // Para 'computador', não há restrição de horário

      // Regra: Status Inicial "Em Análise"
      initialStatus = 'pending';
    }

    // --- 5. VALIDAÇÃO DE BLOQUEIOS ADMINISTRATIVOS ---
    const blocks = await this.roomBlockRepository.findBy({ room_name });
    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      const inicio = horaInicio[i];
      const fim = horaFim[i];

      // Verifica se a data está na lista de bloqueios
      const blockOnDate = blocks.find((b) => b.dates.includes(dateStr));

      if (blockOnDate) {
        // Se houver bloqueio na data, verifica colisão de horário
        // Se o horário do bloqueio colidir com o do agendamento
        const isTimeBlocked = blockOnDate.times.some((blockedTime) => {
          // Lógica simplificada: se o horário bloqueado estiver DENTRO do intervalo do agendamento
          // ou se o agendamento tentar pegar o horário exato
          return blockedTime >= inicio && blockedTime < fim;
        });

        if (isTimeBlocked) {
          throw new BadRequestException(
            `O horário no dia ${dateStr} está bloqueado pela administração (Motivo: ${blockOnDate.reason}).`,
          );
        }
      }
    }

    // --- 6. VALIDAÇÃO DE CONFLITOS DE AGENDAMENTO ---

    // Caso A: Escola Fazendária - Computador
    // TODO: A validação de limite de computadores precisa ser repensada
    // pois o campo 'numero_participantes' foi removido. Agora temos:
    // - participantes (array de IDs de employees)
    // - externalParticipants (array de participantes externos)
    // Decidir como contar computadores: por booking total ou por participante individual?
    if (room_name === 'escola_fazendaria' && tipoReserva === 'computador') {
      // Temporariamente desabilitado - necessita redefinição de regra de negócio
      // const MAX_COMPUTERS_PER_HOUR = 5;
      // ... lógica de validação a ser reimplementada
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
      for (let i = 0; i < dates.length; i++) {
        const dateStr = dates[i];
        const inicio = horaInicio[i];
        const fim = horaFim[i];

        // Busca todos os agendamentos na data
        const existingBookings = await this.bookingRepository.find({
          where: {
            room_name,
            dates: Like(`%${dateStr}%`),
            status: Not('rejected'), // Qualquer status (pending, approved) bloqueia
          },
        });

        // Verifica sobreposição manualmente para cada agendamento encontrado
        for (const booking of existingBookings) {
          const dateIndex = booking.dates.indexOf(dateStr);
          if (dateIndex === -1) continue;

          const bookingStart = booking.hora_inicio[dateIndex];
          const bookingEnd = booking.hora_fim[dateIndex];

          // Verifica sobreposição: bookingStart < fim && bookingEnd > inicio
          if (bookingStart < fim && bookingEnd > inicio) {
            throw new BadRequestException(
              `Horário indisponível para a ${room_name} no dia ${dateStr}.`,
            );
          }
        }
      }
    }

    // --- 7. SALVAR NO BANCO ---
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
      // numero_participantes foi removido
      software_especifico: createBookingDto.softwareEspecifico,
      qual_software: createBookingDto.qualSoftware,
      material_externo: createBookingDto.materialExterno,
      apoio_equipe: createBookingDto.apoioEquipe,
      som_projetor: createBookingDto.somProjetor,
      wifi_todos: createBookingDto.wifiTodos,
      conexao_cabo: createBookingDto.conexaoCabo,
    });

    const savedBooking = await this.bookingRepository.save(newBooking);

    // --- 8. SALVAR PARTICIPANTES EXTERNOS (SE FORNECIDOS) ---
    if (
      createBookingDto.externalParticipants &&
      createBookingDto.externalParticipants.length > 0
    ) {
      const externalParticipants = createBookingDto.externalParticipants.map(
        (ep) =>
          this.externalParticipantRepository.create({
            booking_id: savedBooking.id,
            full_name: ep.fullName,
            email: ep.email,
            orgao: ep.orgao,
          }),
      );
      await this.externalParticipantRepository.save(externalParticipants);
    }

    // --- 9. AÇÕES PÓS-CRIAÇÃO (ASSÍNCRONO - NÃO BLOQUEIA RESPOSTA) ---
    // Envia e-mails em background sem bloquear a resposta
    setImmediate(() => {
      void (async () => {
        try {
          // 1. Envia e-mail estilizado para o solicitante
          await this.mailService.sendNewBookingToRequester(savedBooking);

          // 2. Busca APENAS o admin da sala (não super admin)
          const roomAdmin = await this.adminUserRepository.findOne({
            where: {
              room_access: savedBooking.room_name,
              is_super_admin: false,
            },
          });

          // 3. Envia e-mail para o admin da sala se existir
          if (roomAdmin) {
            await this.mailService.sendNewBookingToRoomAdmin(
              savedBooking,
              roomAdmin.email,
            );
          }

          // 4. Envia e-mail para participantes externos (se houver)
          if (
            createBookingDto.externalParticipants &&
            createBookingDto.externalParticipants.length > 0
          ) {
            const bookingWithExternal = await this.bookingRepository.findOne({
              where: { id: savedBooking.id },
              relations: ['external_participants'],
            });

            if (
              bookingWithExternal &&
              bookingWithExternal.external_participants
            ) {
              for (const participant of bookingWithExternal.external_participants) {
                await this.mailService.sendExternalParticipantNotification(
                  bookingWithExternal,
                  participant,
                );
              }
            }
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
    const { room_name, dates, name, status, sector, purpose } = searchBookingDto;

    const where: FindOptionsWhere<Booking> = {};

    if (name) where.nome_completo = Like(`%${name}%`);
    if (status) where.status = status;
    if (sector) where.setor_solicitante = Like(`%${sector}%`);
    if (room_name) where.room_name = room_name;
    if (purpose) where.finalidade = purpose
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
        'finalidade',
      ],
    });

    return {
      results: results.map((b) => {
        // Formata horários - se houver múltiplos, exibe lista
        let timeStr: string;
        if (b.hora_inicio.length === 1) {
          timeStr = `${b.hora_inicio[0]} às ${b.hora_fim[0]}`;
        } else {
          timeStr = b.hora_inicio
            .map((inicio, i) => `${inicio} às ${b.hora_fim[i]}`)
            .join(', ');
        }

        return {
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
          time: timeStr,
          status: b.status,
          local: b.local,
        };
      }),
    };
  }

  async findPublicOne(id: string) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });

    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    // Calcula se a confirmação de presença está habilitada
    // A confirmação só pode ser feita no dia e horário do agendamento (início até fim)
    // Usa timezone de São Paulo para garantir horário correto
    const now = new Date();
    const saoPauloTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const today = saoPauloTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = saoPauloTime.toTimeString().slice(0, 5); // HH:MM

    // Verifica se hoje é uma das datas do agendamento
    const todayIndex = booking.dates.indexOf(today);
    const isDateValid = todayIndex !== -1;

    // Verifica se está dentro do horário (início até fim) para a data de hoje
    let isTimeValid = false;
    if (isDateValid) {
      const todayInicio = booking.hora_inicio[todayIndex];
      const todayFim = booking.hora_fim[todayIndex];
      isTimeValid = currentTime >= todayInicio && currentTime <= todayFim;
    }

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
      // Formata as datas com seus horários para exibição
      const formattedDates = booking.dates
        .map((d, i) => {
          const [y, m, day] = d.split('-');
          return `${day}/${m}/${y} (${booking.hora_inicio[i]} às ${booking.hora_fim[i]})`;
        })
        .join(', ');
      confirmationMessage = `A confirmação de presença estará disponível nas seguintes datas/horários: ${formattedDates}.`;
    } else if (!isDateValid) {
      const formattedDates = booking.dates
        .map((d, i) => {
          const [y, m, day] = d.split('-');
          return `${day}/${m}/${y} (${booking.hora_inicio[i]} às ${booking.hora_fim[i]})`;
        })
        .join(', ');
      confirmationMessage = `A confirmação de presença só pode ser feita nas datas: ${formattedDates}.`;
    } else if (!isTimeValid) {
      const todayInicio = booking.hora_inicio[todayIndex];
      const todayFim = booking.hora_fim[todayIndex];
      confirmationMessage = `A confirmação de presença só pode ser feita das ${todayInicio} às ${todayFim}.`;
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
      externalParticipants: booking.external_participants || [],
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
    // TODO: Lógica de horários ocupados precisa ser reimplementada
    // após redefinição da regra de contagem de computadores (ver comentário no método create)
    if (room_name === 'escola_fazendaria' && tipoReserva === 'computador') {
      // Temporariamente retorna vazio - aguardando nova regra de negócio
      return {
        room_name,
        date,
        occupiedHours: [],
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
      select: ['dates', 'hora_inicio', 'hora_fim'],
    });

    const occupiedHours = new Set<string>();

    bookings.forEach((booking) => {
      const dateIndex = booking.dates.indexOf(date);
      if (dateIndex === -1) return;

      const startTime = booking.hora_inicio?.[dateIndex];
      const endTime = booking.hora_fim?.[dateIndex];

      // Proteção contra valores undefined
      if (!startTime || !endTime) return;

      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      const startInMinutes = startHour * 60 + startMin;
      const endInMinutes = endHour * 60 + endMin;

      // Horários disponíveis para Delta e Receitório (08:00-17:00)
      const hoursToCheck = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

      hoursToCheck.forEach((h) => {
        const hourInMinutes = h * 60;

        // Bloqueia o horário se houver qualquer sobreposição
        // Um horário H está ocupado se uma reserva começa antes ou em H E termina depois de H
        // 
        // Exemplo 1: Reserva 08:00-10:00
        //   - 08:00 está ocupado (480 <= 480 < 600) ✓
        //   - 09:00 está ocupado (480 <= 540 < 600) ✓
        //   - 10:00 NÃO está ocupado (480 <= 600 < 600 é falso) ✗
        //
        // Exemplo 2: Reserva 08:00-09:00
        //   - 08:00 está ocupado (480 <= 480 < 540) ✓
        //   - 09:00 NÃO está ocupado (480 <= 540 < 540 é falso) ✗
        //
        // Isso garante que não se pode agendar em horários já ocupados
        if (startInMinutes <= hourInMinutes && hourInMinutes < endInMinutes) {
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
