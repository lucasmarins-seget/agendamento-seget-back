import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { AttendanceRecord } from 'src/entities/attendance-record.entity';
import { Booking } from 'src/entities/booking.entity';

// Helper para converter identificador da sala em nome legível
const ROOM_LABELS: Record<string, string> = {
  sala_delta: 'Sala Delta',
  receitorio: 'Receitório',
  escola_fazendaria: 'Escola Fazendária',
};

// Cores por status
const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  pending: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  em_analise: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  approved: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  rejected: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  canceled: { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
};

// Labels de status
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  em_analise: 'Em Análise',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  canceled: 'Cancelado',
};

// Cores por sala
const ROOM_COLORS: Record<string, string> = {
  sala_delta: '#8b5cf6', // Roxo
  receitorio: '#f59e0b', // Amarelo/Laranja
  escola_fazendaria: '#10b981', // Verde
};

function getRoomLabel(roomId: string): string {
  return ROOM_LABELS[roomId] || roomId;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatPhone(phone: string): string {
  // Formata telefone: (21) 99999-9999
  if (phone.length === 11) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  } else if (phone.length === 10) {
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) { }

  private buildRecipientFields(recipients: string[] | string): {
    to: string;
    cc?: string[];
  } {
    const list = Array.isArray(recipients) ? recipients : [recipients];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const raw of list) {
      if (!raw) continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(trimmed);
    }

    if (normalized.length === 0) {
      throw new Error('No email recipients provided.');
    }

    const [to, ...cc] = normalized;
    return cc.length > 0 ? { to, cc } : { to };
  }

  private buildApprovalEmailForParticipants(booking: Booking): {
    subject: string;
    html: string;
  } {
    const statusColor = STATUS_COLORS.approved;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    // Define o local baseado na sala
    let location: string;
    if (booking.room_name === 'escola_fazendaria') {
      location = booking.local || 'Escola Fazendária - SEGET';
    } else {
      location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
    }

    const googleCalendarLink = this.generateGoogleCalendarLink(booking);
    const formattedDates = booking.dates.map(formatDate).join(', ');

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Notificação de Evento 📋
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Você é participante de um evento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong>. Leia abaixo informações referentes ao agendamento.
        </p>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📋 Informações do Evento
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 12px; overflow: hidden; border: 1px solid #d1fae5;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🏢 Sala</span><br>
              <span style="color: ${roomColor}; font-size: 15px; font-weight: 600;">${getRoomLabel(booking.room_name)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📍 Local</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${location}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📅 Data(s)</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${formattedDates}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🕐 Horário</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.hora_inicio} às ${booking.hora_fim}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #065f46; font-size: 13px;">👤 Solicitante</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.nome_completo}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Botão Google Calendar -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${googleCalendarLink}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #4285f4; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(66, 133, 244, 0.3);">
          📅 Adicionar ao Google Agenda
        </a>
        <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">
          Clique para salvar este evento no seu Google Agenda
        </p>
      </div>

      <div style="margin-top: 24px; padding: 20px; background-color: #dbeafe; border-radius: 12px; border: 1px solid #93c5fd;">
        <p style="margin: 0; color: #1e40af; font-size: 14px; text-align: center;">
          📱 No dia e horário do evento, você receberá um link com QR Code para confirmar sua presença na reunião.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Notificação de Evento',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    return {
      subject: `📋 Notificação de Evento: ${booking.finalidade} - ${getRoomLabel(booking.room_name)}`,
      html,
    };
  }

  private buildExternalParticipantEmail(
    booking: Booking,
    participantName?: string | null,
  ): {
    subject: string;
    html: string;
  } {
    const statusColor = STATUS_COLORS.approved;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    // Define o local baseado na sala
    let location: string;
    if (booking.room_name === 'escola_fazendaria') {
      location = booking.local || 'Escola Fazendária - SEGET';
    } else {
      location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
    }

    const googleCalendarLink = this.generateGoogleCalendarLink(booking);
    const formattedDates = booking.dates.map(formatDate).join(', ');

    const greeting = participantName
      ? `Olá, ${participantName}! 👋`
      : 'Olá! 👋';

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          ${greeting}
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Você é participante de um evento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong>. Leia abaixo informações referentes ao agendamento.
        </p>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📋 Informações do Evento
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 12px; overflow: hidden; border: 1px solid #d1fae5;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🏢 Sala</span><br>
              <span style="color: ${roomColor}; font-size: 15px; font-weight: 600;">${getRoomLabel(booking.room_name)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📍 Local</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${location}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📅 Data(s)</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${formattedDates}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🕐 Horário</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.hora_inicio} às ${booking.hora_fim}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #065f46; font-size: 13px;">👤 Solicitante</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.nome_completo}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Botão Google Calendar -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${googleCalendarLink}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #4285f4; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(66, 133, 244, 0.3);">
          📅 Adicionar ao Google Agenda
        </a>
        <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">
          Clique para salvar este evento no seu Google Agenda
        </p>
      </div>

      <div style="margin-top: 24px; padding: 20px; background-color: #dbeafe; border-radius: 12px; border: 1px solid #93c5fd;">
        <p style="margin: 0; color: #1e40af; font-size: 14px; text-align: center;">
          📱 No dia e horário do evento, você receberá um link com QR Code para confirmar sua presença na reunião.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Notificação de Evento',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    return {
      subject: `📋 Notificação de Evento: ${booking.finalidade} - ${getRoomLabel(booking.room_name)}`,
      html,
    };
  }

  // Gera o template base do e-mail estilizado
  private generateEmailTemplate(
    title: string,
    content: string,
    statusColor: { bg: string; text: string; border: string },
    roomColor: string,
    roomName?: string,
  ): string {
    // Cor padrão da Prefeitura de Maricá para o header
    const headerColor = '#bd202e';

    const segetLogoUrl = 'https://i.imgur.com/rPY6ZWg.png';

    // Mapeamento das logos por sala
    const roomLogos: Record<string, string> = {
      sala_delta: 'https://i.imgur.com/O2Nsd6L.png',
      receitorio: 'https://i.imgur.com/BZ00Kfo.png',
      escola_fazendaria: 'https://i.imgur.com/BSUewFf.png',
    };

    // Define a URL da logo da sala (se houver nome de sala e mapeamento)
    const roomLogoUrl = roomName && roomLogos[roomName] ? roomLogos[roomName] : null;
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${headerColor} 0%, ${headerColor}dd 100%); padding: 32px; text-align: center;">
              <table role="presentation" align="center" style="background-color: rgba(255, 255, 255, 0.95); border-radius: 16px; padding: 12px 24px; margin: 0 auto 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <tr>
                  <td style="padding: 0 12px;">
                    <img src="${segetLogoUrl}" alt="SEGET Logo" height="50" style="display: block; height: 50px; width: auto; border: 0;" />
                  </td>
                  ${roomLogoUrl
        ? `
                  <td style="padding: 0 12px; border-left: 1px solid #e5e7eb;">
                    <img src="${roomLogoUrl}" alt="Logo da Sala" height="50" style="display: block; height: 50px; width: auto; border: 0;" />
                  </td>`
        : ''
      }
                </tr>
              </table>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                Sistema de Agendamentos SEGET
              </h1>
            </td>
          </tr>
          
          <!-- Status Badge -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; padding: 8px 24px; background-color: ${statusColor.bg}; color: ${statusColor.text}; border: 2px solid ${statusColor.border}; border-radius: 50px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${title}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 24px 32px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">
                      Este é um e-mail automático, por favor não responda.
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      © ${new Date().getFullYear()} SEGET - Secretaria de Gestão
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  // Gera seção de informações do booking
  private generateBookingInfoSection(
    booking: Booking,
    isAdmin: boolean = false,
  ): string {
    const formattedDates = booking.dates.map(formatDate).join(', ');
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    // Seção do solicitante
    let content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600; display: flex; align-items: center;">
          👤 Dados do Solicitante
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Nome Completo</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.nome_completo}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Setor</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.setor_solicitante}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Responsável</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.responsavel}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Telefone</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${formatPhone(booking.telefone)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #6b7280; font-size: 13px;">E-mail</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.email}</span>
            </td>
          </tr>
        </table>
      </div>
    `;

    // Seção da reserva
    content += `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📅 Dados da Reserva
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Sala</span><br>
              <span style="color: ${roomColor}; font-size: 15px; font-weight: 600;">${getRoomLabel(booking.room_name)}</span>
            </td>
          </tr>
          ${booking.tipo_reserva
        ? `
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Tipo de Reserva</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.tipo_reserva === 'sala' ? 'Sala' : 'Computador'}</span>
            </td>
          </tr>
          `
        : ''
      }
          ${booking.local
        ? `
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Local do Evento</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.local}</span>
            </td>
          </tr>
          `
        : ''
      }
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Data(s)</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${formattedDates}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #6b7280; font-size: 13px;">Horário(s)</span><br>
              ${booking.hora_inicio.length === 1
        ? `<span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.hora_inicio[0]} às ${booking.hora_fim[0]}</span>`
        : booking.hora_inicio
          .map(
            (inicio, i) =>
              `<span style="display: block; color: #111827; font-size: 15px; font-weight: 500; margin: 2px 0;">📅 ${formatDate(booking.dates[i])}: ${inicio} às ${booking.hora_fim[i]}</span>`,
          )
          .join('')
      }
            </td>
          </tr>
        </table>
      </div>
    `;

    // Seção do evento
    content += `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📝 Detalhes do Evento
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Finalidade</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.finalidade}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #6b7280; font-size: 13px;">Descrição</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.descricao}</span>
            </td>
          </tr>
          ${booking.observacao
        ? `
          <tr>
            <td style="padding: 12px 16px; border-top: 1px solid #e5e7eb;">
              <span style="color: #6b7280; font-size: 13px;">Observações</span><br>
              <span style="color: #111827; font-size: 15px; font-weight: 500;">${booking.observacao}</span>
            </td>
          </tr>
          `
        : ''
      }
        </table>
      </div>
    `;

    // Seção de equipamentos
    const equipamentos: string[] = [];
    if (booking.projetor === 'sim') equipamentos.push('Projetor');
    if (booking.som_projetor === 'sim') equipamentos.push('Som do Projetor');
    if (booking.internet === 'sim') equipamentos.push('Internet');
    if (booking.wifi_todos === 'sim') equipamentos.push('Wi-Fi para Todos');
    if (booking.conexao_cabo === 'sim') equipamentos.push('Conexão a Cabo');

    if (equipamentos.length > 0) {
      content += `
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            🔌 Equipamentos Solicitados
          </h2>
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 16px;">
            ${equipamentos
          .map(
            (eq) => `
              <span style="display: inline-block; margin: 4px; padding: 6px 12px; background-color: #e5e7eb; border-radius: 20px; font-size: 13px; color: #374151;">
                ✓ ${eq}
              </span>
            `,
          )
          .join('')}
          </div>
        </div>
      `;
    }

    // Seção específica (para Escola Fazendária e Receitório)
    const especificos: string[] = [];
    if (booking.software_especifico === 'sim' && booking.qual_software) {
      especificos.push(`Software Específico: ${booking.qual_software}`);
    }
    if (booking.papelaria) {
      especificos.push(`Papelaria: ${booking.papelaria}`);
    }
    if (booking.material_externo) {
      especificos.push(`Material Externo: ${booking.material_externo}`);
    }
    if (booking.apoio_equipe === 'sim') {
      especificos.push('Apoio da Equipe');
    }

    if (especificos.length > 0) {
      content += `
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            📋 Recursos Adicionais
          </h2>
          <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 12px; overflow: hidden;">
            ${especificos
          .map(
            (item, index) => `
              <tr>
                <td style="padding: 12px 16px; ${index < especificos.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : ''}">
                  <span style="color: #111827; font-size: 15px; font-weight: 500;">• ${item}</span>
                </td>
              </tr>
            `,
          )
          .join('')}
          </table>
        </div>
      `;
    }

    // Lista de participantes (apenas se for admin)
    if (isAdmin && booking.participantes && booking.participantes.length > 0) {
      content += `
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
            👥 Participantes (${booking.participantes.length})
          </h2>
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 16px;">
            ${booking.participantes
          .map(
            (p) => `
              <div style="margin: 4px 0; padding: 8px 12px; background-color: #ffffff; border-radius: 8px; font-size: 14px; color: #374151; border: 1px solid #e5e7eb;">
                📧 ${p}
              </div>
            `,
          )
          .join('')}
          </div>
        </div>
      `;
    }

    return content;
  }

  // E-mail de confirmação de agendamento criado (para o solicitante)
  async sendNewBookingToRequester(booking: Booking) {
    const statusColor = STATUS_COLORS.pending;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    const greeting = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Olá, ${booking.nome_completo}! 👋
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Sua solicitação de agendamento foi recebida e está <strong style="color: ${statusColor.text};">pendente de análise</strong>.
          Você receberá uma notificação assim que houver uma atualização.
        </p>
      </div>
    `;

    const bookingInfo = this.generateBookingInfoSection(booking, false);

    const content = greeting + bookingInfo;

    const html = this.generateEmailTemplate(
      'Solicitação Recebida',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: booking.email,
      subject: `📋 Solicitação de Agendamento Recebida - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // E-mail de notificação para o admin da sala
  async sendNewBookingToRoomAdmin(booking: Booking, adminEmail: string) {
    const statusColor = STATUS_COLORS.pending;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    const greeting = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Nova Solicitação de Agendamento 🔔
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Uma nova solicitação de agendamento foi recebida para a <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong>.
          Por favor, analise os detalhes abaixo e aprove ou rejeite a solicitação.
        </p>
      </div>
    `;

    const bookingInfo = this.generateBookingInfoSection(booking, true);

    const actionSection = `
      <div style="text-align: center; margin-top: 24px; padding: 20px; background-color: #fef3c7; border-radius: 12px; border: 1px solid #f59e0b;">
        <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 500;">
          ⚠️ Esta solicitação aguarda sua análise
        </p>
        <p style="margin: 0; color: #92400e; font-size: 13px;">
          Acesse o painel administrativo para aprovar ou rejeitar este agendamento.
        </p>
      </div>
    `;

    const content = greeting + bookingInfo + actionSection;

    const html = this.generateEmailTemplate(
      'Nova Solicitação Pendente',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: adminEmail,
      subject: `🔔 Nova Solicitação Pendente - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  async sendBookingConfirmation(booking: Booking) {
    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Solicitação de Agendamento Recebida',
      html: `Olá ${booking.nome_completo}, <br><br>Sua solicitação para a sala ${getRoomLabel(booking.room_name)} foi recebida e está <b>pendente</b>.`,
    });
  }

  // Helper para gerar link do Google Calendar
  private generateGoogleCalendarLink(booking: Booking): string {
    // Define o local baseado na sala
    let location: string;
    if (booking.room_name === 'escola_fazendaria') {
      location = booking.local || 'Escola Fazendária - SEGET';
    } else {
      location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
    }

    // Formato das datas para Google Calendar (YYYYMMDDTHHmmss)
    const firstDate = booking.dates[0];
    const [year, month, day] = firstDate.split('-');
    const horaInicioStr = Array.isArray(booking.hora_inicio)
      ? booking.hora_inicio[0]
      : booking.hora_inicio;
    const horaFimStr = Array.isArray(booking.hora_fim)
      ? booking.hora_fim[0]
      : booking.hora_fim;
    const [startHour, startMin] = horaInicioStr.split(':');
    const [endHour, endMin] = horaFimStr.split(':');

    // Converte para formato Google Calendar
    const startDateTime = `${year}${month}${day}T${startHour}${startMin}00`;
    const endDateTime = `${year}${month}${day}T${endHour}${endMin}00`;

    // Descrição do evento
    const description = `Evento: ${booking.finalidade}\\n\\nSolicitante: ${booking.nome_completo}\\nSetor: ${booking.setor_solicitante}\\n\\nDescrição: ${booking.descricao}\\n\\n📍 Local: ${location}`;

    // Título do evento
    const title = `${booking.finalidade} - ${getRoomLabel(booking.room_name)}`;

    // Monta URL do Google Calendar
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${startDateTime}/${endDateTime}`,
      details: description,
      location: location,
      ctz: 'America/Sao_Paulo',
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  // E-mail de aprovação para o SOLICITANTE
  async sendApprovalEmailToRequester(booking: Booking) {
    const statusColor = STATUS_COLORS.approved;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    // Define o local baseado na sala
    let location: string;
    if (booking.room_name === 'escola_fazendaria') {
      location = booking.local || 'Escola Fazendária - SEGET';
    } else {
      location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
    }

    const googleCalendarLink = this.generateGoogleCalendarLink(booking);
    const formattedDates = booking.dates.map(formatDate).join(', ');

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Parabéns, ${booking.nome_completo}! 🎉
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Sua solicitação de agendamento foi <strong style="color: ${statusColor.text};">APROVADA</strong>!
        </p>
      </div>

      ${booking.observacao_admin
        ? `
      <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 12px; border-left: 4px solid #10b981;">
        <p style="margin: 0 0 8px; color: #065f46; font-size: 13px; font-weight: 600;">💬 Mensagem da Administração:</p>
        <p style="margin: 0; color: #065f46; font-size: 14px;">${booking.observacao_admin}</p>
      </div>
      `
        : ''
      }

      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📅 Detalhes do Agendamento
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 12px; overflow: hidden; border: 1px solid #d1fae5;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">Sala</span><br>
              <span style="color: ${roomColor}; font-size: 15px; font-weight: 600;">${getRoomLabel(booking.room_name)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📍 Local</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${location}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">Data(s)</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${formattedDates}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">Horário</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.hora_inicio} às ${booking.hora_fim}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #065f46; font-size: 13px;">Finalidade</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.finalidade}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Botão Google Calendar -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${googleCalendarLink}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #4285f4; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(66, 133, 244, 0.3);">
          📅 Adicionar ao Google Agenda
        </a>
        <p style="margin: 12px 0 0; color: #6b7280; font-size: 13px;">
          Clique para salvar este evento no seu Google Agenda
        </p>
      </div>

      <div style="margin-top: 24px; padding: 20px; background-color: #dbeafe; border-radius: 12px; border: 1px solid #93c5fd;">
        <p style="margin: 0; color: #1e40af; font-size: 14px; text-align: center;">
          📱 No dia e horário do evento, você receberá um link com QR Code para confirmar sua presença na reunião.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Agendamento Aprovado',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: booking.email,
      subject: `✅ Agendamento Aprovado - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // E-mail de aprovação para os PARTICIPANTES
  async sendApprovalEmailToParticipant(
    booking: Booking,
    participantEmail: string,
    frontendUrl: string,
  ) {
    const { subject, html } = this.buildApprovalEmailForParticipants(booking);

    await this.mailerService.sendMail({
      to: participantEmail,
      subject,
      html,
    });
  }

  async sendApprovalEmailToParticipants(
    booking: Booking,
    participantEmails: string[],
    frontendUrl: string,
  ) {
    if (!participantEmails || participantEmails.length === 0) {
      return;
    }

    const { subject, html } = this.buildApprovalEmailForParticipants(booking);
    const recipients = this.buildRecipientFields(participantEmails);

    await this.mailerService.sendMail({
      ...recipients,
      subject,
      html,
    });
  }

  // E-mail de REJEIÇÃO estilizado para o solicitante
  async sendRejectionEmailStyled(booking: Booking) {
    const statusColor = STATUS_COLORS.rejected;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';
    const formattedDates = booking.dates.map(formatDate).join(', ');

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Olá, ${booking.nome_completo} 😔
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Infelizmente, sua solicitação de agendamento foi <strong style="color: ${statusColor.text};">REJEITADA</strong>.
        </p>
      </div>

      ${booking.rejection_reason
        ? `
      <div style="margin-bottom: 24px; padding: 16px; background-color: #fee2e2; border-radius: 12px; border-left: 4px solid #ef4444;">
        <p style="margin: 0 0 8px; color: #991b1b; font-size: 13px; font-weight: 600;">📝 Motivo da Rejeição:</p>
        <p style="margin: 0; color: #991b1b; font-size: 14px;">${booking.rejection_reason}</p>
      </div>
      `
        : ''
      }

      ${this.generateBookingInfoSection(booking, false)}

      <div style="margin-top: 24px; padding: 16px; background-color: #f3f4f6; border-radius: 12px;">
        <p style="margin: 0; color: #4b5563; font-size: 14px; text-align: center;">
          Caso tenha dúvidas, entre em contato com a administração.
          <br>Você pode fazer uma nova solicitação a qualquer momento.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Agendamento Rejeitado',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: booking.email,
      subject: `❌ Agendamento Rejeitado - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // E-mail de CANCELAMENTO estilizado para o solicitante
  async sendCancellationEmailStyled(booking: Booking) {
    const statusColor = STATUS_COLORS.canceled;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Olá, ${booking.nome_completo}.
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          O seu agendamento foi <strong style="color: ${statusColor.text};">CANCELADO</strong> pela administração.
        </p>
      </div>

      ${booking.cancellation_reason
        ? `
      <div style="margin-bottom: 24px; padding: 16px; background-color: #f3f4f6; border-radius: 12px; border-left: 4px solid #9ca3af;">
        <p style="margin: 0 0 8px; color: #374151; font-size: 13px; font-weight: 600;">📝 Motivo do Cancelamento:</p>
        <p style="margin: 0; color: #374151; font-size: 14px;">${booking.cancellation_reason}</p>
      </div>
      `
        : ''
      }

      ${this.generateBookingInfoSection(booking, false)}

      <div style="margin-top: 24px; padding: 16px; background-color: #f3f4f6; border-radius: 12px;">
        <p style="margin: 0; color: #4b5563; font-size: 14px; text-align: center;">
          Caso tenha dúvidas sobre este cancelamento, entre em contato com a administração.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Agendamento Cancelado',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: booking.email,
      subject: `⚠️ Agendamento Cancelado - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // E-mail de EM ANÁLISE estilizado para o solicitante
  async sendUnderAnalysisEmailStyled(booking: Booking) {
    const statusColor = STATUS_COLORS.em_analise;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Olá, ${booking.nome_completo}! 👋
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Seu agendamento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong> teve uma atualização de status para <strong style="color: ${statusColor.text};">EM ANÁLISE</strong>.
        </p>
        <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">
          Assim que houver uma nova mudança de status, você receberá um e-mail informando.
        </p>
      </div>

      ${booking.observacao_admin
        ? `
      <div style="margin-bottom: 24px; padding: 16px; background-color: #dbeafe; border-radius: 12px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0 0 8px; color: #1e40af; font-size: 13px; font-weight: 600;">💬 Observação da Administração:</p>
        <p style="margin: 0; color: #1e40af; font-size: 14px;">${booking.observacao_admin}</p>
      </div>
      `
        : ''
      }

      ${this.generateBookingInfoSection(booking, false)}

      <div style="margin-top: 24px; padding: 16px; background-color: #dbeafe; border-radius: 12px; border: 1px solid #93c5fd;">
        <p style="margin: 0; color: #1e40af; font-size: 14px; text-align: center;">
          ⏳ Aguarde enquanto nossa equipe analisa sua solicitação.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Em Análise',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: booking.email,
      subject: `🔍 Agendamento Em Análise - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // E-mail de PENDENTE estilizado (quando volta para pendente)
  async sendPendingEmailStyled(booking: Booking) {
    const statusColor = STATUS_COLORS.pending;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          Olá, ${booking.nome_completo}! 👋
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          Seu agendamento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong> teve uma atualização de status para <strong style="color: ${statusColor.text};">PENDENTE</strong>.
        </p>
        <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">
          Assim que houver uma nova mudança de status, você receberá um e-mail informando.
        </p>
      </div>

      ${booking.observacao_admin
        ? `
      <div style="margin-bottom: 24px; padding: 16px; background-color: #fef3c7; border-radius: 12px; border-left: 4px solid #f59e0b;">
        <p style="margin: 0 0 8px; color: #92400e; font-size: 13px; font-weight: 600;">💬 Observação da Administração:</p>
        <p style="margin: 0; color: #92400e; font-size: 14px;">${booking.observacao_admin}</p>
      </div>
      `
        : ''
      }

      ${this.generateBookingInfoSection(booking, false)}

      <div style="margin-top: 24px; padding: 16px; background-color: #fef3c7; border-radius: 12px; border: 1px solid #fcd34d;">
        <p style="margin: 0; color: #92400e; font-size: 14px; text-align: center;">
          ⏳ Sua solicitação está aguardando análise da administração.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Pendente',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: booking.email,
      subject: `⏳ Agendamento Pendente - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // Métodos antigos mantidos para compatibilidade (podem ser removidos depois)
  async sendApprovalEmail(booking: Booking) {
    // Formata as datas para exibição
    const formattedDates = booking.dates
      .map((date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR'))
      .join(', ');

    // Monta seção do local se existir (Escola Fazendária)
    const localSection = booking.local
      ? `<p><b>📍 Local do Evento:</b> ${booking.local}</p>`
      : '';

    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Agendamento Aprovado ✅',
      html: `
        <h3>Olá ${booking.nome_completo},</h3>
        <p>Sua solicitação de agendamento foi <b style="color: green;">APROVADA</b>!</p>
        
        <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 16px 0;">
          <p><b>🏢 Sala:</b> ${getRoomLabel(booking.room_name)}</p>
          <p><b>📅 Data(s):</b> ${formattedDates}</p>
          <p><b>🕐 Horário:</b> ${booking.hora_inicio} às ${booking.hora_fim}</p>
          <p><b>📝 Finalidade:</b> ${booking.finalidade}</p>
          ${localSection}
        </div>
        
        <p>Os participantes receberão um link para confirmação de presença.</p>
        <p>Qualquer dúvida, entre em contato conosco.</p>
      `,
    });
  }

  async sendRejectionEmail(booking: Booking) {
    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Agendamento Recusado',
      html: `Olá ${booking.nome_completo},<br><br>Sua solicitação para a sala ${getRoomLabel(booking.room_name)} foi <b>recusada</b>.
                    <br>Motivo: ${booking.rejection_reason || 'Não informado'}`,
    });
  }

  async sendAdminNotification(booking: Booking, adminEmail: string) {
    await this.mailerService.sendMail({
      to: adminEmail, // TODO: Buscar e-mail do admin da sala
      subject: `Novo Agendamento Pendente: ${getRoomLabel(booking.room_name)}`,
      html: `Um novo agendamento foi solicitado por ${booking.nome_completo} para a sala ${getRoomLabel(booking.room_name)}.`,
    });
  }

  async sendUpdateEmail(booking: Booking) {
    const formattedDates = booking.dates
      .map((date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR'))
      .join(', ');

    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Seu agendamento foi atualizado',
      html: `Olá ${booking.nome_completo},<br><br>Seu agendamento para a sala ${getRoomLabel(booking.room_name)} nas datas ${formattedDates} foi modificado. Por favor, verifique os novos detalhes.`,
    });
  }

  async sendAttendanceConfirmation(record: AttendanceRecord, booking: Booking) {
    await this.mailerService.sendMail({
      to: record.email,
      subject: `Presença Confirmada: ${booking.finalidade}`,
      html: `Olá ${record.full_name},<br><br>Sua presença como <b>${record.status}</b> foi registrada com sucesso para o evento ${booking.finalidade}.`,
    });
  }

  // E-mail: Status mudou para "Em Análise" (antigo - mantido para compatibilidade)
  async sendUnderAnalysisEmail(booking: Booking, observacao: string) {
    // Formata a data (ou datas) para o e-mail
    const dateStr = Array.isArray(booking.dates)
      ? booking.dates.join(', ')
      : booking.dates;

    await this.mailerService.sendMail({
      to: booking.email,
      subject: 'Atualização de Status: Em Análise',
      html: `
        <h3>Olá ${booking.nome_completo},</h3>
        <p>O status da sua solicitação para a <b>${getRoomLabel(booking.room_name)}</b> (Data(s): ${dateStr}) foi alterado para <b>Em Análise</b>.</p>
        <p><b>Observação da Administração:</b></p>
        <blockquote style="background: #f9f9f9; border-left: 10px solid #ccc; margin: 1.5em 10px; padding: 0.5em 10px;">
          ${observacao}
        </blockquote>
        <p>Você será notificado assim que houver uma nova atualização.</p>
      `,
    });
  }

  // E-mail de CONFIRMAÇÃO DE PRESENÇA com QR Code - enviado no dia/horário do evento
  async sendAttendanceConfirmationQRCode(
    booking: Booking,
    email: string,
    frontendUrl: string,
    isRequester: boolean = false,
  ) {
    const statusColor = STATUS_COLORS.approved;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    // Define o local baseado na sala
    let location: string;
    if (booking.room_name === 'escola_fazendaria') {
      location = booking.local || 'Escola Fazendária - SEGET';
    } else {
      location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
    }

    const formattedDates = booking.dates.map(formatDate).join(', ');
    const confirmationUrl = `${frontendUrl}/confirmar/${booking.id}`;

    // Gera URL para QR Code usando API pública
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(confirmationUrl)}`;

    const greeting = isRequester
      ? `Olá, ${booking.nome_completo}! 👋`
      : `Olá! 👋`;

    const introText = isRequester
      ? `Seu evento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong> está acontecendo agora! Confirme sua presença.`
      : `Você é participante de um evento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong> que está acontecendo agora. Confirme sua presença.`;

    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          ${greeting}
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          ${introText}
        </p>
      </div>

      <!-- Detalhes do Agendamento -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📋 Detalhes do Agendamento
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 12px; overflow: hidden; border: 1px solid #d1fae5;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5; width: 50%;">
              <span style="color: #065f46; font-size: 13px;">📅 DATA(S)</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 600;">${formattedDates}</span>
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5; width: 50%;">
              <span style="color: #065f46; font-size: 13px;">🕐 HORÁRIO(S)</span><br>
              ${booking.hora_inicio.length === 1
        ? `<span style="color: #065f46; font-size: 15px; font-weight: 600;">${booking.hora_inicio[0]} às ${booking.hora_fim[0]}</span>`
        : booking.hora_inicio
          .map(
            (inicio, i) =>
              `<span style="display: block; color: #065f46; font-size: 14px; font-weight: 500; margin: 2px 0;">${formatDate(booking.dates[i])}: ${inicio} às ${booking.hora_fim[i]}</span>`,
          )
          .join('')
      }
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🏢 SALA</span><br>
              <span style="color: ${roomColor}; font-size: 15px; font-weight: 600;">${getRoomLabel(booking.room_name)}</span>
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📍 LOCAL</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${location}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 12px 16px;">
              <span style="color: #065f46; font-size: 13px;">✅ STATUS</span><br>
              <span style="display: inline-block; padding: 4px 12px; background-color: #d1fae5; color: #065f46; border-radius: 20px; font-size: 14px; font-weight: 600;">Aprovado</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Seção Confirmação de Presença -->
      <div style="background-color: #dbeafe; border-radius: 16px; padding: 24px; margin-bottom: 24px; border: 1px solid #93c5fd;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span style="display: inline-flex; align-items: center; gap: 8px; color: #1e40af; font-size: 18px; font-weight: 600;">
            ✓ Confirmação de Presença
          </span>
        </div>

        <!-- QR Code -->
        <div style="text-align: center; margin: 20px 0;">
          <div style="display: inline-block; background-color: #ffffff; padding: 16px; border-radius: 12px; border: 4px solid #3b82f6;">
            <img src="${qrCodeUrl}" alt="QR Code para confirmação" style="display: block; width: 200px; height: 200px;" />
          </div>
        </div>

        <!-- Instrução -->
        <div style="background-color: #ffffff; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 16px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            📱 Escaneie o QR Code com a câmera do seu celular
          </p>
        </div>

        <!-- Botão -->
        <div style="text-align: center;">
          <a href="${confirmationUrl}" target="_blank" style="display: inline-block; width: 100%; max-width: 300px; padding: 14px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; box-sizing: border-box;">
            🔗 ABRIR LINK DE CONFIRMAÇÃO
          </a>
        </div>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Confirmação de Presença',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    await this.mailerService.sendMail({
      to: email,
      subject: `✓ Confirme sua Presença: ${booking.finalidade} - ${getRoomLabel(booking.room_name)}`,
      html,
    });
  }

  // E-mail de notificação para participantes externos
  async sendExternalParticipantNotification(
    booking: Booking,
    participant: any, // ExternalParticipant entity
  ) {
    const { subject, html } = this.buildExternalParticipantEmail(
      booking,
      participant?.full_name,
    );

    await this.mailerService.sendMail({
      to: participant.email,
      subject,
      html,
    });
  }

  async sendExternalParticipantsNotification(
    booking: Booking,
    participants: Array<{ email?: string | null; full_name?: string | null }>,
  ) {
    if (!participants || participants.length === 0) {
      return;
    }

    const emails = participants
      .map((participant) => participant?.email || '')
      .filter(Boolean);

    if (emails.length === 0) {
      return;
    }

    const recipients = this.buildRecipientFields(emails);
    const primary = participants.find(
      (participant) =>
        participant?.email && participant.email.trim() === recipients.to,
    );
    const displayName = recipients.cc ? null : primary?.full_name || null;

    const { subject, html } = this.buildExternalParticipantEmail(
      booking,
      displayName,
    );

    await this.mailerService.sendMail({
      ...recipients,
      subject,
      html,
    });
  }

  /**
   * E-mail de confirmação de presença com PDF anexo
   * Enviado 5 minutos após o início do agendamento para todos os participantes
   */
  async sendAttendanceConfirmationWithPDF(
    booking: Booking,
    email: string,
    name: string | null,
    frontendUrl: string,
    isRequester: boolean = false,
    specificDate?: string,
  ) {
    const statusColor = STATUS_COLORS.approved;
    const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

    // Define o local baseado na sala
    let location: string;
    if (booking.room_name === 'escola_fazendaria') {
      location = booking.local || 'Escola Fazendária - SEGET';
    } else {
      location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
    }

    // Se tem data específica, usa ela, senão usa todas as datas
    const dateToShow = specificDate
      ? formatDate(specificDate)
      : booking.dates.map(formatDate).join(', ');

    // Pega o horário correto para a data específica
    let horaInicioStr = '';
    let horaFimStr = '';
    if (specificDate) {
      const dateIndex = booking.dates.indexOf(specificDate);
      horaInicioStr = Array.isArray(booking.hora_inicio)
        ? booking.hora_inicio[dateIndex] || booking.hora_inicio[0]
        : (booking.hora_inicio as string);
      horaFimStr = Array.isArray(booking.hora_fim)
        ? booking.hora_fim[dateIndex] || booking.hora_fim[0]
        : (booking.hora_fim as string);
    } else {
      horaInicioStr = Array.isArray(booking.hora_inicio)
        ? booking.hora_inicio[0]
        : (booking.hora_inicio as string);
      horaFimStr = Array.isArray(booking.hora_fim)
        ? booking.hora_fim[0]
        : (booking.hora_fim as string);
    }

    const confirmationUrl = `${frontendUrl}/confirmar/${booking.id}`;

    // Gera URL para QR Code usando API pública
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(confirmationUrl)}`;



    const displayName = name || email.split('@')[0];
    const greeting = isRequester
      ? `Olá, ${booking.nome_completo}! 👋`
      : `Olá, ${displayName}! 👋`;

    const introText = isRequester
      ? `Seu evento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong> está acontecendo agora! Confirme sua presença.`
      : `Você é participante de um evento na <strong style="color: ${roomColor};">${getRoomLabel(booking.room_name)}</strong> que está acontecendo agora. Confirme sua presença.`;

    const content = `


      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; color: #111827; font-size: 20px; font-weight: 600;">
          ${greeting}
        </h2>
        <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
          ${introText}
        </p>
      </div>

      <!-- Detalhes do Agendamento -->
      <div style="margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px; font-weight: 600;">
          📋 Detalhes do Evento
        </h2>
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 12px; overflow: hidden; border: 1px solid #d1fae5;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🏢 SALA</span><br>
              <span style="color: ${roomColor}; font-size: 15px; font-weight: 600;">${getRoomLabel(booking.room_name)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📍 LOCAL</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${location}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">📅 DATA</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${dateToShow}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #d1fae5;">
              <span style="color: #065f46; font-size: 13px;">🕐 HORÁRIO</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${horaInicioStr} às ${horaFimStr}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 16px;">
              <span style="color: #065f46; font-size: 13px;">📝 EVENTO</span><br>
              <span style="color: #065f46; font-size: 15px; font-weight: 500;">${booking.finalidade}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Seção Confirmação de Presença -->
      <div style="background-color: #dbeafe; border-radius: 16px; padding: 24px; margin-bottom: 24px; border: 1px solid #93c5fd;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span style="display: inline-flex; align-items: center; gap: 8px; color: #1e40af; font-size: 18px; font-weight: 600;">
            ✓ Confirmação de Presença
          </span>
        </div>

        <!-- QR Code -->
        <div style="text-align: center; margin: 20px 0;">
          <div style="display: inline-block; background-color: #ffffff; padding: 16px; border-radius: 12px; border: 4px solid #3b82f6;">
            <img src="${qrCodeUrl}" alt="QR Code para confirmação" style="display: block; width: 200px; height: 200px;" />
          </div>
        </div>

        <!-- Instrução -->
        <div style="background-color: #ffffff; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 16px;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            📱 Escaneie o QR Code com a câmera do seu celular
          </p>
        </div>

        <!-- Botão -->
        <div style="text-align: center;">
          <a href="${confirmationUrl}" target="_blank" style="display: inline-block; width: 100%; max-width: 300px; padding: 14px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; text-align: center; box-sizing: border-box;">
            🔗 ABRIR LINK DE CONFIRMAÇÃO
          </a>
        </div>
      </div>

      <div style="margin-top: 16px; padding: 16px; background-color: #fef3c7; border-radius: 12px; border: 1px solid #fcd34d;">
        <p style="margin: 0; color: #92400e; font-size: 14px; text-align: center;">
          ⚠️ Este link é único para você. Não compartilhe com outras pessoas.
        </p>
      </div>
    `;

    const html = this.generateEmailTemplate(
      'Confirmação de Presença',
      content,
      statusColor,
      roomColor,
      booking.room_name,
    );

    // Gera o PDF de confirmação
    const pdfBuffer = await this.generateAttendancePDF(
      booking,
      displayName,
      confirmationUrl,
      qrCodeUrl,
      specificDate,
    );

    await this.mailerService.sendMail({
      to: email,
      subject: `✓ Confirme sua Presença: ${booking.finalidade} - ${getRoomLabel(booking.room_name)}`,
      html,
      attachments: [
        {
          filename: `confirmacao-presenca-${booking.id.slice(0, 8)}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  /**
   * Gera PDF de confirmação de presença
   */
  private async generateAttendancePDF(
    booking: Booking,
    participantName: string,
    confirmationUrl: string,
    qrCodeUrl: string,
    specificDate?: string,
  ): Promise<Buffer> {
    const PDFDocument = require('pdfkit');

    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Cores
        const primaryColor = '#bd202e';
        const roomColor = ROOM_COLORS[booking.room_name] || '#6366f1';

        // Header com cor da prefeitura
        doc.rect(0, 0, doc.page.width, 80).fill(primaryColor);

        // Título no header
        doc.fontSize(24).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text('CONFIRMAÇÃO DE PRESENÇA', 50, 30, { align: 'center' });

        // Subtítulo
        doc.fontSize(12).fillColor('#ffffff').font('Helvetica');
        doc.text('Sistema de Agendamentos SEGET', 50, 55, { align: 'center' });

        // Reset position
        doc.fillColor('#000000');

        // Informações do evento
        let yPos = 110;

        // Título do evento
        doc.fontSize(18).font('Helvetica-Bold').fillColor(roomColor);
        doc.text(booking.finalidade, 50, yPos, { align: 'center' });
        yPos += 30;

        // Sala
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
        doc.text(getRoomLabel(booking.room_name), 50, yPos, {
          align: 'center',
        });
        yPos += 40;

        // Linha divisória
        doc
          .moveTo(50, yPos)
          .lineTo(doc.page.width - 50, yPos)
          .stroke('#e5e7eb');
        yPos += 20;

        // Informações em grid
        const leftCol = 50;
        const rightCol = 300;
        const lineHeight = 25;

        // Data
        const dateToShow = specificDate
          ? formatDate(specificDate)
          : booking.dates.map(formatDate).join(', ');

        doc.fontSize(11).font('Helvetica-Bold').fillColor('#6b7280');
        doc.text('DATA:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#111827');
        doc.text(dateToShow, leftCol + 50, yPos);

        // Horário
        let horaInicioStr = '';
        let horaFimStr = '';
        if (specificDate) {
          const dateIndex = booking.dates.indexOf(specificDate);
          horaInicioStr = Array.isArray(booking.hora_inicio)
            ? booking.hora_inicio[dateIndex] || booking.hora_inicio[0]
            : (booking.hora_inicio as string);
          horaFimStr = Array.isArray(booking.hora_fim)
            ? booking.hora_fim[dateIndex] || booking.hora_fim[0]
            : (booking.hora_fim as string);
        } else {
          horaInicioStr = Array.isArray(booking.hora_inicio)
            ? booking.hora_inicio[0]
            : (booking.hora_inicio as string);
          horaFimStr = Array.isArray(booking.hora_fim)
            ? booking.hora_fim[0]
            : (booking.hora_fim as string);
        }

        doc.font('Helvetica-Bold').fillColor('#6b7280');
        doc.text('HORÁRIO:', rightCol, yPos);
        doc.font('Helvetica').fillColor('#111827');
        doc.text(`${horaInicioStr} às ${horaFimStr}`, rightCol + 60, yPos);
        yPos += lineHeight;

        // Local
        let location: string;
        if (booking.room_name === 'escola_fazendaria') {
          location = booking.local || 'Escola Fazendária - SEGET';
        } else {
          location = 'Rua Álvares de Castro, 272 - Maricá/RJ';
        }

        doc.font('Helvetica-Bold').fillColor('#6b7280');
        doc.text('LOCAL:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#111827');
        doc.text(location, leftCol + 50, yPos, { width: 200 });
        yPos += lineHeight + 10;

        // Participante
        doc.font('Helvetica-Bold').fillColor('#6b7280');
        doc.text('PARTICIPANTE:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#111827');
        doc.text(participantName, leftCol + 90, yPos);
        yPos += lineHeight;

        // Solicitante
        doc.font('Helvetica-Bold').fillColor('#6b7280');
        doc.text('SOLICITANTE:', leftCol, yPos);
        doc.font('Helvetica').fillColor('#111827');
        doc.text(booking.nome_completo, leftCol + 85, yPos);
        yPos += 40;

        // Linha divisória
        doc
          .moveTo(50, yPos)
          .lineTo(doc.page.width - 50, yPos)
          .stroke('#e5e7eb');
        yPos += 30;

        // Seção QR Code
        doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor);
        doc.text('CONFIRME SUA PRESENÇA', 50, yPos, { align: 'center' });
        yPos += 30;

        // Instruções
        doc.fontSize(11).font('Helvetica').fillColor('#6b7280');
        doc.text(
          'Escaneie o QR Code abaixo com a câmera do seu celular ou acesse o link:',
          50,
          yPos,
          { align: 'center' },
        );
        yPos += 40;

        // Baixa a imagem do QR Code e insere no PDF
        try {
          const https = require('https');
          const qrImageBuffer = await new Promise<Buffer>(
            (resolveImg, rejectImg) => {
              https
                .get(qrCodeUrl, (response: any) => {
                  const chunks: Buffer[] = [];
                  response.on('data', (chunk: Buffer) => chunks.push(chunk));
                  response.on('end', () => resolveImg(Buffer.concat(chunks)));
                  response.on('error', rejectImg);
                })
                .on('error', rejectImg);
            },
          );

          // Centraliza o QR Code
          const qrSize = 150;
          const qrX = (doc.page.width - qrSize) / 2;
          doc.image(qrImageBuffer, qrX, yPos, {
            width: qrSize,
            height: qrSize,
          });
          yPos += qrSize + 20;
        } catch (error) {
          // Se falhar ao baixar o QR, mostra apenas o link
          doc.fontSize(10).fillColor('#ef4444');
          doc.text('(QR Code não disponível)', 50, yPos, { align: 'center' });
          yPos += 30;
        }

        // Link clicável
        doc.fontSize(10).fillColor('#2563eb');
        doc.text(confirmationUrl, 50, yPos, {
          align: 'center',
          link: confirmationUrl,
          underline: true,
        });
        yPos += 40;

        // Aviso
        doc.fontSize(9).fillColor('#92400e');
        doc.text(
          '⚠️ Este documento é único e intransferível. Não compartilhe com outras pessoas.',
          50,
          yPos,
          { align: 'center' },
        );

        // Footer
        const footerY = doc.page.height - 50;
        doc.fontSize(8).fillColor('#9ca3af');
        doc.text(
          `© ${new Date().getFullYear()} SEGET - Secretaria de Gestão | Documento gerado automaticamente`,
          50,
          footerY,
          { align: 'center' },
        );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
