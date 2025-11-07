import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoomBlock } from 'src/entities/room-block.entity';
import { RoomSetting } from 'src/entities/room-setting.entity';
import { Repository } from 'typeorm';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBookingDto } from 'src/admin/dto/update-booking.dto';
import { UpdateComputersDto } from './dto/update-computers.dto';

const ESCOLA_FAZENDARIA = 'escola_faendaria';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(RoomBlock)
    private readonly roomBlockRepository: Repository<RoomBlock>,
    @InjectRepository(RoomSetting)
    private readonly roomSettingRepository: Repository<RoomSetting>,
  ){}

  async createBlock(createBlockDto: CreateBlockDto, user: any){
    // TODO: Adicionar validações de data (fim de semana, etc) [cite: 441-442]

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

  async removeBlock(id: string){
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
      room: ESCOLA_FAZENDARIA
    });
    return {
      availableComputers: setting?.available_computers || 0,
    };
  }

  async updateComputers(updateComputersDto: UpdateComputersDto) {
    let setting = await this.roomSettingRepository.findOneBy({
      room: ESCOLA_FAZENDARIA
    });

    if (!setting) {
      setting = this.roomSettingRepository.create({
        room: ESCOLA_FAZENDARIA
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
