import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Param,
  Get,
  Query,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { SearchBookingDto } from './dto/search-booking.dto';

// Rota base: /api/bookings
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) { }

  // Rota: POST /api/bookings/create
  @Post('create')
  create(@Body() createBookingDto: CreateBookingDto) {
    // 1. O 'ValidationPipe' (do main.ts) valida o 'createBookingDto'
    // 2. Se for válido, o Nest chama este método
    return this.bookingsService.create(createBookingDto);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  search(@Body() searchBookingDto: SearchBookingDto) {
    return this.bookingsService.search(searchBookingDto);
  }

  // GET /api/bookings/available-hours/:room_name/:date?tipoReserva=sala|computador - Retorna horários ocupados
  @Get('available-hours/:room_name/:date')
  getOccupiedHours(
    @Param('room_name') room_name: string,
    @Param('date') date: string,
    @Query('tipoReserva') tipoReserva?: string,
  ) {
    return this.bookingsService.getOccupiedHours(room_name, date, tipoReserva);
  }

  @Get(':id')
  findPublicOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bookingsService.findPublicOne(id);
  }
}
