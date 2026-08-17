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
          secure: configService.get<boolean>('MAIL_SECURE', false), // true apenas na porta 465
          requireTLS: true, // força STARTTLS na porta 587 (exigido pelo webmail institucional)
          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASSWORD'),
          },
        },
        defaults: {
          from: configService.get<string>(
            'MAIL_FROM',
            '"Portal SEGET" <cienciadados.seget@marica.rj.gov.br>',
          ),
        },
      }),
    }),
  ],
  providers: [MailService],
  exports: [MailService], // EXPORTA o serviço
})
export class MailModule { }
