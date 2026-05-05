import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error', 'debug'] });

  const port = process.env.PORT || 3010;

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', service: 'erasegraph-notification-service', timestamp: new Date().toISOString() });
  });

  await app.listen(port);
  logger.log(`Notification Service running on port ${port}`);
}

bootstrap();
