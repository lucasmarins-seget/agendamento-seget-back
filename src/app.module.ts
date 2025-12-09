import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BookingsModule } from './bookings/bookings.module';
import { SettingsModule } from './settings/settings.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { MailService } from './mail/mail.service';
import { EmployeesModule } from './employees/employees.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
        // Configurações de timeout e retry
        connectTimeout: 60000, // 60 segundos
        timeout: 60000,
        extra: {
          connectionLimit: 10,
          connectTimeout: 60000,
        },
      }),
    }),
    BookingsModule,
    AuthModule,
    AdminModule,
    AttendanceModule,
    SettingsModule,
    MailModule,
    EmployeesModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService, MailService],
})
export class AppModule {}
