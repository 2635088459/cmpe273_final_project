import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { Request, Response } from 'express';
import * as express from 'express';
import { AppModule } from './app.module';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Explicitly parse JSON bodies before our proxy middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const serviceToken = process.env.SERVICE_TOKEN || 'erasegraph_internal_token';
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
  const port = Number(process.env.PORT || 3000);

  app.use(async (req: Request, res: Response) => {
    // CORS headers on every response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.path === '/health') {
      res.json({
        status: 'ok',
        service: 'erasegraph-api-gateway-service',
        backend_url: backendUrl,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (req.header('x-service-token') !== serviceToken) {
      res.status(401).json({
        statusCode: 401,
        message: 'Missing or invalid X-Service-Token'
      });
      return;
    }

    const targetUrl = new URL(req.originalUrl, backendUrl);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (!value || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
      headers.set(name, Array.isArray(value) ? value.join(',') : value);
    }

    const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body || {}) : undefined
    });

    res.status(response.status);
    response.headers.forEach((value, name) => {
      if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    const body = Buffer.from(await response.arrayBuffer());
    res.send(body);
  });

  await app.listen(port);
  console.log(`EraseGraph API Gateway listening on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start API Gateway', error);
  process.exit(1);
});
