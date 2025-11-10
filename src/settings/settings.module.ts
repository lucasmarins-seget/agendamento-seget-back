import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuthModule } from 'src/auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomBlock } from 'src/entities/room-block.entity';
import { RoomSetting } from 'src/entities/room-setting.entity';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([RoomBlock, RoomSetting])],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
