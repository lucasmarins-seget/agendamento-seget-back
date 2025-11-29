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

const ESCOLA_FAZENDARIA = 'escola_fazendaria';

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
      created_by: user.email,
    });
    const savedBlock = await this.roomBlockRepository.save(newBlock);

    return {
      success: true,
      message: 'Bloqueio criado com sucesso',
      block: {
        id: savedBlock.id,
        room_name: savedBlock.room_name,
        dates: savedBlock.dates,
        times: savedBlock.times,
        reason: savedBlock.reason,
        created_by: savedBlock.created_by,
        createdAt: savedBlock.created_at,
      },
    };
  }

  async findBlocks(room_name?: string) {
    const where = room_name ? { room_name } : {};
    const blocks = await this.roomBlockRepository.find({
      where,
      order: { created_at: 'DESC' },
    });

    return {
      blocks: blocks.map((block) => ({
        id: block.id,
        room_name: block.room_name,
        dates: block.dates,
        times: block.times,
        reason: block.reason,
        created_by: block.created_by,
        createdAt: block.created_at,
      })),
    };
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
      room_name: ESCOLA_FAZENDARIA,
    });
    return {
      availableComputers: setting?.available_computers || 0,
    };
  }

  async updateComputers(updateComputersDto: UpdateComputersDto) {
    let setting = await this.roomSettingRepository.findOneBy({
      room_name: ESCOLA_FAZENDARIA,
    });

    if (!setting) {
      setting = this.roomSettingRepository.create({
        room_name: ESCOLA_FAZENDARIA,
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
