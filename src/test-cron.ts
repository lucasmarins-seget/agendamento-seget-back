// src/test-cron.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TasksService } from './tasks/tasks.service';

async function bootstrap() {
  // Cria apenas o contexto da aplicação (sem subir servidor HTTP/Express)
  // Isso carrega o Banco de Dados, .env, Mailer, etc.
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Pega a instância do TasksService que o NestJS já montou
    const tasksService = app.get(TasksService);

    console.log('🚀 Iniciando teste manual do Cron Job...');
    // Chama a função diretamente
    await tasksService.handleCron();

    console.log('✅ Teste finalizado com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    // Fecha a conexão com o banco e encerra o processo
    await app.close();
  }
}

bootstrap();