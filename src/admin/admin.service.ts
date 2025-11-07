import { Injectable, UnauthorizedException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from 'src/entities/booking.entity';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { MailService } from 'src/mail/mail.service';

type AdminUserPayload = {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  roomAccess: string;
}

@Injectable()
export class AdminService {
    constructor(
        @InjectRepository(Booking)
        private readonly bookingRepository: Repository<Booking>,
        @InjectRepository(AttendanceRecord)
        private readonly attendanceRepository: Repository<AttendanceRecord>,
        private readonly mailService: MailService,
    ){}

    private checkPermission(booking: Booking, user: AdminUserPayload){
        if (user.isSuperAdmin) {
            return true;
        }

        if (booking.room === user.roomAccess) {
            return true;
        }
        throw new ForbiddenException('Você não tem permissão para acessar este agendamento.');
    }

    async findAll(pagination: any, filters: any, user: AdminUserPayload){
        const { page, limit } = pagination;
        const where: FindOptionsWhere<Booking> = {};

        if (!user.isSuperAdmin){
            where.room = user.roomAccess;
        } else if (filters.room) {
            where.room = filters.room
        }

        if (filters.status) where.status = filters.status;
        if (filters.date) where.data = new Date(filters.date);
        if (filters.name) where.nome_completo = Like(`%${filters.name}%`);

        const [results, total] = await this.bookingRepository.findAndCount({
            where,
            order: { created_at: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
            select: [ 'id', 'room', 'data', 'hora_inicio', 'hora_fim', 'nome_completo', 'setor_solicitante', 'finalidade', 'status', 'created_at' ],
        });
        return {
            bookings: results,
            pagination: {
                total,
                page,
                limit,
                totalpages: Math.ceil(total/limit),
            },
        };
    }

    async findOne(id: string, user: AdminUserPayload) {
        const booking = await this.bookingRepository.findOneBy({ id });
        if (!booking){
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
                data: booking.data.toISOString().split('T')[0],
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
    
    async approve(id: string, user: AdminUserPayload){
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
                aprovedAt: savedBooking.approved_at
            },
        };
    }

    async reject(id: string, rejectBookingDto: RejectBookingDto, user: AdminUserPayload){
        const booking = await this.bookingRepository.findOneBy({ id });
        if (!booking) {
            throw new NotFoundException('Agendamento não encontrado');
        }
        this.checkPermission(booking, user);

        booking.status = 'reject';
        booking.rejected_by = user.email;
        booking.rejected_at = new Date();
        booking.rejection_reason = rejectBookingDto.reason;
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

    async update(id: string, updateBookingDto: UpdateBookingDto, user: AdminUserPayload) {
        const booking = await this.bookingRepository.findOneBy({ id });
        if (!booking) {
            throw new NotFoundException('Agendamento não encontrado');
        }
        this.checkPermission(booking, user);

        Object.assign(booking, updateBookingDto);

        if (updateBookingDto.data) {
            booking.data = new Date(updateBookingDto.data);
        }

        const updatedBooking = await this.bookingRepository.save(booking);

        // TODO: Enviar e-mail de notificação de mudança (Fase 7)

        return {
            success: true, 
            message: 'Agendamento atualizado com sucesso',
            booking: updatedBooking,
        };
    }

    async getAttendance(id: string, user: AdminUserPayload){
        const booking = await this.bookingRepository.findOne({
            where: { id },
            relations: ['attendance_records'],
        });

        if (!booking) {
            throw new NotFoundException('Agendamento não encontrado');
        }
        this.checkPermission(booking, user);
        const attendance = (booking.attendance_records || []).map(record => ({
            id: record.id,
            fullName: record.full_name,
            email: record.email,
            confirmedAt: record.confirmed_at?.toLocaleDateString('pt-BR'), // Formata data
            confirmedTime: record.confirmed_at?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            isVisitor: record.is_visitor,
            status: record.status,
        }));
        //TODO: Adicionar lógica de status 'Pendente' e 'Não Confirmado' [cite: 397-398]

        return {
            booking: {
                id: booking.id,
                room: booking.room,
                roomName: booking.room_name,
                date: booking.data.toLocaleDateString('pt-BR'),
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
}
