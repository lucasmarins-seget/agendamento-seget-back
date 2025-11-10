import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoomBlock } from 'src/entities/room-block.entity';
import { RoomSetting } from 'src/entities/room-setting.entity';
import { Repository } from 'typeorm';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateComputersDto } from './dto/update-computers.dto';

const ESCOLA_FAZENDARIA = 'escola_faendaria';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(RoomBlock)
    private readonly roomBlockRepository: Repository<RoomBlock>,
    @InjectRepository(RoomSetting)
    private readonly roomSettingRepository: Repository<RoomSetting>,
  ) {}

  async createBlock(createBlockDto: CreateBlockDto, user: any) {
    for (const dateStr of createBlockDto.dates) {
      const data = new Date(`${dateStr}T12:00:00Z`); // Usa UTC para evitar problemas de fuso
      const diaDaSemana = data.getUTCDay(); // 0 = Domingo, 6 = Sábado
      if (diaDaSemana === 0 || diaDaSemana === 6) {
        throw new BadRequestException(
          `Não é permitido bloquear finais de semana (${dateStr}).`,
        );
      }
    }
    const minTime = '09:00';
    const maxTime = '17:00';

    for (const timeStr of createBlockDto.times) {
      // Compara as strings diretamente (HH:mm)
      if (timeStr < minTime || timeStr > maxTime) {
        throw new BadRequestException(
          `Horário inválido (${timeStr}). Só é permitido bloquear entre 09:00 e 17:00.`,
        );
      }
    }
    const newBlock = this.roomBlockRepository.create({
      ...createBlockDto,
      room_name: createBlockDto.room,
      created_by: user.email,
    });
    const savedBlock = await this.roomBlockRepository.save(newBlock);

    return {
      success: true,
      message: 'Bloqueio criado com sucesso',
      block: savedBlock,
    };
  }

  async findBlocks(room?: string) {
    const where = room ? { room } : {};
    const blocks = await this.roomBlockRepository.find({ where });
    return { blocks };
  }

  async removeBlock(id: string) {
    const result = await this.roomBlockRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Bloqueio não encontrado');
    }
    return {
      success: true,
      message: 'Bloqueio removido com sucesso',
    };
  }

  async getComputers() {
    const setting = await this.roomSettingRepository.findOneBy({
      room: ESCOLA_FAZENDARIA,
    });
    return {
      availableComputers: setting?.available_computers || 0,
    };
  }

  async updateComputers(updateComputersDto: UpdateComputersDto) {
    let setting = await this.roomSettingRepository.findOneBy({
      room: ESCOLA_FAZENDARIA,
    });

    if (!setting) {
      setting = this.roomSettingRepository.create({
        room: ESCOLA_FAZENDARIA,
      });
    }

    setting.available_computers = updateComputersDto.availableComputers;
    const updateSetting = await this.roomSettingRepository.save(setting);

    return {
      success: true,
      message: 'Configuração atualizada',
      availableComputers: updateSetting.available_computers,
    };
  }
}
