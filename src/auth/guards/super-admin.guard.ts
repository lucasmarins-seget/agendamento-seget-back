import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    
    // 1. Pega o objeto 'user' que o JwtAuthGuard injetou no request
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 2. Se não existir o usuário (caso o JwtAuthGuard não tenha rodado)
    if (!user) {
      throw new ForbiddenException('Acesso negado.');
    }

    // 3. Verifica a flag 'isSuperAdmin'
    if (user.isSuperAdmin === true) {
      return true; // Acesso Permitido
    }

    // 4. Se não for Super Admin, bloqueia
    throw new ForbiddenException('Acesso restrito a Super Administradores.');
  }
}