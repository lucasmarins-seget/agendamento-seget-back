import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from 'src/entities/booking.entity';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { AdminUser } from 'src/entities/admin-user.entity';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
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
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    private readonly mailService: MailService,
  ) { }

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
      } else if (filters.room_name) {
        where.room_name = filters.room_name;
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
    const booking = await this.bookingRepository.findOneBy({ id });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

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
      numero_participantes: booking.numero_participantes,
      participantes: booking.participantes,
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
    };
  }

  // PATCH /api/admin/bookings/:id/approve
  async approve(id: string, user: AdminUserPayload) {
    const booking = await this.bookingRepository.findOneBy({ id });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    booking.status = 'approved';
    booking.approved_by = user.email;
    booking.approved_at = new Date();

    // Limpa dados de rejeição se houver
    booking.rejected_by = null;
    booking.rejected_at = null;
    booking.rejection_reason = null;

    const savedBooking = await this.bookingRepository.save(booking);

    // Envia notificações
    await this.mailService.sendApprovalEmail(savedBooking);
    for (const email of savedBooking.participantes) {
      await this.mailService.sendAttendanceLink(savedBooking, email);
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
    const booking = await this.bookingRepository.findOneBy({ id });
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

    // Envia e-mail notificando a mudança com a observação do admin
    await this.mailService.sendUnderAnalysisEmail(savedBooking, observacaoAdmin);

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
    const booking = await this.bookingRepository.findOneBy({ id });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    const { datesToApprove, rejectionReason } = approvePartialDto;
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
      return this.approve(id, user);
    }

    // Se tentar aprovar vazio, é rejeição total
    if (datesToApprove.length === 0) {
      return this.reject(id, { reason: rejectionReason }, user);
    }

    // 2. Atualizar a Entidade Original (Aprovada)
    booking.dates = datesToApprove;
    booking.status = 'approved';
    booking.approved_by = user.email;
    booking.approved_at = new Date();

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
      rejection_reason: rejectionReason || 'Datas indisponíveis na solicitação parcial.',
      created_at: new Date(), // Novo timestamp
      updated_at: new Date(),
    });

    const savedRejectedBooking = await this.bookingRepository.save(rejectedBooking);

    // 4. Disparar E-mails
    // Aprovado:
    await this.mailService.sendApprovalEmail(savedApprovedBooking);
    for (const email of savedApprovedBooking.participantes) {
      await this.mailService.sendAttendanceLink(savedApprovedBooking, email);
    }

    // Rejeitado:
    await this.mailService.sendRejectionEmail(savedRejectedBooking);

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
    const booking = await this.bookingRepository.findOneBy({ id });
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

    await this.mailService.sendRejectionEmail(savedBooking);

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
    const booking = await this.bookingRepository.findOneBy({ id });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    // Mapeamento explícito de DTO (camelCase) para Entity (snake_case)
    // Isso é necessário porque o Object.assign direto não lida com a diferença de nomes
    if (updateBookingDto.room_name) booking.room_name = updateBookingDto.room_name;
    if (updateBookingDto.tipoReserva) booking.tipo_reserva = updateBookingDto.tipoReserva;
    if (updateBookingDto.nomeCompleto) booking.nome_completo = updateBookingDto.nomeCompleto;
    if (updateBookingDto.setorSolicitante) booking.setor_solicitante = updateBookingDto.setorSolicitante;
    if (updateBookingDto.horaInicio) booking.hora_inicio = updateBookingDto.horaInicio;
    if (updateBookingDto.horaFim) booking.hora_fim = updateBookingDto.horaFim;
    if (updateBookingDto.numeroParticipantes) booking.numero_participantes = updateBookingDto.numeroParticipantes;

    // Campos que já coincidem ou são simples
    if (updateBookingDto.dates) booking.dates = updateBookingDto.dates;
    if (updateBookingDto.responsavel) booking.responsavel = updateBookingDto.responsavel;
    if (updateBookingDto.telefone) booking.telefone = updateBookingDto.telefone;
    if (updateBookingDto.email) booking.email = updateBookingDto.email;
    if (updateBookingDto.participantes) booking.participantes = updateBookingDto.participantes;
    if (updateBookingDto.finalidade) booking.finalidade = updateBookingDto.finalidade;
    if (updateBookingDto.descricao) booking.descricao = updateBookingDto.descricao;
    if (updateBookingDto.observacao !== undefined) booking.observacao = updateBookingDto.observacao;

    // Equipamentos e Específicos (mapeamento)
    if (updateBookingDto.projetor) booking.projetor = updateBookingDto.projetor;
    if (updateBookingDto.somProjetor) booking.som_projetor = updateBookingDto.somProjetor;
    if (updateBookingDto.internet) booking.internet = updateBookingDto.internet;
    if (updateBookingDto.wifiTodos) booking.wifi_todos = updateBookingDto.wifiTodos;
    if (updateBookingDto.conexaoCabo) booking.conexao_cabo = updateBookingDto.conexaoCabo;
    if (updateBookingDto.softwareEspecifico) booking.software_especifico = updateBookingDto.softwareEspecifico;
    if (updateBookingDto.qualSoftware) booking.qual_software = updateBookingDto.qualSoftware;
    if (updateBookingDto.papelaria) booking.papelaria = updateBookingDto.papelaria;
    if (updateBookingDto.materialExterno) booking.material_externo = updateBookingDto.materialExterno;
    if (updateBookingDto.apoioEquipe) booking.apoio_equipe = updateBookingDto.apoioEquipe;

    const updatedBooking = await this.bookingRepository.save(booking);

    // Opcional: await this.mailService.sendUpdateEmail(updatedBooking);

    return {
      success: true,
      message: 'Agendamento atualizado com sucesso',
      booking: updatedBooking,
    };
  }

  // GET /api/admin/bookings/:id/attendance
  async getAttendance(id: string, user: AdminUserPayload) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['attendance_records'],
    });

    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    const now = new Date();
    // Pega a primeira data para referência
    const firstDateStr =
      booking.dates && booking.dates.length > 0 ? booking.dates[0] : null;

    let bookingStartTime = now;
    if (firstDateStr) {
      const [year, month, day] = firstDateStr.split('-').map(Number);
      const [hour, minute] = booking.hora_inicio.split(':').map(Number);
      bookingStartTime = new Date(year, month - 1, day, hour, minute);
    }

    const attendance: AttendanceResponse[] = (
      booking.attendance_records || []
    ).map((record) => ({
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
    }));

    const respondedEmails = attendance.map((a) => a.email);

    for (const email of booking.participantes) {
      if (!respondedEmails.includes(email.toLowerCase())) {
        let status = 'Pendente';
        if (now > bookingStartTime) {
          status = 'Não Confirmado';
        }

        attendance.push({
          id: null,
          fullName: 'N/A (Convidado)',
          email: email,
          confirmedAt: null,
          confirmedTime: null,
          isVisitor: null,
          status: status,
        });
      }
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
}