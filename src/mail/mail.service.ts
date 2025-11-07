import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { Booking } from 'src/entities/booking.entity';

@Injectable()
export class MailService {
    constructor(private readonly mailerService: MailerService){}

    async sendBookingConfirmation(booking: Booking) {
        await this.mailerService.sendMail({
            to: booking.email,
            subject: 'Solicitação de Agendamento Recebida',
            html: `Olá ${booking.nome_completo}, <br><br>Sua solicitação para a sala ${booking.room_name} foi recebida e está <b>pendente</b>.`,
        });
    }

    async sendApprovalEmail(booking: Booking) {
        await this.mailerService.sendMail({
            to: booking.email,
            subject: 'Agendamento Aprovado',
            html: `Olá ${booking.nome_completo}, <br><br>Sua solicitação para a sala ${booking.room_name} foi <b>aprovada</b>.`,
        });
    }

    async sendRejectionEmail(booking: Booking) {
        await this.mailerService.sendMail({
            to: booking.email,
            subject: 'Agendamento Recusado',
            html: `Olá ${booking.nome_completo},<br><br>Sua solicitação para a sala ${booking.room_name} foi <b>recusada</b>.
                    <br>Motivo: ${booking.rejection_reason || 'Não informado'}`,
        });
    }

    async sendAdminNotification(booking: Booking, adminEmail: string){
        await this.mailerService.sendMail({
            to: adminEmail, // TODO: Buscar e-mail do admin da sala
            subject: `Novo Agendamento Pendente: ${booking.room_name}`,
            html: `Um novo agendamento foi solicitado por ${booking.nome_completo} para a sala ${booking.room_name}.`,
        });   
    }

    async sendAttendanceLink(booking: Booking, participantEmail: string) {
        const confirmationUrl = `http://SEU-FRONT-END.com/confirmar/${booking.id}`;
        await this.mailerService.sendMail({
        to: participantEmail,
        subject: `Confirme sua presença: ${booking.finalidade}`,
        html: `Você foi convidado para o evento ${booking.finalidade}.
                <br>Por favor, confirme sua presença: <a href="${confirmationUrl}">Confirmar Presença</a>`,
        });
    }
}
