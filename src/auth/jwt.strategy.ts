import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { InjectRepository } from "@nestjs/typeorm";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AdminUser } from "src/entities/admin-user.entity";
import { Repository } from "typeorm";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy){
    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(AdminUser)
        private readonly adminUserRepository: Repository<AdminUser>,
    ){
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false, 
            secretOrKey: configService.get<string>('JWT_SECRET'),
        });
    }

    async validate(payload: any){
        const admin = await this.adminUserRepository.findOneBy({ id: payload.sub });

        if (!admin){
            throw new UnauthorizedException('Token inválido. Usuário não encontrado.')
        }

        return {
            id: admin.id,
            email: admin.email,
            isSuperAdmin: admin.is_super_admin,
            roomAccess: admin.room_access,
        }
    }
}