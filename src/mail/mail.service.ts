import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { Booking } from 'src/entities/booking.entity';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

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

  async sendAdminNotification(booking: Booking, adminEmail: string) {
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

  async sendUpdateEmail(booking: Booking) {
    const formattedDates = booking.dates
      .map((date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR'))
      .join(', ');

    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Seu agendamento foi atualizado',
      html: `Olá ${booking.nome_completo},<br><br>Seu agendamento para a sala ${booking.room_name} nas datas ${formattedDates} foi modificado. Por favor, verifique os novos detalhes.`,
    });
  }

  async sendAttendanceConfirmation(record: AttendanceRecord, booking: Booking) {
    await this.mailerService.sendMail({
      to: record.email,
      subject: `Presença Confirmada: ${booking.finalidade}`,
      html: `Olá ${record.full_name},<br><br>Sua presença como <b>${record.status}</b> foi registrada com sucesso para o evento ${booking.finalidade}.`,
    });
  }
  
  // E-mail: Status mudou para "Em Análise"
  async sendUnderAnalysisEmail(booking: Booking, observacao: string) {
    // Formata a data (ou datas) para o e-mail
    const dateStr = Array.isArray(booking.dates) ? booking.dates.join(', ') : booking.dates;

    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Atualização de Status: Em Análise',
      html: `
        <h3>Olá ${booking.nome_completo},</h3>
        <p>O status da sua solicitação para a <b>${booking.room_name}</b> (Data(s): ${dateStr}) foi alterado para <b>Em Análise</b>.</p>
        <p><b>Observação da Administração:</b></p>
        <blockquote style="background: #f9f9f9; border-left: 10px solid #ccc; margin: 1.5em 10px; padding: 0.5em 10px;">
          ${observacao}
        </blockquote>
        <p>Você será notificado assim que houver uma nova atualização.</p>
      `,
    });
  }
}
