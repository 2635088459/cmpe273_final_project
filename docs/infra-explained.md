# INFRA-001 / 002 / 003 — 代码逐行大白话解释

> 本文档面向「边学边写」的同学，用最通俗的语言解释每个文件里每段代码在干什么、为什么要这么写。  
> 建议配合实际文件对照阅读。

---

## 目录
1. [docker-compose.yml — 一键启动所有基础设施](#1-docker-composeyml)
2. [.env.example — 环境变量模板](#2-envexample)
3. [01-init-schema.sql — 数据库建表脚本](#3-01-init-schemasql)
4. [definitions.json — RabbitMQ 预配置](#4-definitionsjson)
5. [rabbitmq.conf — RabbitMQ 配置文件](#5-rabbitmqconf)
6. [它们之间的关系图](#6-它们之间的关系图)

---

## 1. docker-compose.yml

**这个文件是什么？**  
Docker Compose 是一个工具，它能让你用一个文件描述「我需要哪些服务」，然后一条命令 `docker compose up -d` 就把所有服务全部启动起来。相当于你不需要手动安装 PostgreSQL、Redis、RabbitMQ、Jaeger，Docker 帮你全搞定。

### PostgreSQL 部分

```yaml
postgres:
    image: postgres:16-alpine
```
- **image**: 告诉 Docker「去下载 PostgreSQL 16 版本的镜像」。`alpine` 是一个超小的 Linux 系统，镜像更小、下载更快。
- **通俗理解**: 就像你告诉外卖平台「我要一份 PostgreSQL 16 号套餐，小份的」。

```yaml
    container_name: erasegraph-postgres
```
- 给这个容器取个名字叫 `erasegraph-postgres`，方便你后面用 `docker exec erasegraph-postgres ...` 来操作它。

```yaml
    restart: unless-stopped
```
- 如果这个容器意外崩溃了，Docker 会自动帮你重启它。除非你手动停止它（`docker compose down`），否则它会一直尝试重启。

```yaml
    ports:
      - "${POSTGRES_PORT:-5434}:5432"
```
- **端口映射**: PostgreSQL 在容器内部监听 5432 端口，但我们把它映射到宿主机（你的 Mac）的 5434 端口。
- `${POSTGRES_PORT:-5434}` 意思是：「先看 `.env` 文件里有没有定义 `POSTGRES_PORT`，如果没有就用默认值 5434」。
- **为什么用 5434？** 因为你电脑上 5432 和 5433 已经被其他项目的数据库占了。
- **通俗理解**: 容器是一栋公寓楼，PostgreSQL 住在 5432 号房间。端口映射就是在公寓楼大门口挂了个牌子「找 5432 号住户请拨 5434」。

```yaml
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-erasegraph}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-erasegraph_secret}
      POSTGRES_DB: ${POSTGRES_DB:-erasegraph}
```
- 这三行就是告诉 PostgreSQL：「创建一个用户叫 `erasegraph`，密码是 `erasegraph_secret`，并且自动创建一个同名数据库 `erasegraph`」。
- 相当于你装完数据库后手动执行 `CREATE USER` 和 `CREATE DATABASE`，但这里全自动。

```yaml
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts/postgres:/docker-entrypoint-initdb.d:ro
```
- **第一行**: 把数据库的数据存到一个叫 `postgres_data` 的「卷」里。这样即使你重启容器，数据也不会丢。
- **第二行**: 把我们写的 SQL 初始化脚本（`01-init-schema.sql`）挂载到容器里的一个特殊目录。PostgreSQL 容器第一次启动时，会**自动执行**这个目录里的所有 `.sql` 文件。
- `:ro` 表示「只读」，容器只能读这个文件，不能修改它。
- **通俗理解**: 第一行是给数据库配了一个移动硬盘存数据；第二行是在数据库第一次开机时自动运行一段安装脚本。

```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-erasegraph}"]
      interval: 5s
      timeout: 5s
      retries: 10
```
- **健康检查**: Docker 每隔 5 秒问一下 PostgreSQL「你还活着吗？」（用 `pg_isready` 命令）。如果连续 10 次都没响应，就认为它挂了。
- 这就是为什么 `docker compose ps` 里能看到 `(healthy)` 状态。

---

### Redis 部分

```yaml
  redis:
    image: redis:7-alpine
```
- Redis 是一个内存数据库，主要用来做缓存。我们的项目里，用户数据会被缓存在 Redis 里，删除用户时需要同时清理这里的缓存。

```yaml
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
```
- `--appendonly yes`: 开启持久化，Redis 会把每次写操作记录到磁盘，即使重启也不丢数据。
- `--maxmemory 128mb`: 限制 Redis 最多用 128MB 内存（开发环境够用了）。
- `--maxmemory-policy allkeys-lru`: 当内存满了，自动删除「最近最少使用」的 key。LRU = Least Recently Used。
- **通俗理解**: 这就像给 Redis 设了三条规矩：①要记笔记（持久化）②最多只能用 128MB 的桌子（内存限制）③桌子满了就先扔掉最久没看的资料（LRU 策略）。

---

### RabbitMQ 部分

```yaml
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
```
- RabbitMQ 是消息队列（Message Queue），我们项目里用它来在微服务之间传递事件。
- `management` 版本自带一个网页管理界面（http://localhost:15672），可以看到队列里有多少消息、消费情况等。

```yaml
    ports:
      - "${RABBITMQ_PORT:-5672}:5672"          # AMQP
      - "${RABBITMQ_MGMT_PORT:-15672}:15672"   # Management UI
```
- 5672 是 AMQP 协议端口（服务之间收发消息用的）。
- 15672 是管理界面端口（你用浏览器看的）。
- **通俗理解**: 5672 是快递公司的收发窗口（程序用的），15672 是快递公司的官网（人看的）。

```yaml
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./init-scripts/rabbitmq/definitions.json:/etc/rabbitmq/definitions.json:ro
      - ./init-scripts/rabbitmq/rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
```
- 第一行：消息数据持久化。
- 第二行：挂载我们预先写好的队列/交换机配置（`definitions.json`），RabbitMQ 启动时自动创建这些队列。
- 第三行：告诉 RabbitMQ「启动时去读 definitions.json」。

---

### Jaeger 部分

```yaml
  jaeger:
    image: jaegertracing/all-in-one:1.54
```
- Jaeger 是一个分布式追踪工具。当一个删除请求经过多个服务时，Jaeger 会帮你画出「这个请求经过了哪些服务、每一步花了多长时间、在哪里失败了」。
- `all-in-one` 是把 Jaeger 的所有组件打包在一个容器里，开发环境用这个最方便。

```yaml
    ports:
      - "${JAEGER_UI_PORT:-16686}:16686"       # Jaeger UI
      - "4317:4317"                             # OTLP gRPC
      - "4318:4318"                             # OTLP HTTP
      - "14268:14268"                           # Jaeger HTTP Thrift
```
- 16686: Jaeger 的网页界面，你可以用浏览器打开 http://localhost:16686 查看追踪数据。
- 4317/4318: OpenTelemetry 协议端口。我们的后端服务通过这两个端口把追踪数据发给 Jaeger。
- **通俗理解**: Jaeger 就像一个快递追踪系统。16686 是你查快递的网页；4317/4318 是各个快递站向系统上报「包裹到我这了」的接口。

```yaml
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
```
- 开启 OTLP（OpenTelemetry Protocol）收集器。这样我们的后端服务可以用 OpenTelemetry SDK 直接把追踪数据发过来。

---

### volumes（最底下的部分）

```yaml
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  rabbitmq_data:
    driver: local
```
- 这三个 volume 是 Docker 管理的「虚拟硬盘」。
- 容器被删除后，只要你没加 `-v` 参数（`docker compose down` vs `docker compose down -v`），数据就还在。
- **通俗理解**: 相当于三个 U 盘，分别给 PostgreSQL、Redis、RabbitMQ 存数据。容器重启时自动插回去。

---

## 2. .env.example

```
POSTGRES_USER=erasegraph
POSTGRES_PASSWORD=erasegraph_secret
POSTGRES_DB=erasegraph
POSTGRES_PORT=5434
DATABASE_URL=postgresql://erasegraph:erasegraph_secret@localhost:5434/erasegraph
```

**这个文件是什么？**  
环境变量模板。`docker-compose.yml` 里写的 `${POSTGRES_USER:-erasegraph}` 会先去 `.env` 文件里找值。

**为什么要单独放一个 `.env.example`？**  
- `.env` 里可能有真实密码，不应该提交到 Git（已在 `.gitignore` 里忽略）。
- `.env.example` 是一个模板，新成员 clone 代码后只需要 `cp .env.example .env` 就能用。
- **通俗理解**: `.env.example` 是说明书上的「示例配置」，`.env` 是你自己填的真实配置。

**`DATABASE_URL` 是什么？**  
- 这是一个连接字符串（Connection String），格式是 `协议://用户名:密码@主机:端口/数据库名`。
- 后端服务代码里会读这个变量来连接数据库，不需要分别传用户名、密码等。

---

## 3. 01-init-schema.sql

**这个文件是什么？**  
PostgreSQL 的初始化脚本。容器第一次启动时自动执行，创建我们需要的所有表。

### UUID 扩展
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```
- 启用 UUID 生成功能。UUID 是一种全球唯一的 ID 格式，比如 `a1b2c3d4-0000-0000-0000-000000000001`。
- **为什么用 UUID 而不是自增 ID（1, 2, 3...）？** 因为我们是分布式系统，多个服务可能同时创建数据。UUID 能保证即使在不同服务里生成的 ID 也不会冲突。

### deletion_requests 表
```sql
CREATE TABLE IF NOT EXISTS deletion_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject_id    VARCHAR(255)  NOT NULL,
    status        VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
    requested_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ,
    trace_id      VARCHAR(64),
    ...
);
```
- **这张表存什么？** 每一条删除请求。比如「请求删除用户 alice 的所有数据」就是一条记录。
- `id`: 这条请求的唯一标识，自动生成 UUID。
- `subject_id`: 要删除的用户 ID（比如 alice 的 ID）。
- `status`: 当前状态，默认 `PENDING`（等待处理）。
- `requested_at`: 请求发起时间，默认当前时间。
- `completed_at`: 请求完成时间，一开始是空的，全部完成后才填。
- `trace_id`: Jaeger 追踪 ID，用来在 Jaeger UI 里查看这条请求的完整链路。

```sql
    CONSTRAINT chk_request_status CHECK (
        status IN ('PENDING', 'RUNNING', 'PARTIAL_COMPLETED', 'COMPLETED', 'FAILED')
    )
```
- **CHECK 约束**: 限制 status 只能是这 5 个值之一。如果有人不小心写了个 `status = 'abc'`，数据库会直接报错拒绝。
- **通俗理解**: 相当于给 status 字段装了一道安检门，只有合法的值才能通过。

**状态流转说明：**
```
PENDING → RUNNING → COMPLETED      (正常成功)
PENDING → RUNNING → PARTIAL_COMPLETED → COMPLETED  (部分失败后重试成功)
PENDING → RUNNING → FAILED         (彻底失败)
```

### deletion_steps 表
```sql
CREATE TABLE IF NOT EXISTS deletion_steps (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id     UUID NOT NULL REFERENCES deletion_requests(id) ON DELETE CASCADE,
    step_name      VARCHAR(50)   NOT NULL,
    status         VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    attempt_count  INTEGER       NOT NULL DEFAULT 0,
    last_error     TEXT,
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    ...
);
```
- **这张表存什么？** 每个删除请求下面的具体步骤。一个请求会有多个步骤，比如「删主数据库」「清 Redis 缓存」各算一个步骤。
- `request_id`: 外键，指向 `deletion_requests` 表，表示「这个步骤属于哪个请求」。
- `REFERENCES deletion_requests(id) ON DELETE CASCADE`: 如果父请求被删了，这些步骤也跟着删。
- `step_name`: 步骤名称，比如 `primary_data`、`cache`。
- `attempt_count`: 尝试了几次。第一次失败后重试，这个数字会从 0 变成 1、2...
- `last_error`: 最后一次失败的错误信息，比如 `"Redis connection timeout"`。
- **通俗理解**: `deletion_requests` 是一个大任务，`deletion_steps` 是大任务下面的子任务清单。

### proof_events 表
```sql
CREATE TABLE IF NOT EXISTS proof_events (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id     UUID NOT NULL REFERENCES deletion_requests(id) ON DELETE CASCADE,
    service_name   VARCHAR(50)   NOT NULL,
    event_type     VARCHAR(50)   NOT NULL,
    payload        JSONB         NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```
- **这张表存什么？** 审计日志 / 删除证明。每一次操作（成功或失败）都会在这里留一条记录。
- `service_name`: 是哪个服务报告的，比如 `primary_data`、`cache`。
- `event_type`: 事件类型，比如 `DeletionStepSucceeded`、`DeletionStepFailed`。
- `payload`: JSONB 类型，存具体的事件数据。JSONB 是 PostgreSQL 的一种灵活数据类型，可以存任意结构的 JSON。
- **通俗理解**: 这就是一个操作日志表。谁干了什么、什么时候干的、结果怎么样，全记下来。用于最终生成「删除证明」给用户看。

### users 表 + seed data
```sql
CREATE TABLE IF NOT EXISTS users (...);

INSERT INTO users (id, username, email) VALUES
    ('a1b2c3d4-...01', 'alice',   'alice@example.com'),
    ...
ON CONFLICT (id) DO NOTHING;
```
- **这张表存什么？** 模拟的用户数据。在真实系统里这就是「主数据库里的用户表」。
- 我们预先插入 5 个测试用户，demo 时用来演示删除流程。
- `ON CONFLICT (id) DO NOTHING`: 如果这条数据已经存在了（ID 相同），就跳过不插入，避免重复插入报错。

### 索引
```sql
CREATE INDEX idx_requests_subject  ON deletion_requests (subject_id);
CREATE INDEX idx_requests_status   ON deletion_requests (status);
CREATE INDEX idx_steps_request     ON deletion_steps (request_id);
CREATE INDEX idx_proof_request     ON proof_events (request_id);
CREATE INDEX idx_proof_service     ON proof_events (service_name);
```
- **索引是什么？** 相当于书的目录。没有索引时，数据库要逐行扫描才能找到数据；有了索引，数据库可以直接跳到对应位置。
- 我们给经常查询的字段（subject_id、status、request_id、service_name）都建了索引。
- **通俗理解**: 如果你在图书馆找一本书，没有索引就得一本一本翻；有了索引就直接查目录翻到那一页。

---

## 4. definitions.json

**这个文件是什么？**  
RabbitMQ 的预配置文件。RabbitMQ 启动时自动读取它，创建好所有的交换机（Exchange）、队列（Queue）和绑定关系（Binding）。

### 先理解三个核心概念

| 概念 | 大白话 | 类比 |
|------|--------|------|
| **Exchange（交换机）** | 消息的「路由器」，决定消息应该发到哪个队列 | 快递分拣中心 |
| **Queue（队列）** | 消息的「信箱」，消费者从这里取消息 | 快递驿站的货架 |
| **Binding（绑定）** | Exchange 和 Queue 之间的「路由规则」 | 分拣规则：「写着'北京'的包裹放到北京货架」 |

### Exchanges（交换机）

```json
"exchanges": [
    {
      "name": "erasegraph.events",
      "type": "topic",
      "durable": true,
      ...
    },
    {
      "name": "erasegraph.retry",
      "type": "topic",
      ...
    }
]
```
- `erasegraph.events`: 主交换机。所有正常的事件消息都通过它分发。
- `erasegraph.retry`: 重试交换机。失败的消息会被发到这里，等待一段时间后重新处理。
- `type: "topic"`: 主题类型，意思是可以用「路由键」（routing key）来做精确匹配。比如 `deletion.requested` 只会发给关心这个 key 的队列。
- `durable: true`: 持久化。即使 RabbitMQ 重启，这些交换机也不会丢失。

### Queues（队列）

```json
"queues": [
    { "name": "erasegraph.deletion-requests.primary-data", ... },
    { "name": "erasegraph.deletion-requests.cache-cleanup", ... },
    { "name": "erasegraph.step-results", ... },
    { "name": "erasegraph.proof-events", ... },
    { "name": "erasegraph.retry.cache-cleanup", ... }
]
```

| 队列名 | 谁消费它 | 里面装的是什么消息 |
|--------|---------|------------------|
| `deletion-requests.primary-data` | Primary Data Service | 「请你删主数据库里的用户数据」 |
| `deletion-requests.cache-cleanup` | Cache Cleanup Service | 「请你清理 Redis 缓存」 |
| `step-results` | Deletion Request Service | 「某个步骤成功了/失败了」 |
| `proof-events` | Proof Service | 「某个步骤成功了/失败了」（用于写审计日志） |
| `retry.cache-cleanup` | 重试机制（自动） | 失败的缓存清理消息，等 30 秒后自动重新投递 |

### 重试队列（最重要的设计之一）

```json
{
    "name": "erasegraph.retry.cache-cleanup",
    "arguments": {
        "x-message-ttl": 30000,
        "x-dead-letter-exchange": "erasegraph.events",
        "x-dead-letter-routing-key": "deletion.requested.cache"
    }
}
```
- `x-message-ttl: 30000`: 消息在这个队列里最多待 30 秒（30000 毫秒）。
- `x-dead-letter-exchange`: 30 秒后，消息会被自动转发到 `erasegraph.events` 交换机。
- `x-dead-letter-routing-key`: 转发时使用的路由键。
- **通俗理解**: 这是一个「延迟投递」机制。失败的消息先在 retry 队列里「坐冷板凳」30 秒，然后自动重新回到正常队列让服务再试一次。就像快递送不到，先放驿站等 30 分钟，然后重新派送。

### Bindings（绑定关系）

```json
"bindings": [
    {
      "source": "erasegraph.events",
      "destination": "erasegraph.deletion-requests.primary-data",
      "routing_key": "deletion.requested"
    },
    ...
]
```
- 这段的意思是：当有消息发到 `erasegraph.events` 交换机，并且 routing key 是 `deletion.requested` 时，把这条消息同时复制到 `primary-data` 和 `cache-cleanup` 两个队列。
- 这样一条删除请求就能同时被两个清理服务收到，并行处理。

**完整的消息流转路径：**
```
DRS 发布消息 → erasegraph.events 交换机
                    ↓ routing_key = "deletion.requested"
                    ├→ deletion-requests.primary-data 队列 → Primary Data Service 消费
                    └→ deletion-requests.cache-cleanup 队列 → Cache Cleanup Service 消费

各服务处理完成 → erasegraph.events 交换机
                    ↓ routing_key = "step.succeeded" 或 "step.failed"
                    ├→ step-results 队列 → DRS 消费（更新状态）
                    └→ proof-events 队列 → Proof Service 消费（写审计日志）

Cache Cleanup 失败 → erasegraph.retry 交换机
                    ↓ routing_key = "retry.cache-cleanup"
                    └→ retry.cache-cleanup 队列 → 等 30 秒 → 死信转发回主队列 → 重试
```

### Policy（策略）

```json
"policies": [
    {
      "name": "retry-policy",
      "pattern": "^erasegraph\\.retry\\.",
      "definition": {
        "message-ttl": 30000,
        "dead-letter-exchange": "erasegraph.events",
        "dead-letter-routing-key": "deletion.requested"
      }
    }
]
```
- 这是一条全局策略：所有以 `erasegraph.retry.` 开头的队列，都自动应用 30 秒 TTL 和死信转发规则。
- 这样如果以后加更多重试队列，不需要每个都手动配。

---

## 5. rabbitmq.conf

```
management.load_definitions = /etc/rabbitmq/definitions.json
```
- 就一行！告诉 RabbitMQ：「启动时请加载 `/etc/rabbitmq/definitions.json` 这个文件里的配置」。
- 如果没有这行，`definitions.json` 放进去了也不会被读取。

---

## 6. 它们之间的关系图

```
docker compose up -d
      │
      ├─→ 启动 PostgreSQL 容器
      │       └─→ 第一次启动时自动执行 01-init-schema.sql
      │               └─→ 创建 4 张表 + 插入 5 条测试用户
      │
      ├─→ 启动 Redis 容器
      │       └─→ 空的，等待后端服务写入缓存数据
      │
      ├─→ 启动 RabbitMQ 容器
      │       └─→ 读取 rabbitmq.conf
      │               └─→ 加载 definitions.json
      │                       └─→ 创建 2 个交换机 + 5 个队列 + 7 条绑定规则
      │
      └─→ 启动 Jaeger 容器
              └─→ 等待后端服务发送追踪数据
```

**所有配置项都从 `.env` 文件读取，`.env.example` 是模板。**

---

## 常用命令速查

```bash
# 启动所有服务
cd infra && docker compose up -d

# 查看服务状态
docker compose ps

# 查看某个服务的日志
docker logs erasegraph-postgres
docker logs erasegraph-rabbitmq

# 进入 PostgreSQL 命令行
docker exec -it erasegraph-postgres psql -U erasegraph

# 进入 Redis 命令行
docker exec -it erasegraph-redis redis-cli

# 停止所有服务（保留数据）
docker compose down

# 停止并删除所有数据（重新来过）
docker compose down -v
```
