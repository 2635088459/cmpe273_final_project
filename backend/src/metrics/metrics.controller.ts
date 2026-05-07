import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { PrometheusService } from './prometheus.service';

@ApiTags('Observability')
@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly prometheusService: PrometheusService,
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get system metrics — deletion requests, steps, and proof events (JSON)' })
  async getMetrics() {
    return this.metricsService.getMetrics();
  }

  @Get('metrics/prometheus')
  @ApiOperation({ summary: 'Get system metrics in Prometheus text format (scraped by Prometheus)' })
  async getPrometheusMetrics(@Res() res: Response) {
    const data = await this.metricsService.getMetrics();
    this.prometheusService.updateMetrics(data);
    res.set('Content-Type', this.prometheusService.registry.contentType);
    res.end(await this.prometheusService.registry.metrics());
  }
}
