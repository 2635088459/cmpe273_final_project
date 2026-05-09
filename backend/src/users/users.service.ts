import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { User } from '../database/entities';

type DemoUserSeed = {
  id: string;
  username: string;
  email: string;
  region: string;
  plan: string;
  department: string;
  searchDocuments: string[];
  analyticsEvents: Record<string, unknown>[];
};

const DEMO_USER_SEEDS: DemoUserSeed[] = [
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    username: 'alice',
    email: 'alice@example.com',
    region: 'North America',
    plan: 'Enterprise',
    department: 'Marketing',
    searchDocuments: [
      'alice campaign brief for spring launch and audience segmentation notes',
      'alice profile card with enterprise marketing preferences and consent history',
      'alice support ticket summary about export requests and dashboard usage',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/overview', device: 'web', campaign: 'spring-launch' },
      { event: 'segment_export', format: 'csv', source: 'audience-builder' },
      { event: 'privacy_settings_update', section: 'tracking', value: 'reduced' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000002',
    username: 'bob',
    email: 'bob@example.com',
    region: 'Europe',
    plan: 'Business',
    department: 'Sales',
    searchDocuments: [
      'bob account notes about pipeline review and regional lead scoring',
      'bob customer profile snippet with sales outreach preferences',
      'bob shared workspace search result about quarterly forecast exports',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/pipeline', device: 'web', team: 'emea-sales' },
      { event: 'report_download', format: 'pdf', report: 'forecast-q2' },
      { event: 'search_query', query: 'enterprise leads', results: 18 },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000003',
    username: 'charlie',
    email: 'charlie@example.com',
    region: 'Asia Pacific',
    plan: 'Starter',
    department: 'Support',
    searchDocuments: [
      'charlie customer support transcript summary for onboarding issues',
      'charlie knowledge base search result about retention workflows',
      'charlie profile snippet with support queue assignment and timezone',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/tickets', device: 'web', queue: 'onboarding' },
      { event: 'macro_apply', macro: 'welcome-sequence', ticket_id: 'SUP-1204' },
      { event: 'article_open', article: 'retention-workflows', locale: 'en-AU' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000004',
    username: 'diana',
    email: 'diana@example.com',
    region: 'North America',
    plan: 'Enterprise',
    department: 'Operations',
    searchDocuments: [
      'diana workflow checklist for deletion approvals and audit follow-up',
      'diana operations profile snippet with admin console activity history',
      'diana dashboard search result for storage cleanup and retention policy',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/admin', device: 'web', surface: 'ops-dashboard' },
      { event: 'bulk_delete_preview', batch_size: 24, source: 'admin-console' },
      { event: 'notification_export', format: 'json', destination: 'compliance-archive' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000005',
    username: 'eve',
    email: 'eve@example.com',
    region: 'Latin America',
    plan: 'Business',
    department: 'Product',
    searchDocuments: [
      'eve product feedback digest and roadmap tagging summary',
      'eve profile snippet with feature beta enrollments and consent notes',
      'eve search result about export API usage and dashboard experiments',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/experiments', device: 'web', experiment: 'api-redesign' },
      { event: 'feedback_submit', channel: 'in-app', category: 'deletion-flow' },
      { event: 'export_request', format: 'json', source: 'beta-dashboard' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000006',
    username: 'frank',
    email: 'frank@example.com',
    region: 'North America',
    plan: 'Starter',
    department: 'Finance',
    searchDocuments: [
      'frank finance dashboard notes for monthly reconciliation and retention checks',
      'frank profile snippet with invoice export behavior and alert preferences',
      'frank search result about compliance statements and audit packet download',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/billing', device: 'web', workspace: 'finance' },
      { event: 'statement_export', format: 'csv', period: 'monthly' },
      { event: 'alert_toggle', channel: 'email', alert: 'invoice_due' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000007',
    username: 'grace',
    email: 'grace@example.com',
    region: 'Europe',
    plan: 'Enterprise',
    department: 'Legal',
    searchDocuments: [
      'grace legal review notes on data retention clauses and consent records',
      'grace profile card with jurisdiction scope and compliance handoff history',
      'grace query result about policy archive and document attestation references',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/policies', device: 'web', locale: 'en-GB' },
      { event: 'policy_compare', left: '2026.03', right: '2026.05' },
      { event: 'attestation_download', format: 'pdf', purpose: 'audit' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000008',
    username: 'heidi',
    email: 'heidi@example.com',
    region: 'Asia Pacific',
    plan: 'Business',
    department: 'Engineering',
    searchDocuments: [
      'heidi engineering incident notes for queue retry behavior and tracing context',
      'heidi profile snippet with feature flags and service ownership mapping',
      'heidi search result about event stream replay and deletion pipeline tuning',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/observability', device: 'web', team: 'platform' },
      { event: 'trace_open', trace_type: 'deletion', source: 'jaeger' },
      { event: 'dashboard_pin', dashboard: 'pipeline-health', scope: 'personal' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000009',
    username: 'ivan',
    email: 'ivan@example.com',
    region: 'Latin America',
    plan: 'Business',
    department: 'Customer Success',
    searchDocuments: [
      'ivan customer success playbook notes on renewal outreach and escalation paths',
      'ivan profile snippet with account health scoring and engagement summary',
      'ivan search result about lifecycle milestones and support response latency',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/accounts', device: 'web', segment: 'renewal' },
      { event: 'health_score_review', account_tier: 'growth', score: 82 },
      { event: 'success_plan_export', format: 'json', cadence: 'quarterly' },
    ],
  },
  {
    id: 'a1b2c3d4-0000-0000-0000-000000000010',
    username: 'judy',
    email: 'judy@example.com',
    region: 'Middle East',
    plan: 'Starter',
    department: 'HR',
    searchDocuments: [
      'judy hr onboarding checklist with consent receipt and profile verification tasks',
      'judy profile snippet with workforce segment and communication preferences',
      'judy query result on training completion logs and people analytics filters',
    ],
    analyticsEvents: [
      { event: 'page_view', route: '/people', device: 'web', module: 'onboarding' },
      { event: 'training_assign', course: 'privacy-basics', audience: 'new-hires' },
      { event: 'directory_export', format: 'csv', scope: 'department' },
    ],
  },
];

const DEMO_USERS = DEMO_USER_SEEDS.map(({ id, username, email }) => ({ id, username, email }));

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  async listUsers(): Promise<User[]> {
    return this.userRepository.find({
      order: {
        username: 'ASC'
      }
    });
  }

  async restoreDemoUsers(): Promise<User[]> {
    await this.userRepository.upsert(DEMO_USERS, ['id']);
    await this.seedSearchDocuments();
    await this.seedAnalyticsEvents();
    await this.seedCacheEntries();

    this.logger.log('Restored demo users and seeded distributed demo data');

    return this.listUsers();
  }

  private async seedSearchDocuments(): Promise<void> {
    const subjectIds = DEMO_USERS.map((user) => user.username);

    await this.dataSource.query(
      `DELETE FROM search_index_documents WHERE subject_id = ANY($1)`,
      [subjectIds],
    );

    for (const user of DEMO_USER_SEEDS) {
      for (const documentText of user.searchDocuments) {
        await this.dataSource.query(
          `
            INSERT INTO search_index_documents (subject_id, indexed_text)
            VALUES ($1, $2)
          `,
          [user.username, documentText],
        );
      }
    }
  }

  private async seedAnalyticsEvents(): Promise<void> {
    const subjectIds = DEMO_USERS.map((user) => user.username);

    await this.dataSource.query(
      `DELETE FROM analytics_events WHERE subject_id = ANY($1)`,
      [subjectIds],
    );

    for (const user of DEMO_USER_SEEDS) {
      for (const analyticsEvent of user.analyticsEvents) {
        await this.dataSource.query(
          `
            INSERT INTO analytics_events (subject_id, event_payload, deleted_at)
            VALUES ($1, $2::jsonb, NULL)
          `,
          [
            user.username,
            JSON.stringify({
              user: user.username,
              region: user.region,
              plan: user.plan,
              department: user.department,
              ...analyticsEvent,
            }),
          ],
        );
      }
    }
  }

  private async seedCacheEntries(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const redis = new Redis(redisUrl, { lazyConnect: true });

    try {
      await redis.connect();

      for (const user of DEMO_USER_SEEDS) {
        await redis.set(
          `user:${user.username}`,
          JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            region: user.region,
            plan: user.plan,
            department: user.department,
          }),
        );
        await redis.set(
          `user:${user.username}:preferences`,
          JSON.stringify({
            marketing: true,
            locale: 'en-US',
            digest_frequency: 'weekly',
            favorite_dashboard: `${user.department.toLowerCase()}-overview`,
          }),
        );
        await redis.set(
          `user:${user.username}:privacy-dashboard`,
          JSON.stringify({
            last_export_format: 'json',
            consent_version: '2026.05',
            pending_request_count: 1,
          }),
        );
        await redis.set(
          `session:${user.username}:web`,
          JSON.stringify({
            sessionId: `sess-${user.username}-web`,
            active: true,
            device: 'web',
            lastPage: '/overview',
          }),
        );
        await redis.set(
          `session:${user.username}:mobile`,
          JSON.stringify({
            sessionId: `sess-${user.username}-mobile`,
            active: false,
            device: 'mobile',
            lastPage: '/notifications',
          }),
        );
        await redis.set(
          `profile:${user.username}`,
          JSON.stringify({
            displayName: user.username,
            email: user.email,
            region: user.region,
            plan: user.plan,
            department: user.department,
          }),
        );
      }
    } finally {
      redis.disconnect();
    }
  }
}
