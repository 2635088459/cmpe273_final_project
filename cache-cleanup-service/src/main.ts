import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error', 'debug'] });

  const port = process.env.PORT || 3003;

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', service: 'erasegraph-cache-cleanup-service', timestamp: new Date().toISOString() });
  });

  await app.listen(port);
  logger.log(`Cache Cleanup Service running on port ${port}`);
}

bootstrap();
