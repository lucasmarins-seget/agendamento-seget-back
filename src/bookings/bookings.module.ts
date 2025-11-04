import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../entities/booking.entity';
import { RoomBlock } from '../entities/room-block.entity';
import { RoomSetting } from '../entities/room-setting.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      RoomBlock,
      RoomSetting
    ]),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
