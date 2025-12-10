import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Booking } from 'src/entities/booking.entity';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { AdminUser } from 'src/entities/admin-user.entity';
import { Employee } from 'src/entities/employee.entity';
import { ExternalParticipant } from 'src/entities/external-participant.entity';
import { FindOptionsWhere, In, Like, Repository } from 'typeorm';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CreateAdminDto } from '../auth/dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AnalyzeBookingDto } from './dto/analyze-booking.dto';
import { ApprovePartialBookingDto } from './dto/approve-partial-booking.dto';
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';
import PDFDocument from 'pdfkit';

// O 'user' que recebemos é o payload do token
type AdminUserPayload = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  roomAccess: string | null;
};

// Tipo para o array de presença
type AttendanceResponse = {
  id: string | null;
  fullName: string;
  email: string;
  confirmedAt: string | null;
  confirmedTime: string | null;
  isVisitor: boolean | null;
  status: string;
  attendanceDate: string | null; // Data específica da confirmação
};

@Injectable()
export class AdminService {
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(ExternalParticipant)
    private readonly externalParticipantRepository: Repository<ExternalParticipant>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  }

  // Helper para buscar nomes dos participantes a partir dos e-mails
  private async getParticipantsWithNames(
    emails: string[],
  ): Promise<{ email: string; name: string }[]> {
    if (!emails || emails.length === 0) return [];

    const normalizedEmails = emails.map((e) => e.toLowerCase());
    const employees = await this.employeeRepository.find({
      where: { email: In(normalizedEmails) },
      select: ['email', 'full_name'],
    });

    const emailToName = new Map<string, string>();
    employees.forEach((emp) => {
      emailToName.set(emp.email.toLowerCase(), emp.full_name);
    });

    return emails.map((email) => ({
      email,
      name: emailToName.get(email.toLowerCase()) || email, // Retorna o email se não encontrar o nome
    }));
  }

  // Checa se o admin tem permissão para acessar um agendamento
  private checkPermission(booking: Booking, user: AdminUserPayload) {
    if (user.isSuperAdmin) {
      return true;
    }
    if (booking.room_name === user.roomAccess) {
      return true;
    }
    throw new ForbiddenException(
      'Você não tem permissão para acessar este agendamento.',
    );
  }

  // --- MÉTODOS DE GERENCIAMENTO DE AGENDAMENTOS ---

  // GET /api/admin/bookings
  async findAll(pagination: any, filters: any, user: AdminUserPayload) {
    const { page, limit } = pagination;
    const statuses = ['pending', 'approved', 'rejected', 'em_analise'];

    const resultsByStatus = {};

    for (const status of statuses) {
      const where: FindOptionsWhere<Booking> = { status };

      // 1. Filtro de Permissão
      if (!user.isSuperAdmin) {
        if (user.roomAccess) {
          where.room_name = user.roomAccess;
        }
      } else if (filters.room) {
        // Super admin pode filtrar por sala específica via query param
        where.room_name = filters.room;
      }

      // 2. Filtros da Query
      if (filters.status) where.status = filters.status;

      // Como 'data' agora é string no banco (simple-array ou string simples dependendo da versão),
      // e o filtro vem como string 'YYYY-MM-DD', a comparação direta funciona se for campo simples.
      // SE for array de datas (nova versão), precisaríamos usar Like.
      // Assumindo compatibilidade com a versão anterior ou busca exata por enquanto.
      // Se mudamos para array, o ideal seria:
      if (filters.date) where.dates = Like(`%${filters.date}%`);

      if (filters.name) where.nome_completo = Like(`%${filters.name}%`);

      const [results, total] = await this.bookingRepository.findAndCount({
        where,
        order: { created_at: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
        select: [
          'id',
          'room_name',
          'dates',
          'hora_inicio',
          'hora_fim',
          'nome_completo',
          'setor_solicitante',
          'finalidade',
          'status',
          'created_at',
        ],
      });

      resultsByStatus[status] = {
        bookings: results,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    return resultsByStatus;
  }

  // GET /api/admin/bookings/:id/details
  async findOne(id: string, user: AdminUserPayload) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    // Busca os nomes dos participantes a partir dos e-mails
    const participantesComNomes = await this.getParticipantsWithNames(
      booking.participantes || [],
    );

    // Retorna os dados no mesmo padrão flat snake_case como os bookings normais
    return {
      id: booking.id,
      room_name: booking.room_name,
      tipo_reserva: booking.tipo_reserva,
      status: booking.status,
      nome_completo: booking.nome_completo,
      setor_solicitante: booking.setor_solicitante,
      responsavel: booking.responsavel,
      telefone: booking.telefone,
      email: booking.email,
      dates: booking.dates,
      hora_inicio: booking.hora_inicio,
      hora_fim: booking.hora_fim,
      participantes: participantesComNomes, // Agora retorna array de { email, name }
      finalidade: booking.finalidade,
      descricao: booking.descricao,
      observacao: booking.observacao,
      observacao_admin: booking.observacao_admin,
      local: booking.local,
      projetor: booking.projetor,
      som_projetor: booking.som_projetor,
      internet: booking.internet,
      wifi_todos: booking.wifi_todos,
      conexao_cabo: booking.conexao_cabo,
      software_especifico: booking.software_especifico,
      qual_software: booking.qual_software,
      papelaria: booking.papelaria,
      material_externo: booking.material_externo,
      apoio_equipe: booking.apoio_equipe,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      approved_by: booking.approved_by,
      approved_at: booking.approved_at,
      rejected_by: booking.rejected_by,
      rejected_at: booking.rejected_at,
      rejection_reason: booking.rejection_reason,
      external_participants: booking.external_participants || [],
    };
  }

  // PATCH /api/admin/bookings/:id/approve
  async approve(id: string, user: AdminUserPayload, local?: string) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    booking.status = 'approved';
    booking.approved_by = user.email;
    booking.approved_at = new Date();

    // Define o local se fornecido (obrigatório para escola_fazendaria)
    if (local) {
      booking.local = local;
    }

    // Limpa dados de rejeição se houver
    booking.rejected_by = null;
    booking.rejected_at = null;
    booking.rejection_reason = null;

    const savedBooking = await this.bookingRepository.save(booking);

    // Envia e-mail estilizado de aprovação para o solicitante
    await this.mailService.sendApprovalEmailToRequester(savedBooking);

    // Envia e-mail estilizado para todos os participantes SEGET com link do Google Calendar
    for (const email of savedBooking.participantes) {
      await this.mailService.sendApprovalEmailToParticipant(
        savedBooking,
        email,
        this.frontendUrl,
      );
    }

    // Envia e-mail para participantes externos com QR code
    if (
      savedBooking.external_participants &&
      savedBooking.external_participants.length > 0
    ) {
      for (const participant of savedBooking.external_participants) {
        await this.mailService.sendExternalParticipantNotification(
          savedBooking,
          participant,
        );
      }
    }

    return {
      success: true,
      message: 'Agendamento aprovado com sucesso',
      booking: {
        id: savedBooking.id,
        status: savedBooking.status,
        approvedBy: savedBooking.approved_by,
        approvedAt: savedBooking.approved_at,
      },
    };
  }

  // PATCH /api/admin/bookings/:id/analyze (NOVO)
  async analyze(
    id: string,
    analyzeBookingDto: AnalyzeBookingDto,
    user: AdminUserPayload,
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    // Define a observação do admin
    const observacaoAdmin =
      analyzeBookingDto.observacao_admin ||
      'Seu agendamento está sob análise da administração para verificação de detalhes.';

    booking.status = 'em_analise';
    // Salva a observação do admin no campo específico
    booking.observacao_admin = observacaoAdmin;

    // Limpa metadados de aprovação/rejeição anteriores
    booking.approved_by = null;
    booking.approved_at = null;
    booking.rejected_by = null;
    booking.rejected_at = null;

    const savedBooking = await this.bookingRepository.save(booking);

    // Envia e-mail estilizado notificando a mudança com a observação do admin
    await this.mailService.sendUnderAnalysisEmailStyled(savedBooking);

    return {
      success: true,
      message: 'Agendamento movido para "Em Análise"',
      booking: {
        id: savedBooking.id,
        status: savedBooking.status,
        observacaoAdmin: observacaoAdmin,
      },
    };
  }

  // PATCH /api/admin/bookings/:id/approve-partial
  async approvePartial(
    id: string,
    approvePartialDto: ApprovePartialBookingDto,
    user: AdminUserPayload,
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    const { datesToApprove, rejectionReason, local } = approvePartialDto;
    const originalDates = booking.dates || [];

    // 1. Validação: datesToApprove deve ser subconjunto estrito
    const isSubset = datesToApprove.every((date) =>
      originalDates.includes(date),
    );
    if (!isSubset) {
      throw new ConflictException(
        'As datas para aprovação devem fazer parte do agendamento original.',
      );
    }

    const rejectedDates = originalDates.filter(
      (date) => !datesToApprove.includes(date),
    );

    // Se não sobrar datas rejeitadas, é uma aprovação total padrão
    if (rejectedDates.length === 0) {
      return this.approve(id, user, local);
    }

    // Se tentar aprovar vazio, é rejeição total
    if (datesToApprove.length === 0) {
      return this.reject(
        id,
        { reason: rejectionReason } as RejectBookingDto,
        user,
      );
    }

    // 2. Atualizar a Entidade Original (Aprovada)
    booking.dates = datesToApprove;
    booking.status = 'approved';
    booking.approved_by = user.email;
    booking.approved_at = new Date();

    // Define o local se fornecido (obrigatório para escola_fazendaria)
    if (local) {
      booking.local = local;
    }

    // Limpa rejeição se houver
    booking.rejected_by = null;
    booking.rejected_at = null;
    booking.rejection_reason = null;

    const savedApprovedBooking = await this.bookingRepository.save(booking);

    // 3. Criar Entidade Clone (Rejeitada)
    // Clona o objeto excluindo o ID para gerar um novo
    const rejectedBooking = this.bookingRepository.create({
      ...booking,
      id: undefined, // Força geração de novo ID
      dates: rejectedDates,
      status: 'rejected',
      approved_by: null,
      approved_at: null,
      rejected_by: user.email,
      rejected_at: new Date(),
      rejection_reason:
        rejectionReason || 'Datas indisponíveis na solicitação parcial.',
      created_at: new Date(), // Novo timestamp
      updated_at: new Date(),
    });

    const savedRejectedBooking =
      await this.bookingRepository.save(rejectedBooking);

    // 4. Disparar E-mails Estilizados
    // Aprovado - para solicitante:
    await this.mailService.sendApprovalEmailToRequester(savedApprovedBooking);
    // Aprovado - para participantes SEGET:
    for (const email of savedApprovedBooking.participantes) {
      await this.mailService.sendApprovalEmailToParticipant(
        savedApprovedBooking,
        email,
        this.frontendUrl,
      );
    }

    // Aprovado - para participantes externos:
    if (
      savedApprovedBooking.external_participants &&
      savedApprovedBooking.external_participants.length > 0
    ) {
      for (const participant of savedApprovedBooking.external_participants) {
        await this.mailService.sendExternalParticipantNotification(
          savedApprovedBooking,
          participant,
        );
      }
    }

    // Rejeitado - para solicitante:
    await this.mailService.sendRejectionEmailStyled(savedRejectedBooking);

    return {
      success: true,
      message: 'Agendamento aprovado parcialmente com sucesso.',
      originalBooking: {
        id: savedApprovedBooking.id,
        dates: savedApprovedBooking.dates,
        status: savedApprovedBooking.status,
      },
      rejectedBooking: {
        id: savedRejectedBooking.id,
        dates: savedRejectedBooking.dates,
        status: savedRejectedBooking.status,
      },
    };
  }

  // PATCH /api/admin/bookings/:id/reject
  async reject(
    id: string,
    rejectBookingDto: RejectBookingDto,
    user: AdminUserPayload,
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    booking.status = 'rejected';
    booking.rejected_by = user.email;
    booking.rejected_at = new Date();
    booking.rejection_reason = rejectBookingDto.reason ?? null;

    // Limpa aprovação se houver
    booking.approved_by = null;
    booking.approved_at = null;

    const savedBooking = await this.bookingRepository.save(booking);

    // Envia e-mail estilizado de rejeição
    await this.mailService.sendRejectionEmailStyled(savedBooking);

    return {
      success: true,
      message: 'Agendamento recusado',
      booking: {
        id: savedBooking.id,
        status: savedBooking.status,
        rejectedBy: savedBooking.rejected_by,
        rejectedAt: savedBooking.rejected_at,
        rejectionReason: savedBooking.rejection_reason,
      },
    };
  }

  // PUT /api/admin/bookings/:id
  async update(
    id: string,
    updateBookingDto: UpdateBookingDto,
    user: AdminUserPayload,
  ) {
    console.log('=== UPDATE BOOKING ===');
    console.log('ID:', id);
    console.log('DTO recebido:', JSON.stringify(updateBookingDto, null, 2));

    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['external_participants'],
    });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    // Mapeamento explícito de DTO (camelCase) para Entity (snake_case)
    if (updateBookingDto.room_name)
      booking.room_name = updateBookingDto.room_name;
    if (updateBookingDto.tipoReserva !== undefined)
      booking.tipo_reserva = updateBookingDto.tipoReserva;
    if (updateBookingDto.nomeCompleto)
      booking.nome_completo = updateBookingDto.nomeCompleto;
    if (updateBookingDto.setorSolicitante)
      booking.setor_solicitante = updateBookingDto.setorSolicitante;
    if (updateBookingDto.horaInicio)
      booking.hora_inicio = updateBookingDto.horaInicio;
    if (updateBookingDto.horaFim) booking.hora_fim = updateBookingDto.horaFim;

    // Campos que já coincidem ou são simples
    if (updateBookingDto.dates) booking.dates = updateBookingDto.dates;
    if (updateBookingDto.responsavel)
      booking.responsavel = updateBookingDto.responsavel;
    if (updateBookingDto.telefone) booking.telefone = updateBookingDto.telefone;
    if (updateBookingDto.email) booking.email = updateBookingDto.email;
    if (updateBookingDto.participantes)
      booking.participantes = updateBookingDto.participantes;
    if (updateBookingDto.finalidade)
      booking.finalidade = updateBookingDto.finalidade;
    if (updateBookingDto.descricao)
      booking.descricao = updateBookingDto.descricao;
    if (updateBookingDto.observacao !== undefined)
      booking.observacao = updateBookingDto.observacao;

    // Equipamentos e Específicos (mapeamento)
    if (updateBookingDto.projetor !== undefined)
      booking.projetor = updateBookingDto.projetor;
    if (updateBookingDto.somProjetor !== undefined)
      booking.som_projetor = updateBookingDto.somProjetor;
    if (updateBookingDto.internet !== undefined)
      booking.internet = updateBookingDto.internet;
    if (updateBookingDto.wifiTodos !== undefined)
      booking.wifi_todos = updateBookingDto.wifiTodos;
    if (updateBookingDto.conexaoCabo !== undefined)
      booking.conexao_cabo = updateBookingDto.conexaoCabo;
    if (updateBookingDto.softwareEspecifico !== undefined)
      booking.software_especifico = updateBookingDto.softwareEspecifico;
    if (updateBookingDto.qualSoftware !== undefined)
      booking.qual_software = updateBookingDto.qualSoftware;
    if (updateBookingDto.papelaria !== undefined)
      booking.papelaria = updateBookingDto.papelaria;
    if (updateBookingDto.materialExterno !== undefined)
      booking.material_externo = updateBookingDto.materialExterno;
    if (updateBookingDto.apoioEquipe !== undefined)
      booking.apoio_equipe = updateBookingDto.apoioEquipe;

    // Salva primeiro o booking principal
    const updatedBooking = await this.bookingRepository.save(booking);
    console.log('Booking principal salvo:', updatedBooking.id);

    // Atualiza Participantes Externos separadamente
    if (updateBookingDto.externalParticipants !== undefined) {
      console.log(
        'Atualizando participantes externos:',
        updateBookingDto.externalParticipants,
      );

      try {
        // Remove participantes externos antigos usando query builder para evitar problemas
        await this.externalParticipantRepository
          .createQueryBuilder()
          .delete()
          .where('booking_id = :bookingId', { bookingId: booking.id })
          .execute();
        console.log('Participantes antigos removidos');

        // Adiciona novos participantes externos
        if (updateBookingDto.externalParticipants.length > 0) {
          for (const p of updateBookingDto.externalParticipants) {
            if (p.fullName && p.email) {
              const newParticipant = this.externalParticipantRepository.create({
                booking_id: booking.id,
                full_name: p.fullName,
                email: p.email,
                matricula: p.matricula || null,
              });
              await this.externalParticipantRepository.save(newParticipant);
              console.log('Participante salvo:', p.fullName);
            }
          }
        }
      } catch (error) {
        console.error('Erro ao atualizar participantes externos:', error);
      }
    }

    // Recarrega o booking com os participantes externos atualizados
    const bookingWithRelations = await this.bookingRepository.findOne({
      where: { id: updatedBooking.id },
      relations: ['external_participants'],
    });

    console.log('=== UPDATE COMPLETO ===');

    return {
      success: true,
      message: 'Agendamento atualizado com sucesso',
      booking: bookingWithRelations,
    };
  }

  // GET /api/admin/bookings/:id/attendance
  async getAttendance(id: string, user: AdminUserPayload) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['attendance_records', 'external_participants'],
    });

    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    const now = new Date();
    const dates = booking.dates || [];
    const sortedDates = [...dates].sort();

    // Estrutura de presença organizada por data
    const attendanceByDate: Record<string, AttendanceResponse[]> = {};

    // Inicializa todas as datas com array vazio
    for (const dateStr of sortedDates) {
      attendanceByDate[dateStr] = [];
    }

    // Agrupa os registros de presença por data
    const attendanceRecords = booking.attendance_records || [];
    for (const record of attendanceRecords) {
      const recordDate = record.attendance_date;
      
      // Se o registro tem uma data válida que pertence ao agendamento
      if (recordDate && dates.includes(recordDate)) {
        if (!attendanceByDate[recordDate]) {
          attendanceByDate[recordDate] = [];
        }
        attendanceByDate[recordDate].push({
          id: record.id,
          fullName: record.full_name,
          email: record.email.toLowerCase(),
          confirmedAt: record.confirmed_at?.toLocaleDateString('pt-BR') || null,
          confirmedTime:
            record.confirmed_at?.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }) || null,
          isVisitor: record.is_visitor,
          status: record.status,
          attendanceDate: recordDate,
        });
      } else if (!recordDate && dates.length === 1) {
        // Compatibilidade: registros antigos sem data em agendamentos de data única
        const singleDate = dates[0];
        if (!attendanceByDate[singleDate]) {
          attendanceByDate[singleDate] = [];
        }
        attendanceByDate[singleDate].push({
          id: record.id,
          fullName: record.full_name,
          email: record.email.toLowerCase(),
          confirmedAt: record.confirmed_at?.toLocaleDateString('pt-BR') || null,
          confirmedTime:
            record.confirmed_at?.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }) || null,
          isVisitor: record.is_visitor,
          status: record.status,
          attendanceDate: singleDate,
        });
      }
    }

    // Para cada data, adiciona participantes que ainda não confirmaram
    for (const dateStr of sortedDates) {
      const dateIndex = dates.indexOf(dateStr);
      const [year, month, day] = dateStr.split('-').map(Number);
      
      // Calcula o horário de término para esta data específica
      const horaFimStr = Array.isArray(booking.hora_fim)
        ? booking.hora_fim[dateIndex] || booking.hora_fim[booking.hora_fim.length - 1]
        : booking.hora_fim;
      
      if (!horaFimStr) {
        console.error('[ERROR] Horário de término não encontrado para a data:', dateStr);
        continue; // Pula esta data se não tiver horário
      }
      
      const [hour, minute] = horaFimStr.split(':').map(Number);
      const bookingEndTime = new Date(year, month - 1, day, hour, minute);

      // Lista de emails que já confirmaram para esta data
      const confirmedEmailsForDate = attendanceByDate[dateStr].map((a) => a.email);

      // Busca nomes dos participantes SEGET que ainda não confirmaram para esta data
      const pendingSegetEmails = (booking.participantes || []).filter(
        (email) => !confirmedEmailsForDate.includes(email.toLowerCase()),
      );
      const participantsWithNames =
        await this.getParticipantsWithNames(pendingSegetEmails);
      const emailToName = new Map(
        participantsWithNames.map((p) => [p.email.toLowerCase(), p.name]),
      );

      // Adiciona participantes SEGET pendentes (não confirmaram) para esta data
      for (const email of pendingSegetEmails) {
        let status = 'Pendente';
        if (now > bookingEndTime) {
          status = 'Não Confirmado';
        }

        const participantName = emailToName.get(email.toLowerCase()) || email;

        attendanceByDate[dateStr].push({
          id: null,
          fullName: participantName,
          email: email,
          confirmedAt: null,
          confirmedTime: null,
          isVisitor: false,
          status: status,
          attendanceDate: dateStr,
        });
      }

      // Adiciona participantes externos pendentes (não confirmaram) para esta data
      const externalParticipants = booking.external_participants || [];
      for (const external of externalParticipants) {
        if (!confirmedEmailsForDate.includes(external.email.toLowerCase())) {
          let status = 'Pendente';
          if (now > bookingEndTime) {
            status = 'Não Confirmado';
          }

          attendanceByDate[dateStr].push({
            id: null,
            fullName: external.full_name,
            email: external.email,
            confirmedAt: null,
            confirmedTime: null,
            isVisitor: true,
            status: status,
            attendanceDate: dateStr,
          });
        }
      }
    }

    // Para compatibilidade, monta a lista "flat" de attendance (união de todas as datas)
    const attendance: AttendanceResponse[] = [];
    for (const dateStr of sortedDates) {
      attendance.push(...attendanceByDate[dateStr]);
    }

    return {
      booking: {
        id: booking.id,
        room_name: booking.room_name,
        dates: booking.dates,
        startTime: booking.hora_inicio,
        endTime: booking.hora_fim,
        responsavel: booking.responsavel,
        sector: booking.setor_solicitante,
        purpose: booking.finalidade,
        description: booking.descricao,
      },
      attendance,
      attendanceByDate, // Nova estrutura organizada por data
    };
  }

  // GET /api/admin/bookings/:id/attendance/pdf
  async generateAttendancePdf(
    id: string,
    user: AdminUserPayload,
  ): Promise<Buffer> {
    const data = await this.getAttendance(id, user);
    const { booking, attendance } = data;

    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));

    doc.fontSize(20).text('Lista de Presença - SEGET', { align: 'center' });
    doc.moveDown();

    const datesStr = Array.isArray(booking.dates)
      ? booking.dates.join(', ')
      : booking.dates;

    doc.fontSize(14).text(`Evento: ${booking.purpose}`);
    doc
      .fontSize(12)
      .text(
        `Data(s): ${datesStr} | Horário: ${booking.startTime} - ${booking.endTime}`,
      );
    doc.text(`Sala: ${booking.room_name}`);
    doc.text(`Responsável: ${booking.responsavel} (${booking.sector})`);
    doc.moveDown();

    doc.fontSize(14).text('Participantes');
    doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(10).text('Nome Completo', 50, doc.y, { continued: true });
    doc.text('E-mail', 250, doc.y, { continued: true });
    doc.text('Status', 450, doc.y);
    doc.moveDown(0.5);
    doc.lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();

    for (const p of attendance) {
      doc.moveDown(0.5);
      doc
        .fontSize(10)
        .text(p.fullName, 50, doc.y, { width: 190, continued: true });
      doc.text(p.email, 250, doc.y, { width: 190, continued: true });
      doc.text(p.status, 450, doc.y, { width: 100 });
    }

    return new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.end();
    });
  }

  // --- MÉTODOS DE GERENCIAMENTO DE ADMIN (CRUD) ---

  // (C) CREATE ADMIN
  async createAdmin(createAdminDto: CreateAdminDto) {
    const { email, password, isSuperAdmin, roomAccess } = createAdminDto;

    const existingUser = await this.adminUserRepository.findOneBy({ email });
    if (existingUser) {
      throw new ConflictException('Este e-mail já está em uso.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = this.adminUserRepository.create({
      email,
      password_hash: passwordHash,
      is_super_admin: isSuperAdmin,
      room_access: roomAccess || null,
    });

    await this.adminUserRepository.save(newUser);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = newUser;
    return result;
  }

  // (R) READ ALL ADMINS
  async findAllAdmins() {
    const admins = await this.adminUserRepository.find({
      order: { email: 'ASC' },
    });
    return admins;
  }

  // (R) READ ONE ADMIN
  async findOneAdmin(id: string) {
    const admin = await this.adminUserRepository.findOneBy({ id });
    if (!admin) {
      throw new NotFoundException('Administrador não encontrado.');
    }
    return admin;
  }

  // (U) UPDATE ADMIN
  async updateAdmin(id: string, updateAdminDto: UpdateAdminDto) {
    const admin = await this.findOneAdmin(id);

    if (updateAdminDto.email && updateAdminDto.email !== admin.email) {
      const existing = await this.adminUserRepository.findOneBy({
        email: updateAdminDto.email,
      });
      if (existing) {
        throw new ConflictException('O e-mail fornecido já está em uso.');
      }
    }

    if (updateAdminDto.password) {
      const salt = await bcrypt.genSalt(10);
      admin.password_hash = await bcrypt.hash(updateAdminDto.password, salt);
    }

    if (updateAdminDto.email) {
      admin.email = updateAdminDto.email;
    }
    if (typeof updateAdminDto.isSuperAdmin === 'boolean') {
      admin.is_super_admin = updateAdminDto.isSuperAdmin;
    }
    if (updateAdminDto.roomAccess !== undefined) {
      admin.room_access = updateAdminDto.roomAccess || null;
    }

    const updatedAdmin = await this.adminUserRepository.save(admin);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = updatedAdmin;
    return result;
  }

  // (D) DELETE ADMIN
  async removeAdmin(id: string) {
    const admin = await this.findOneAdmin(id);
    await this.adminUserRepository.remove(admin);
    return {
      success: true,
      message: 'Administrador removido com sucesso.',
    };
  }

  // --- ESTATÍSTICAS ---

  async getStatistics(
    user: AdminUserPayload,
    filters: {
      room?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

      // Calcula início e fim da semana (segunda a sexta)
      const dayOfWeek = today.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const mondayStr = monday.toISOString().split('T')[0];

      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      const fridayStr = friday.toISOString().split('T')[0];

      // Define o filtro de sala baseado no usuário e filtros
      let roomFilter: string | null = null;
      if (!user.isSuperAdmin) {
        // Admin de sala só vê dados da sua sala
        roomFilter = user.roomAccess;
      } else if (filters.room && filters.room !== 'all') {
        // Super admin pode filtrar por sala específica
        roomFilter = filters.room;
      }

      // Query base - usando getRepository para garantir dados frescos
      const queryBuilder = this.bookingRepository
        .createQueryBuilder('booking')
        .select();

      // Aplica filtro de sala se necessário
      if (roomFilter) {
        queryBuilder.andWhere('booking.room_name = :room', {
          room: roomFilter,
        });
      }

      // Para MySQL, não usamos unnest. Vamos buscar todos e filtrar em memória
      // já que o campo dates é um simple-array (string separada por vírgula)

      // Busca todos os bookings com os filtros aplicados
      const allBookingsRaw = await queryBuilder.getMany();

      // Para o SUMMARY (contagem de status), usamos TODOS os bookings sem filtro de período
      // Isso garante que pendentes, aprovados, etc. sempre reflitam o estado atual
      const allBookingsForSummary = allBookingsRaw;

      // Para gráficos históricos (monthlyStats, weekdayStats), filtramos por período
      let allBookingsForCharts = allBookingsRaw;
      if (filters.startDate && filters.endDate) {
        const startDate = filters.startDate;
        const endDate = filters.endDate;
        allBookingsForCharts = allBookingsRaw.filter((booking) => {
          if (!booking.dates || booking.dates.length === 0) return false;
          // Verifica se alguma data do booking está no período
          return booking.dates.some((dateStr) => {
            return dateStr >= startDate && dateStr <= endDate;
          });
        });
      }

      // ===== ESTATÍSTICAS GERAIS (usa todos os bookings, sem filtro de período) =====

      // Total de reservas
      const totalBookings = allBookingsForSummary.length;

      // Reservas por status
      const approvedBookings = allBookingsForSummary.filter(
        (b) => b.status === 'approved',
      );
      const rejectedBookings = allBookingsForSummary.filter(
        (b) => b.status === 'rejected',
      );
      const pendingBookings = allBookingsForSummary.filter(
        (b) => b.status === 'pending',
      );
      const emAnaliseBookings = allBookingsForSummary.filter(
        (b) => b.status === 'em_analise',
      );

      // Reservas de hoje (booking com data de hoje)
      const todayBookings = allBookingsForSummary.filter((b) =>
        b.dates?.some((d) => d === todayStr),
      );

      // Reservas da semana (segunda a sexta da semana atual)
      const weekBookings = allBookingsForSummary.filter((b) =>
        b.dates?.some((d) => d >= mondayStr && d <= fridayStr),
      );

      // Reservas futuras (data >= hoje)
      const futureBookings = allBookingsForSummary.filter((b) =>
        b.dates?.some((d) => d >= todayStr),
      );

      // ===== RANKING POR SETOR (Top 7) - usa todos os bookings =====
      const sectorCount: Record<string, number> = {};
      for (const booking of allBookingsForSummary) {
        const sector = booking.setor_solicitante || 'Não informado';
        sectorCount[sector] = (sectorCount[sector] || 0) + 1;
      }

      const topSectors = Object.entries(sectorCount)
        .map(([sector, count]) => ({ sector, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 7);

      // ===== RESERVAS POR MÊS (últimos 6 meses + mês atual + próximo mês) =====
      // Incluindo meses futuros para capturar reservas agendadas
      const monthlyData: Record<
        string,
        {
          approved: number;
          rejected: number;
          pending: number;
          emAnalise: number;
        }
      > = {};
      const months: string[] = [];

      // Começa 5 meses atrás e vai até 1 mês à frente
      for (let i = 5; i >= -1; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push(monthKey);
        monthlyData[monthKey] = {
          approved: 0,
          rejected: 0,
          pending: 0,
          emAnalise: 0,
        };
      }

      // Contabiliza todos os bookings por mês (usando allBookingsForSummary para ter visão completa)
      for (const booking of allBookingsForSummary) {
        if (!booking.dates || booking.dates.length === 0) continue;
        const firstDate = booking.dates[0];
        const monthKey = firstDate.substring(0, 7); // YYYY-MM

        if (monthlyData[monthKey]) {
          if (booking.status === 'approved') {
            monthlyData[monthKey].approved++;
          } else if (booking.status === 'rejected') {
            monthlyData[monthKey].rejected++;
          } else if (booking.status === 'pending') {
            monthlyData[monthKey].pending++;
          } else if (booking.status === 'em_analise') {
            monthlyData[monthKey].emAnalise++;
          }
        }
      }

      const monthlyStats = months.map((month) => {
        const [year, m] = month.split('-');
        const monthNames = [
          'Jan',
          'Fev',
          'Mar',
          'Abr',
          'Mai',
          'Jun',
          'Jul',
          'Ago',
          'Set',
          'Out',
          'Nov',
          'Dez',
        ];
        return {
          month: `${monthNames[parseInt(m) - 1]}/${year.slice(2)}`,
          aprovadas: monthlyData[month].approved,
          canceladas: monthlyData[month].rejected,
          pendentes: monthlyData[month].pending,
          emAnalise: monthlyData[month].emAnalise,
        };
      });

      // ===== RESERVAS POR DIA DA SEMANA (usa todos os bookings) =====
      const weekdayCount: Record<string, number> = {
        Segunda: 0,
        Terça: 0,
        Quarta: 0,
        Quinta: 0,
        Sexta: 0,
      };

      const weekdayNames = [
        'Domingo',
        'Segunda',
        'Terça',
        'Quarta',
        'Quinta',
        'Sexta',
        'Sábado',
      ];

      for (const booking of allBookingsForSummary) {
        if (!booking.dates) continue;
        for (const dateStr of booking.dates) {
          const date = new Date(dateStr + 'T12:00:00'); // Adiciona horário para evitar problemas de timezone
          const dayName = weekdayNames[date.getDay()];
          if (weekdayCount[dayName] !== undefined) {
            weekdayCount[dayName]++;
          }
        }
      }

      const weekdayStats = Object.entries(weekdayCount).map(([day, count]) => ({
        day,
        count,
      }));

      // ===== RESERVAS POR SALA (para super admin) - usa todos os bookings =====
      const roomCount: Record<string, number> = {};
      for (const booking of allBookingsForSummary) {
        const room = booking.room_name || 'Não informado';
        roomCount[room] = (roomCount[room] || 0) + 1;
      }

      const roomStats = Object.entries(roomCount).map(([room, count]) => ({
        room,
        count,
      }));

      // ===== LISTA DE RESERVAS RECENTES (para tabela detalhada) COM PAGINAÇÃO =====
      const page = filters.page || 1;
      const limit = filters.limit || 10;

      // Ordena por data mais recente primeiro
      const sortedBookings = allBookingsForSummary
        .filter((b) => b.dates && b.dates.length > 0)
        .sort((a, b) => {
          const dateA = a.dates?.[0] ?? '';
          const dateB = b.dates?.[0] ?? '';
          // Ordena por data descendente, depois por hora de início descendente
          if (dateB !== dateA) {
            return (dateB || '').localeCompare(dateA || '');
          }
          const horaInicioA = Array.isArray(a.hora_inicio)
            ? (a.hora_inicio[0] ?? '')
            : (a.hora_inicio ?? '');
          const horaInicioB = Array.isArray(b.hora_inicio)
            ? (b.hora_inicio[0] ?? '')
            : (b.hora_inicio ?? '');
          return (horaInicioB || '').localeCompare(horaInicioA || '');
        });

      const totalRecentBookings = sortedBookings.length;
      const totalPages = Math.ceil(totalRecentBookings / limit);
      const skip = (page - 1) * limit;

      const recentBookings = sortedBookings
        .slice(skip, skip + limit)
        .map((booking) => ({
          id: booking.id,
          responsavel:
            booking.responsavel || booking.nome_completo || 'Não informado',
          setor: booking.setor_solicitante || 'Não informado',
          room: booking.room_name,
          dates: booking.dates,
          horaInicio: booking.hora_inicio,
          horaFim: booking.hora_fim,
          status: booking.status,
          finalidade: booking.finalidade || '',
        }));

      return {
        summary: {
          today: todayBookings.length,
          week: weekBookings.length,
          future: futureBookings.length,
          total: totalBookings,
          approved: approvedBookings.length,
          rejected: rejectedBookings.length,
          pending: pendingBookings.length,
          emAnalise: emAnaliseBookings.length,
        },
        topSectors,
        monthlyStats,
        weekdayStats,
        roomStats,
        recentBookings,
        recentBookingsPagination: {
          total: totalRecentBookings,
          page,
          limit,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Erro em getStatistics:', error);
      throw error;
    }
  }

  // GET /api/admin/statistics/bookings - Busca reservas filtradas por tipo
  async getFilteredBookings(
    user: AdminUserPayload,
    filters: {
      filterType: string;
      room?: string;
      page?: number;
      limit?: number;
    },
  ) {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

    // Calcula início e fim da semana (segunda a sexta)
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const mondayStr = monday.toISOString().split('T')[0];

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const fridayStr = friday.toISOString().split('T')[0];

    // Define o filtro de sala baseado no usuário
    let roomFilter: string | null = null;
    if (!user.isSuperAdmin) {
      roomFilter = user.roomAccess;
    } else if (filters.room && filters.room !== 'all') {
      roomFilter = filters.room;
    }

    // Query base
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .select();

    if (roomFilter) {
      queryBuilder.andWhere('booking.room_name = :room', { room: roomFilter });
    }

    const allBookings = await queryBuilder.getMany();

    // Filtra por tipo
    let filteredBookings = allBookings;
    let filterTitle = '';

    switch (filters.filterType) {
      case 'today':
        filteredBookings = allBookings.filter((b) =>
          Array.isArray(b.dates) && b.dates.some((d) => d === todayStr),
        );
        filterTitle = 'Reservas de Hoje';
        break;
      case 'week':
        filteredBookings = allBookings.filter((b) =>
          Array.isArray(b.dates) && b.dates.some((d) => d >= mondayStr && d <= fridayStr),
        );
        filterTitle = 'Reservas da Semana';
        break;
      case 'future':
        filteredBookings = allBookings.filter((b) =>
          Array.isArray(b.dates) && b.dates.some((d) => d >= todayStr),
        );
        filterTitle = 'Reservas Futuras';
        break;
      case 'total':
        filterTitle = 'Total de Reservas';
        break;
      case 'approved':
        filteredBookings = allBookings.filter((b) => b.status === 'approved');
        filterTitle = 'Reservas Aprovadas';
        break;
      case 'rejected':
        filteredBookings = allBookings.filter((b) => b.status === 'rejected');
        filterTitle = 'Reservas Rejeitadas';
        break;
      case 'pending':
        filteredBookings = allBookings.filter((b) => b.status === 'pending');
        filterTitle = 'Reservas Pendentes';
        break;
      case 'em_analise':
        filteredBookings = allBookings.filter((b) => b.status === 'em_analise');
        filterTitle = 'Reservas Em Análise';
        break;
      default:
        filterTitle = 'Reservas';
    }

    // Ordena por data (mais recente primeiro)
    const sortedBookings = filteredBookings
      .filter((b) => b.dates && b.dates.length > 0)
      .sort((a, b) => {
        const dateA = a.dates?.[0] || '';
        const dateB = b.dates?.[0] || '';
        if (dateB !== dateA) {
          return dateB.localeCompare(dateA);
        }
        
        const rawHoraInicioA = Array.isArray(a.hora_inicio)
          ? a.hora_inicio[0]
          : a.hora_inicio;
        const horaInicioA = rawHoraInicioA || '';

        const rawHoraInicioB = Array.isArray(b.hora_inicio)
          ? b.hora_inicio[0]
          : b.hora_inicio;
        const horaInicioB = rawHoraInicioB || '';
        
        return horaInicioB.localeCompare(horaInicioA);
      });

    // Paginação
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const total = sortedBookings.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const paginatedBookings = sortedBookings
      .slice(skip, skip + limit)
      .map((booking) => ({
        id: booking.id || '',
        responsavel:
          booking.responsavel || booking.nome_completo || 'Não informado',
        setor: booking.setor_solicitante || 'Não informado',
        room: booking.room_name || '',
        dates: booking.dates || [],
        horaInicio: booking.hora_inicio || [],
        horaFim: booking.hora_fim || [],
        status: booking.status || 'pending',
        finalidade: booking.finalidade || '',
      }));

      return {
        filterTitle,
        filterType: filters.filterType,
        bookings: paginatedBookings,
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Erro em getFilteredBookings:', error);
      throw error;
    }
  }
}
