import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) { }

  @Cron('0 8-17 * * *', {
    timeZone: 'America/Sao_Paulo',
  })
  async handleCron() {
    this.logger.log(
      'Verificando agendamentos para envio de confirmação de presença...',
    );

    // 1. Definições de Data e Hora Atuais
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    // Formato YYYY-MM-DD para comparar com o array 'dates' do banco
    const todayStr = now.toISOString().split('T')[0];

    this.logger.log(
      `Hora atual: ${currentHour}:${currentMinutes.toString().padStart(2, '0')} - Verificando agendamentos para hoje (${todayStr})`,
    );

    // Obter URL do front para o QR Code (definir no .env ou usar valor padrão)
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://agendamento.segetmarica.cloud';

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

    this.logger.log(
      `Encontrados ${bookingsHoje.length} agendamentos para hoje (${todayStr}). Analisando horários...`,
    );

    for (const booking of bookingsHoje) {
      try {
        // Inicializa o array de controle se estiver nulo
        if (!booking.confirmation_emails_sent) {
          booking.confirmation_emails_sent = [];
        }

        // Se já enviamos email para a data de hoje neste agendamento, pula
        if (booking.confirmation_emails_sent.includes(todayStr)) {
          continue;
        }

        // 3. Descobrir o índice da data de hoje para pegar a hora correta
        const dateIndex = booking.dates.indexOf(todayStr);
        if (dateIndex === -1) continue; // Segurança

        // Pega o horário de início correspondente ao dia de hoje
        // Se o array de horas for menor que o de dias, usa o primeiro (lógica comum de repetição)
        const horaInicioStr =
          booking.hora_inicio[dateIndex] || booking.hora_inicio[0];
        const horaFimStr =
          booking.hora_fim[dateIndex] || booking.hora_fim[0];

        // Converter horaInicioStr ("08:00") para objeto Date hoje
        const [h, m] = horaInicioStr.split(':').map(Number);
        const dataInicioEvento = new Date();
        dataInicioEvento.setHours(h, m, 0, 0);

        // Converter horaFimStr ("09:00") para objeto Date hoje
        const [hFim, mFim] = horaFimStr.split(':').map(Number);
        const dataFimEvento = new Date();
        dataFimEvento.setHours(hFim, mFim, 0, 0);

        // 4. Regra de Negócio: Enviar se o evento JÁ COMEÇOU e AINDA NÃO TERMINOU
        // Exemplo: Evento 8:00-9:00, agora são 8:30 -> Envia
        // Exemplo: Evento 8:00-9:00, agora são 9:05 -> NÃO envia (já terminou)
        // Exemplo: Evento 8:00-9:00, agora são 7:50 -> NÃO envia (ainda não começou)
        const agoraTimestamp = now.getTime();
        const inicioTimestamp = dataInicioEvento.getTime();
        const fimTimestamp = dataFimEvento.getTime();

        // Verifica se estamos DENTRO do período do agendamento
        if (agoraTimestamp >= inicioTimestamp && agoraTimestamp <= fimTimestamp) {
          this.logger.log(
            `Enviando emails para agendamento ${booking.id} - Sala ${booking.room_name} (${horaInicioStr}-${horaFimStr})`,
          );

          // A. Enviar para o Solicitante
          await this.mailService.sendAttendanceConfirmationWithPDF(
            booking,
            booking.email,
            booking.nome_completo,
            frontendUrl,
            true, // isRequester
            todayStr, // specificDate
          );

          // B. Enviar para Participantes Internos (SEGET)
          // Assumindo que booking.participantes é array de emails
          if (booking.participantes && booking.participantes.length > 0) {
            for (const emailPart of booking.participantes) {
              await this.mailService.sendAttendanceConfirmationWithPDF(
                booking,
                emailPart,
                null, // Nome será extraído do email no service
                frontendUrl,
                false,
                todayStr,
              );
            }
          }

          // C. Enviar para Participantes Externos
          if (
            booking.external_participants &&
            booking.external_participants.length > 0
          ) {
            for (const extPart of booking.external_participants) {
              await this.mailService.sendAttendanceConfirmationWithPDF(
                booking,
                extPart.email,
                extPart.full_name,
                frontendUrl,
                false,
                todayStr,
              );
            }
          }

          // 5. Atualizar o banco para não enviar de novo HOJE
          booking.confirmation_emails_sent.push(todayStr);
          await this.bookingRepository.save(booking);

          this.logger.log(
            `Emails enviados e registro atualizado para o agendamento ${booking.id}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Erro ao processar agendamento ${booking.id}: ${error.message}`,
          error.stack,
        );
      }
    }
  }
}
