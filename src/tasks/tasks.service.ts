import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { AttendanceRecord } from '../entities/attendance-record.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private sendingPausedUntil: Date | null = null;
  private readonly emailSendDelayMs: number;

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepository: Repository<AttendanceRecord>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    const configuredDelay = Number(
      this.configService.get<string>('EMAIL_SEND_DELAY_MS') ?? 300,
    );
    this.emailSendDelayMs = Number.isFinite(configuredDelay)
      ? Math.max(0, configuredDelay)
      : 300;
  }

  private async delay(ms: number) {
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  private isDailyLimitError(error: unknown): boolean {
    const anyError = error as { responseCode?: number; message?: string } | undefined;
    const message = anyError?.message || '';
    return (
      anyError?.responseCode === 550 &&
      message.includes('Daily user sending limit exceeded')
    );
  }

  private shouldPauseSending(): boolean {
    if (!this.sendingPausedUntil) return false;
    return new Date() < this.sendingPausedUntil;
  }

  private setPause(minutes: number) {
    const until = new Date(Date.now() + minutes * 60 * 1000);
    this.sendingPausedUntil = until;
    this.logger.warn(
      `Envio de e-mails pausado até ${until.toISOString()} devido a limite do provedor.`,
    );
  }

  @Cron('*/5 8-17 * * *', {
    timeZone: 'America/Sao_Paulo',
  })
  async handleCron() {
    this.logger.log(
      'Verificando agendamentos para envio de confirmação de presença...',
    );

    if (this.shouldPauseSending()) {
      this.logger.warn(
        'Envio de e-mails pausado por limite do provedor. Ignorando execução atual.',
      );
      return;
    }

    const initialNow = new Date();
    const currentHour = initialNow.getHours();
    const currentMinutes = initialNow.getMinutes();

    // Formato YYYY-MM-DD para comparar com o array 'dates' do banco
    const todayStr = initialNow.toISOString().split('T')[0];

    this.logger.log(
      `Hora atual: ${currentHour}:${currentMinutes.toString().padStart(2, '0')} - Verificando agendamentos para hoje (${todayStr})`,
    );

    // Obter URL do front para o QR Code (definir no .env ou usar valor padrão)
    const configuredFrontendUrl = this.configService.get<string>('FRONTEND_URL');
    const frontendUrl =
      configuredFrontendUrl || 'http://agendamento.segetmarica.cloud';

    if (!configuredFrontendUrl) {
      this.logger.warn(
        'FRONTEND_URL não configurada. Usando valor padrão http://agendamento.segetmarica.cloud',
      );
    }

    // 2. Busca Otimizada:
    // Pega apenas agendamentos APROVADOS e que CONTENHAM a data de hoje na string.
    // Como é um simple-array, ele é salvo como texto "2024-01-01,2024-01-02", então o Like funciona.
    const bookingsHoje = await this.bookingRepository.find({
      where: {
        status: 'approved',
        dates: Like(`%${todayStr}%`),
      },
      relations: ['external_participants'], // Precisamos carregar os participantes
    });

    if (bookingsHoje.length === 0) {
      return;
    }

    const validBookings = bookingsHoje.filter(
      (booking) => Array.isArray(booking.dates) && booking.dates.includes(todayStr),
    );

    if (validBookings.length === 0) {
      this.logger.log('Nenhum agendamento válido para envio encontrado após filtragem.');
      return;
    }

    this.logger.log(
      `Encontrados ${validBookings.length} agendamentos para hoje (${todayStr}). Analisando horários...`,
    );

    let sentCounter = 0;
    let skippedCounter = 0;

    for (const booking of validBookings) {
      if (this.shouldPauseSending()) {
        this.logger.warn(
          'Envio de e-mails pausado por limite do provedor. Interrompendo processamento desta execução.',
        );
        break;
      }
      try {
        const now = new Date();

        const rawConfirmationSent = (booking.confirmation_emails_sent ?? null) as
          | string[]
          | null;

        const confirmationSentDates = Array.isArray(rawConfirmationSent)
          ? rawConfirmationSent.filter(Boolean)
          : rawConfirmationSent
            ? String(rawConfirmationSent)
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
            : [];

        booking.confirmation_emails_sent = confirmationSentDates;

        const alreadySentForToday = confirmationSentDates.includes(todayStr);

        // Se já enviamos email para a data de hoje neste agendamento, pula
        if (alreadySentForToday) {
          skippedCounter++;
          continue;
        }

        // 3. Descobrir o índice da data de hoje para pegar a hora correta
        const dateIndex = booking.dates.indexOf(todayStr);
        if (dateIndex === -1) continue; // Segurança

        const horaInicioList = Array.isArray(booking.hora_inicio)
          ? booking.hora_inicio
          : [booking.hora_inicio].filter(Boolean);
        const horaFimList = Array.isArray(booking.hora_fim)
          ? booking.hora_fim
          : [booking.hora_fim].filter(Boolean);

        // Pega o horário de início correspondente ao dia de hoje
        // Se o array de horas for menor que o de dias, usa o primeiro (lógica comum de repetição)
        const horaInicioStr = horaInicioList[dateIndex] || horaInicioList[0];
        const horaFimStr = horaFimList[dateIndex] || horaFimList[0];

        // Converter horaInicioStr ("08:00") para objeto Date hoje
        const [h, m] = horaInicioStr.split(':').map(Number);
        const dataInicioEvento = new Date();
        dataInicioEvento.setHours(h, m, 0, 0);

        // Converter horaFimStr ("09:00") para objeto Date hoje
        const [hFim, mFim] = horaFimStr.split(':').map(Number);
        const dataFimEvento = new Date();
        dataFimEvento.setHours(hFim, mFim, 0, 0);

        // 4. Regra de Negócio: Enviar se o evento JÁ COMEÇOU e ainda está dentro da janela de envio (máx. 60 minutos)
        const agoraTimestamp = now.getTime();
        const inicioTimestamp = dataInicioEvento.getTime();
        const fimTimestamp = dataFimEvento.getTime();
        const limiteEnvioTimestamp = Math.min(
          fimTimestamp,
          inicioTimestamp + 60 * 60 * 1000,
        );

        // Verifica se estamos dentro da janela do agendamento e da margem de 60 minutos
        if (agoraTimestamp >= inicioTimestamp && agoraTimestamp <= limiteEnvioTimestamp) {
          this.logger.log(
            `Enviando emails para agendamento ${booking.id} - Sala ${booking.room_name} (${horaInicioStr}-${horaFimStr})`,
          );

          let anySent = false;
          let anyFailed = false;
          let stopSending = false;

          const deliverEmail = async (
            recipientEmail: string | null | undefined,
            recipientName: string | null,
            isRequester: boolean,
          ) => {
            if (!recipientEmail) {
              this.logger.warn(
                `Email não enviado para o agendamento ${booking.id} por ausência de destinatário válido.`,
              );
              return { sent: false, skipped: true };
            }

            try {
              await this.mailService.sendAttendanceConfirmationWithPDF(
                booking,
                recipientEmail,
                recipientName,
                frontendUrl,
                isRequester,
                todayStr,
              );
              anySent = true;
              return { sent: true };
            } catch (error) {
              this.logger.error(
                `Falha ao enviar email de confirmação (${recipientEmail}) para o agendamento ${booking.id}: ${error.message}`,
                error.stack,
              );
              anyFailed = true;
              if (this.isDailyLimitError(error)) {
                this.setPause(60);
                stopSending = true;
              }
              return { sent: false, error };
            } finally {
              await this.delay(this.emailSendDelayMs);
            }
          };

          // A. Enviar para o Solicitante
          await deliverEmail(booking.email, booking.nome_completo, true);

          if (stopSending) {
            skippedCounter++;
            continue;
          }

          // B. Enviar para Participantes Internos (SEGET)
          const participantesInternos = Array.isArray(booking.participantes)
            ? booking.participantes.filter(Boolean)
            : [];

          for (const emailPart of participantesInternos) {
            await deliverEmail(emailPart, null, false);
            if (stopSending) break;
          }

          if (stopSending) {
            skippedCounter++;
            continue;
          }

          // C. Enviar para Participantes Externos
          if (
            booking.external_participants &&
            booking.external_participants.length > 0
          ) {
            for (const extPart of booking.external_participants) {
              await deliverEmail(extPart.email, extPart.full_name, false);
              if (stopSending) break;
            }
          }

          if (anySent) {
            // 5. Atualizar o banco para não enviar de novo HOJE
            booking.confirmation_emails_sent.push(todayStr);
            await this.bookingRepository.save(booking);

            this.logger.log(
              `Emails enviados e registro atualizado para o agendamento ${booking.id}`,
            );
            sentCounter++;
          } else if (anyFailed) {
            this.logger.warn(
              `Nenhum email enviado para o agendamento ${booking.id}. Será tentado novamente mais tarde.`,
            );
            skippedCounter++;
          }
        } else {
          skippedCounter++;
        }
      } catch (error) {
        this.logger.error(
          `Erro ao processar agendamento ${booking.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    this.logger.log(
      `Processamento concluído: ${sentCounter} agendamentos com email enviado, ${skippedCounter} agendamentos ignorados nesta execução.`,
    );
  }

  // Cron job para marcar registros pendentes como "Não Confirmado" após o prazo
  // Executa a cada 15 minutos
  @Cron('*/15 * * * *', {
    timeZone: 'America/Sao_Paulo',
  })
  async markUnconfirmedAttendance() {
    this.logger.log('Verificando registros de presença pendentes após o prazo...');

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      // Busca todos os agendamentos aprovados com datas passadas ou de hoje
      const bookings = await this.bookingRepository.find({
        where: {
          status: 'approved',
        },
        relations: ['attendance_records'],
      });

      let updatedCount = 0;

      for (const booking of bookings) {
        const dates = booking.dates || [];

        for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
          const dateStr = dates[dateIndex];
          const [year, month, day] = dateStr.split('-').map(Number);

          // Pega o horário de fim para esta data
          const horaFimStr = Array.isArray(booking.hora_fim)
            ? booking.hora_fim[dateIndex] || booking.hora_fim[booking.hora_fim.length - 1]
            : booking.hora_fim;

          if (!horaFimStr) continue;

          const [endHour, endMinute] = horaFimStr.split(':').map(Number);
          const bookingEnd = new Date(year, month - 1, day, endHour, endMinute);

          // Adiciona 1 hora ao horário de fim (mesmo prazo da confirmação)
          const deadline = new Date(bookingEnd.getTime() + 60 * 60 * 1000);

          // Se o prazo já passou, marca registros pendentes como "Não Confirmado"
          if (now > deadline) {
            // Busca registros pendentes para esta data e agendamento
            const pendingRecords = await this.attendanceRepository.find({
              where: {
                booking_id: booking.id,
                attendance_date: dateStr,
                status: 'Pendente',
              },
            });

            // Atualiza cada registro pendente para "Não Confirmado"
            for (const record of pendingRecords) {
              record.status = 'Não Confirmado';
              await this.attendanceRepository.save(record);
              updatedCount++;
            }
          }
        }
      }

      if (updatedCount > 0) {
        this.logger.log(`Marcados ${updatedCount} registros como "Não Confirmado"`);
      }
    } catch (error) {
      this.logger.error(
        `Erro ao marcar registros não confirmados: ${error.message}`,
        error.stack,
      );
    }
  }
}
