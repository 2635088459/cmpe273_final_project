import './tracing';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error', 'debug'] });

  const port = process.env.PORT || 3004;

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', service: 'erasegraph-proof-service', timestamp: new Date().toISOString() });
  });

  await app.listen(port);
  logger.log(`Proof Service running on port ${port}`);
}

bootstrap();
