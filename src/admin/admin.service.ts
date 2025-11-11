import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from 'src/entities/booking.entity';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { MailService } from 'src/mail/mail.service';
import PDFDocument from 'pdfkit';
import { AdminUser } from 'src/entities/admin-user.entity';
import { CreateAdminDto } from 'src/auth/dto/create-admin.dto';
import * as bcrypt from 'bcrypt';
import { UpdateAdminDto } from './dto/update-admin.dto';

type AdminUserPayload = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  roomAccess: string;
};

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

  async findAll(pagination: any, filters: any, user: AdminUserPayload) {
    const { page, limit } = pagination;
    const where: FindOptionsWhere<Booking> = {};

    if (!user.isSuperAdmin) {
      where.room = user.roomAccess;
    } else if (filters.room) {
      where.room = filters.room;
    }

    if (filters.status) where.status = filters.status;
    if (filters.date) where.data = filters.date;
    if (filters.name) where.nome_completo = Like(`%${filters.name}%`);

    const [results, total] = await this.bookingRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: [
        'id',
        'room',
        'data',
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
        totalpages: Math.ceil(total / limit),
      },
    };
  }

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
        data: booking.data,
        horaInicio: booking.hora_inicio,
        horaFim: booking.hora_fim,
        numeroParticipantes: booking.numero_participantes,
        participantes: booking.participantes,
        finalidade: booking.finalidade,
        descricao: booking.descricao,
      },
      equipamentos: {
        projetor: booking.projetor,
        somProjetor: booking.som_projetor,
        internet: booking.internet,
        wifiTodos: booking.wifi_todos,
        conexaoCabo: booking.conexao_cabo,
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

  async approve(id: string, user: AdminUserPayload) {
    const booking = await this.bookingRepository.findOneBy({ id });
    if (!booking) {
      throw new NotFoundException('Agendamento não encontrado');
    }
    this.checkPermission(booking, user);

    booking.status = 'approved';
    booking.approved_by = user.email;
    booking.approved_at = new Date();
    booking.rejected_by = null;
    booking.rejected_at = null;
    booking.rejection_reason = null;

    const savedBooking = await this.bookingRepository.save(booking);

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
        aprovedBy: savedBooking.approved_by,
        aprovedAt: savedBooking.approved_at,
      },
    };
  }

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

    booking.status = 'reject';
    booking.rejected_by = user.email;
    booking.rejected_at = new Date();
    booking.rejection_reason = rejectBookingDto.reason ?? null;
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

    Object.assign(booking, updateBookingDto);

    if (updateBookingDto.data) {
      booking.data = updateBookingDto.data;
    }

    const updatedBooking = await this.bookingRepository.save(booking);

    await this.mailService.sendUpdateEmail(updatedBooking);

    return {
      success: true,
      message: 'Agendamento atualizado com sucesso',
      booking: updatedBooking,
    };
  }

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

    const dataString = booking.data as unknown as string;
    const [year, month, day] = dataString.split('-').map(Number);
    const [hour, minute] = booking.hora_inicio.split(':').map(Number);
    const bookingStartTime = new Date(year, month - 1, day, hour, minute);

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
      status: record.status, // 'Presente' ou 'Ausente'
    }));

    const respondedEmails = attendance.map((a) => a.email);

    for (const email of booking.participantes) {
      if (!respondedEmails.includes(email.toLowerCase())) {
        let status = 'Pendente'; // [cite: 397]
        if (now > bookingStartTime) {
          status = 'Não Confirmado'; // [cite: 398]
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
        date: new Date(`${booking.data}T12:00:00Z`).toLocaleDateString('pt-BR'),
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

  async generateAttendancePdf(
    id: string,
    user: AdminUserPayload,
  ): Promise<Buffer> {
    const data = await this.getAttendance(id, user);
    const { booking, attendance } = data;

    //(TODO: Adicionar logo)
    const doc = new PDFDocument({ margin: 50 });
    const buffers: Buffer[] = [];
    doc.on('data', buffers.push.bind(buffers));

    doc.fontSize(20).text('Lista de Presença - SEGET', { align: 'center' });
    doc.moveDown();

    // Detalhes do Agendamento
    doc.fontSize(14).text(`Evento: ${booking.purpose}`);
    doc
      .fontSize(12)
      .text(
        `Data: ${booking.date} | Horário: ${booking.startTime} - ${booking.endTime}`,
      );
    doc.text(`sala: ${booking.roomName}`);
    doc.text(`Responsável: ${booking.responsavel} (${booking.sector})`);
    doc.moveDown();

    // Tabela de Presença (simples)
    doc.fontSize(14).text('Participantes');
    doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Cabeçalho
    doc.fontSize(10).text('Nome Completo', 50, doc.y, { continued: true });
    doc.text('E-mail', 250, doc.y, { continued: true });
    doc.text('Status', 450, doc.y);
    doc.moveDown(0.5);
    doc.lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();

    // Linhas
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

    const { password_hash, ...result } = newUser;
    return result;
  }

  async findAllAdmins() {
    const admins = await this.adminUserRepository.find({
      order: { email: 'ASC' },
      // O 'select: false' na entidade já esconde o password_hash
    });
    return admins;
  }

  async findOneAdmin(id: string) {
    const admin = await this.adminUserRepository.findOneBy({ id });
    if (!admin) {
      throw new NotFoundException('Administrador não encontrado.');
    }
    return admin;
  }

  async updateAdmin(id: string, updateAdminDto: UpdateAdminDto) {
    // 1. Busca o admin
    const admin = await this.findOneAdmin(id);

    // 2. Se o email estiver sendo mudado, checa se o novo email já existe
    if (updateAdminDto.email && updateAdminDto.email !== admin.email) {
      const existing = await this.adminUserRepository.findOneBy({ 
        email: updateAdminDto.email 
      });
      if (existing) {
        throw new ConflictException('O e-mail fornecido já está em uso.');
      }
    }

    // 3. Se a senha estiver sendo mudada, criptografa a nova senha
    if (updateAdminDto.password) {
      const salt = await bcrypt.genSalt(10);
      admin.password_hash = await bcrypt.hash(updateAdminDto.password, salt);
    }

    // 4. Atualiza os outros campos
    if (updateAdminDto.email) {
      admin.email = updateAdminDto.email;
    }
    if (typeof updateAdminDto.isSuperAdmin === 'boolean') {
      admin.is_super_admin = updateAdminDto.isSuperAdmin;
    }
    if (updateAdminDto.roomAccess !== undefined) {
      admin.room_access = updateAdminDto.roomAccess || null;
    }

    // 5. Salva
    const updatedAdmin = await this.adminUserRepository.save(admin);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = updatedAdmin;
    return result;
  }

  async removeAdmin(id: string) {
    // 1. Busca o admin para garantir que ele existe
    const admin = await this.findOneAdmin(id);
    
    // 2. Remove
    await this.adminUserRepository.remove(admin);
    
    return {
      success: true,
      message: 'Administrador removido com sucesso.'
    };
  }
}
