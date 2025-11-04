import { Controller, Post, Body } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

// Rota base: /api/bookings
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // Rota: POST /api/bookings/create 
  @Post('create')
  create(@Body() createBookingDto: CreateBookingDto) {
    // 1. O 'ValidationPipe' (do main.ts) valida o 'createBookingDto'
    // 2. Se for válido, o Nest chama este método
    return this.bookingsService.create(createBookingDto);
  }

  // TODO: Adicionar as outras rotas públicas
  // POST /api/bookings/search [cite: 139]
  // GET /api/bookings/:id [cite: 164]
}