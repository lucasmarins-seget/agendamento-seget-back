import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  /**
   * Executa a cada minuto para verificar agendamentos que começaram
   * há 5 minutos e enviar e-mail de confirmação de presença
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleAttendanceEmailCron() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Calcula o horário de 5 minutos atrás
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const targetHour = fiveMinutesAgo.getHours().toString().padStart(2, '0');
    const targetMinute = fiveMinutesAgo
      .getMinutes()
      .toString()
      .padStart(2, '0');
    const targetTime = `${targetHour}:${targetMinute}`;

    this.logger.debug(
      `Verificando agendamentos para envio de e-mail de presença. Data: ${todayStr}, Horário alvo: ${targetTime}`,
    );

    try {
      // Busca todos os agendamentos aprovados
      const approvedBookings = await this.bookingRepository.find({
        where: { status: 'approved' },
        relations: ['external_participants'],
      });

      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:8080';

      for (const booking of approvedBookings) {
        // Verifica se alguma data do agendamento é hoje
        const todayIndex = booking.dates.findIndex((date) => date === todayStr);

        if (todayIndex === -1) continue;

        // Obtém o horário de início para esta data
        const horaInicio = Array.isArray(booking.hora_inicio)
          ? booking.hora_inicio[todayIndex] || booking.hora_inicio[0]
          : booking.hora_inicio;

        if (!horaInicio) continue;

        // Verifica se o horário de início é exatamente 5 minutos atrás
        if (horaInicio === targetTime) {
          this.logger.log(
            `Enviando e-mails de confirmação de presença para agendamento ${booking.id} - ${booking.finalidade}`,
          );

          await this.sendAttendanceEmails(booking, todayStr, frontendUrl);
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        'Erro ao verificar agendamentos para e-mail de presença:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Envia e-mails de confirmação de presença para todos os participantes
   */
  private async sendAttendanceEmails(
    booking: Booking,
    date: string,
    frontendUrl: string,
  ) {
    try {
      // 1. Envia para o solicitante
      await this.mailService.sendAttendanceConfirmationWithPDF(
        booking,
        booking.email,
        booking.nome_completo,
        frontendUrl,
        true, // isRequester
        date,
      );
      this.logger.debug(
        `E-mail de presença enviado para solicitante: ${booking.email}`,
      );

      // 2. Envia para participantes SEGET
      for (const participantEmail of booking.participantes) {
        if (participantEmail && participantEmail !== booking.email) {
          await this.mailService.sendAttendanceConfirmationWithPDF(
            booking,
            participantEmail,
            null, // Nome será buscado ou usado o e-mail
            frontendUrl,
            false,
            date,
          );
          this.logger.debug(
            `E-mail de presença enviado para participante SEGET: ${participantEmail}`,
          );
        }
      }

      // 3. Envia para participantes externos
      if (
        booking.external_participants &&
        booking.external_participants.length > 0
      ) {
        for (const participant of booking.external_participants) {
          await this.mailService.sendAttendanceConfirmationWithPDF(
            booking,
            participant.email,
            participant.full_name,
            frontendUrl,
            false,
            date,
          );
          this.logger.debug(
            `E-mail de presença enviado para participante externo: ${participant.email}`,
          );
        }
      }

      this.logger.log(
        `E-mails de confirmação de presença enviados com sucesso para agendamento ${booking.id}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao enviar e-mails de presença para agendamento ${booking.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
