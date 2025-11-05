import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { AdminUser } from 'src/entities/admin-user.entity';
import { LoginDto } from './dto/login.dto';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt'

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
    private readonly jwtService: JwtService,
  ){}

  async validateUser(loginDto: LoginDto): Promise<AdminUser>{
    const { email, password } = loginDto;

    const admin = await this.adminUserRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password_hash', 'is_super_admin', 'room_access'],
    });

    if (!admin){
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    
    if (!isPasswordValid){
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    return admin;
  }

  async login(admin: AdminUser){
    const payload = {
      sub: admin.id,
      email: admin.email,
      isSuperAdmin: admin.is_super_admin,
      roomAccess: admin.room_access,
    };

    const token = this.jwtService.sign(payload);

    return {
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        room_access: admin.room_access,
        is_super_admin: admin.is_super_admin,
      },
      token: token,
    };
  }
}
