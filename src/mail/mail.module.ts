import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Module({
    imports: [
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                transport: {
                    host: configService.get<string>('MAIL_HOST'),
                    port: configService.get<number>('MAIL_PORT', 587),
                    secure: false, // true para porta 465, false para outras
                    auth: {
                        user: configService.get<string>('MAIL_USER'),
                        pass: configService.get<string>('MAIL_PASSWORD'),
                    },
                        
                    defaults: {
                    from: '"Sistema de Agendamento" <nao-responda@seget.com>',
                    },
                }
                // TODO: Configurar templates de e-mail (Handlebars, etc)
            }),
        }),
    ],
    providers: [MailService],
    exports: [MailService], // EXPORTA o serviço
})
export class MailModule {}