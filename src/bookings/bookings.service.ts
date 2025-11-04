import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking } from '../entities/booking.entity';
import { RoomBlock } from '../entities/room-block.entity';
import { RoomSetting } from '../entities/room-setting.entity';
import { Repository } from 'typeorm';
import { CreateBookingDto } from './dto/create-booking.dto';

@Injectable()
export class BookingsService {
  // Injetando os "gerenciadores" das tabelas
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(RoomBlock)
    private readonly roomBlockRepository: Repository<RoomBlock>,
    @InjectRepository(RoomSetting)
    private readonly roomSettingRepository: Repository<RoomSetting>,
  ) {}

  // Método principal para criar agendamento
  async create(createBookingDto: CreateBookingDto) {
    // --- 1. Validações de Regra de Negócio ---

    // Regra: Data não pode ser final de semana [cite: 116, 669]
    const dataAgendamento = new Date(createBookingDto.data);
    const diaDaSemana = dataAgendamento.getUTCDay(); // 0 = Domingo, 6 = Sábado
    if (diaDaSemana === 0 || diaDaSemana === 6) {
      throw new BadRequestException('Não é permitido agendar em finais de semana.');
    }
    
    // Regra: Verificar bloqueios ativos [cite: 118, 677]
    // TODO: Implementar lógica de verificação de bloqueios
    // (buscar em `roomBlockRepository` por data, hora e sala)

    // Regra: Verificar disponibilidade de horário/sala [cite: 117, 676]
    // TODO: Implementar lógica de verificação de conflitos
    // (buscar em `bookingRepository` por agendamentos aprovados no mesmo horário)

    // Regra: Para Escola Fazendária, verificar computadores [cite: 119, 678]
    // TODO: Implementar lógica de verificação de computadores
    // (buscar em `roomSettingRepository` e comparar com agendamentos)
    
    // --- 2. Preparar e Salvar no Banco ---

    // Mapeia os dados do DTO para a Entidade
    const newBooking = this.bookingRepository.create({
      ...createBookingDto,
      data: dataAgendamento, // Converte a string para Date
      status: 'pending', // [cite: 487, 644]
      
      // Renomeando campos do DTO para a entidade (camelCase para snake_case)
      room_name: createBookingDto.roomName,
      tipo_reserva: createBookingDto.tipoReserva,
      nome_completo: createBookingDto.nomeCompleto,
      setor_solicitante: createBookingDto.setorSolicitante,
      hora_inicio: createBookingDto.horaInicio,
      hora_fim: createBookingDto.horaFim,
      numero_participantes: createBookingDto.numeroParticipantes,
      software_especifico: createBookingDto.softwareEspecifico,
      qual_software: createBookingDto.qualSoftware,
      material_externo: createBookingDto.materialExterno,
      apoio_equipe: createBookingDto.apoioEquipe,
      som_projetor: createBookingDto.somProjetor,
      wifi_todos: createBookingDto.wifiTodos,
      conexao_cabo: createBookingDto.conexaoCabo,
    });
    
    const savedBooking = await this.bookingRepository.save(newBooking);

    // --- 3. Ações Pós-Criação --- [cite: 135-138]
    
    // TODO: Implementar envio de e-mail para solicitante [cite: 136]
    // TODO: Implementar envio de link para participantes [cite: 137]
    // TODO: Implementar notificação para admin [cite: 138]

    // --- 4. Retornar Resposta de Sucesso ---
    return {
      success: true,
      bookingId: savedBooking.id,
      message: 'Agendamento solicitado com sucesso',
      confirmationUrl: `/confirmar/${savedBooking.id}`, // [cite: 126]
      participants: savedBooking.participantes, // [cite: 127]
    };
  }

  // TODO: Adicionar os outros métodos (search, findOne)
}