// Import tracing first
import './tracing';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true
  }));

  // CORS configuration
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3005',
      'http://localhost:3006',
      'http://localhost:3007',
      'http://localhost:3008',
      'http://localhost:3020',
      'http://localhost:5173'
    ],
    credentials: true
  });

  // Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('EraseGraph API')
    .setDescription('Verifiable Deletion Propagation System')
    .setVersion('1.0')
    .addTag('Deletion Requests', 'Endpoints for managing deletion requests')
    .addServer('http://localhost:3001', 'Development server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'erasegraph-backend',
      version: '1.0.0'
    });
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  console.log('🚀 EraseGraph Backend started successfully!');
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`🔍 Health Check: http://localhost:${port}/health`);
  console.log(`🎯 Main API: http://localhost:${port}/deletions`);
}

bootstrap().catch(err => {
  console.error('❌ Failed to start application:', err);
  process.exit(1);
});
