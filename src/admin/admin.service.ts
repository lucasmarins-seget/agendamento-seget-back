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
import * as bcrypt from 'bcrypt';
import { MailService } from 'src/mail/mail.service';
import PDFDocument from 'pdfkit';

// O 'user' que recebemos é o payload do token
type AdminUserPayload = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  roomAccess: string;
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
  ) {}

  // Checa se o admin tem permissão para acessar um agendamento
  private checkPermission(booking: Booking, user: AdminUserPayload) {
    if (user.isSuperAdmin) {
      return true;
    }
    if (booking.room === user.roomAccess) {
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
    const where: FindOptionsWhere<Booking> = {};

    // 1. Filtro de Permissão
    if (!user.isSuperAdmin) {
      where.room = user.roomAccess;
    } else if (filters.room) {
      where.room = filters.room;
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
        'room',
        'room_name',
        'dates', // Importante: trazer o array de datas
        'hora_inicio',
        'hora_fim',
        'nome_completo',
        'setor_solicitante',
        'finalidade',
        'status',
        'created_at',
      ],
    });

    return {
      bookings: results,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // GET /api/admin/bookings/:id/details
  async findOne(id: string, user: AdminUserPayload) {
    const booking = await this.bookingRepository.findOneBy({ id });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    return {
      id: booking.id,
      room: booking.room,
      roomName: booking.room_name,
      tipoReserva: booking.tipo_reserva,
      status: booking.status,
      solicitante: {
        nomeCompleto: booking.nome_completo,
        setorSolicitante: booking.setor_solicitante,
        responsavel: booking.responsavel,
        telefone: booking.telefone,
        email: booking.email,
      },
      agendamento: {
        dates: booking.dates, // Retorna o array
        horaInicio: booking.hora_inicio,
        horaFim: booking.hora_fim,
        numeroParticipantes: booking.numero_participantes,
        participantes: booking.participantes,
        finalidade: booking.finalidade,
        descricao: booking.descricao,
        observacao: booking.observacao, // Novo campo
        local: booking.local, // Novo campo
      },
      equipamentos: {
        projetor: booking.projetor,
        somProjetor: booking.som_projetor,
        internet: booking.internet,
        wifiTodos: booking.wifi_todos,
        conexao_cabo: booking.conexao_cabo,
      },
      especificos: {
        softwareEspecifico: booking.software_especifico,
        qualSoftware: booking.qual_software,
        papelaria: booking.papelaria,
        materialExterno: booking.material_externo,
        apoioEquipe: booking.apoio_equipe,
      },
      metadata: {
        createdAt: booking.created_at,
        updatedAt: booking.updated_at,
        approvedBy: booking.approved_by,
        approvedAt: booking.approved_at,
        rejectedBy: booking.rejected_by,
        rejectedAt: booking.rejected_at,
        rejectionReason: booking.rejection_reason,
      },
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

    // Define a observação
    const observacao =
      analyzeBookingDto.observacao ||
      'Seu agendamento está sob análise da administração para verificação de detalhes.';

    booking.status = 'em_analise';
    // Salva a observação no campo 'rejection_reason' para histórico do admin
    booking.rejection_reason = observacao;

    // Limpa metadados de aprovação/rejeição anteriores
    booking.approved_by = null;
    booking.approved_at = null;
    booking.rejected_by = null;
    booking.rejected_at = null;

    const savedBooking = await this.bookingRepository.save(booking);

    // Envia e-mail notificando a mudança
    await this.mailService.sendUnderAnalysisEmail(savedBooking, observacao);

    return {
      success: true,
      message: 'Agendamento movido para "Em Análise"',
      booking: {
        id: savedBooking.id,
        status: savedBooking.status,
        observacaoAdmin: observacao,
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

    // Mescla os dados novos na entidade existente
    Object.assign(booking, updateBookingDto);

    // Se houver lógica especial para datas, adicionar aqui.
    // Como 'dates' é array de strings, o assign funciona bem.

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
        room: booking.room,
        roomName: booking.room_name,
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
    doc.text(`Sala: ${booking.roomName}`);
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