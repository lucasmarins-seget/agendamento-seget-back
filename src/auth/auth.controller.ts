import { Controller, Get, Post, Body, Patch, Param, Delete, HttpStatus, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('admin')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto){

    const admin = await this.authService.validateUser(loginDto);
    return this.authService.login(admin);
  }
  // TODO: Adicionar rota de logout
  // @Post('logout') [cite: 214]
}
