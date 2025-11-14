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
} from 'typeorm';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MailService } from 'src/mail/mail.service';
import { SearchBookingDto } from './dto/search-booking.dto';
import { AdminUser } from 'src/entities/admin-user.entity';

@Injectable()
export class BookingsService {
  // Injetando os "gerenciadores" das tabelas
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

  // Método principal para criar agendamento
  async create(createBookingDto: CreateBookingDto) {
    // --- 1. Validações de Regra de Negócio ---

    // Regra: Data não pode ser final de semana
    const dataAgendamento = new Date(createBookingDto.data);
    const diaDaSemana = dataAgendamento.getUTCDay(); // 0 = Domingo, 6 = Sábado
    if (diaDaSemana === 0 || diaDaSemana === 6) {
      throw new BadRequestException(
        'Não é permitido agendar em finais de semana.',
      );
    }

    const {
      data,
      horaInicio,
      horaFim,
      room,
      tipoReserva,
      numeroParticipantes,
    } = createBookingDto;

    const dataStr = data;

    // 1. Regra: Verificar bloqueios
    const blocks = await this.roomBlockRepository.findBy({ room });
    const isBlocked = blocks.some(
      (b) => b.dates.includes(dataStr) && b.times.includes(horaInicio),
    );
    if (isBlocked) {
      throw new BadRequestException(
        'Este horário está bloqueado pela administração.',
      );
    }

    // 2. Regra: Verificar conflitos
    const existingBooking = await this.bookingRepository.findOne({
      where: {
        data: dataStr, // <-- USA A STRING "2025-11-24"
        room,
        status: In(['approved', 'pending']),
        hora_inicio: LessThan(horaFim),
        hora_fim: MoreThan(horaInicio),
      },
    });

    if (existingBooking) {
      throw new BadRequestException(
        'Horário indisponível. Já existe um agendamento neste período.',
      );
    }
    // Regra: Para Escola Fazendária, verificar computadores
    if (room === 'escola_fazendaria' && tipoReserva === 'computador') {
      const setting = await this.roomSettingRepository.findOneBy({
        room: 'escola_fazendaria',
      });
      const availableComputers = setting?.available_computers || 0;

      const concurrentBookings = await this.bookingRepository.find({
        where: {
          data: dataStr,
          room: 'escola_fazendaria',
          tipo_reserva: 'computador',
          status: In(['approved', 'pending']),
          hora_inicio: LessThan(horaFim),
          hora_fim: MoreThan(horaInicio),
        },
      });

      const computersInUse = concurrentBookings.reduce(
        (sum, b) => sum + b.numero_participantes,
        0,
      );
      if (computersInUse + numeroParticipantes > availableComputers) {
        const remaining = availableComputers - computersInUse;
        throw new BadRequestException(
          `Não há computadores suficientes. ${remaining > 0 ? `Restam apenas ${remaining}` : 'Não há computadores disponíveis'}.`,
        );
      }
    }

    // --- 2. Preparar e Salvar no Banco ---

    // Mapeia os dados do DTO para a Entidade
    const newBooking = this.bookingRepository.create({
      ...createBookingDto,
      data: dataStr,
      status: 'pending',

      // Renomeando campos do DTO para a entidade (camelCase para snake_case)
      room_name: createBookingDto.roomName,
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

    // --- 3. Ações Pós-Criação ---

    await this.mailService.sendBookingConfirmation(savedBooking);
    const admins = await this.adminUserRepository.find({
      where: [{ room_access: savedBooking.room }, { is_super_admin: true }],
    });

    const adminEmails = [...new Set(admins.map((a) => a.email))];

    for (const email of adminEmails) {
      await this.mailService.sendAdminNotification(savedBooking, email);
    }

    // --- 4. Retornar Resposta de Sucesso ---
    return {
      success: true,
      bookingId: savedBooking.id,
      message: 'Agendamento solicitado com sucesso',
      confirmationUrl: `/confirmar/${savedBooking.id}`, // [cite: 126]
      participants: savedBooking.participantes, // [cite: 127]
    };
  }

  async search(searchBookingDto: SearchBookingDto) {
    const { room, date, name, status, sector } = searchBookingDto;

    const where: FindOptionsWhere<Booking> = {};
    
    if (name) where.nome_completo = Like(`%${name}%`);
    if (status) where.status = status;
    if (sector) where.setor_solicitante = Like(`%${sector}%`);
    if (room) where.room = room;
    if (date) where.data = date;

    const results = await this.bookingRepository.find({
      where,
      order: { data: 'ASC', hora_inicio: 'ASC' },
      select: [
        'id',
        'room_name',
        'data',
        'nome_completo',
        'setor_solicitante',
        'hora_inicio',
        'hora_fim',
        'status',
      ],
    });

    return {
      results: results.map((b) => ({
        id: b.id,
        room: b.room_name,
        date: new Date(`${b.data}T12:00:00Z`).toLocaleDateString('pt-BR'),
        name: b.nome_completo,
        sector: b.setor_solicitante,
        time: `${b.hora_inicio} às ${b.hora_fim}`,
        status: b.status,
      })),
    };
  }

  async findPublicOne(id: string) {
    const booking = await this.bookingRepository.findOneBy({
      id,
    });

    if (!booking) {
      throw new NotFoundException(
        'Agendamento não encontrado ou não está aprovado.',
      );
    }

    return {
      id: booking.id,
      roomName: booking.room_name,
      date: new Date(`${booking.data}T12:00:00Z`).toLocaleDateString('pt-BR'),
      startTime: booking.hora_inicio,
      endTime: booking.hora_fim,
      name: booking.nome_completo,
      sector: booking.setor_solicitante,
      status: booking.status,
    };
  }
}
