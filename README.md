# O Patriota Notícias

Plataforma editorial completa para um jornal online: backoffice para a redacção
(artigos, categorias, utilizadores, publicidade, newsletter, configurações) e
site público de leitura. **Stack monorepo** com NestJS no backend, Next.js no
frontend, PostgreSQL, Redis e processamento de imagem com `sharp`.

> Esta documentação cobre instalação local, operação diária, deploy em produção
> e o roadmap de melhorias técnicas que devem ser planeadas a médio prazo.

---

## Índice

1. [Visão geral](#visão-geral)
2. [Stack técnica](#stack-técnica)
3. [Arquitectura](#arquitectura)
4. [Pré-requisitos](#pré-requisitos)
5. [Instalação local (Docker)](#instalação-local-docker)
6. [Configuração — variáveis de ambiente](#configuração--variáveis-de-ambiente)
7. [Comandos do dia-a-dia](#comandos-do-dia-a-dia)
8. [Estrutura de pastas](#estrutura-de-pastas)
9. [Funcionalidades implementadas](#funcionalidades-implementadas)
10. [Papéis e permissões (RBAC)](#papéis-e-permissões-rbac)
11. [Migrations Prisma](#migrations-prisma)
12. [Testes](#testes)
13. [Deploy em produção](#deploy-em-produção)
14. [Backups](#backups)
15. [Roadmap & melhorias recomendadas](#roadmap--melhorias-recomendadas)
16. [Limitações conhecidas](#limitações-conhecidas)
17. [Troubleshooting](#troubleshooting)
18. [Suporte](#suporte)

---

## Visão geral

O projecto é composto por dois serviços principais e duas dependências:

| Serviço      | Tecnologia         | Porto local | Função                                       |
| ------------ | ------------------ | ----------- | -------------------------------------------- |
| `web`        | Next.js 16 (App Router) | `3005` | Frontend público + backoffice (`/admin`)     |
| `api`        | NestJS 11 + Prisma 7    | `8585` | API REST autenticada (JWT)                   |
| `postgres`   | PostgreSQL 16-alpine    | `5432` | Persistência principal                       |
| `redis`      | Redis 7-alpine          | `6379` | Contadores de visitas, rate-limit, sessões   |

Toda a infra-estrutura local é orquestrada via Docker Compose. Para
desenvolvimento, basta um único comando.

---

## Stack técnica

### Backend (`backend/`)
- **NestJS** 11 (Express adapter)
- **Prisma** 7 com adapter `@prisma/adapter-pg`
- **PostgreSQL** 16
- **Redis** 7 (`ioredis`) — contadores de visitas, rate-limit
- **sharp** — pipeline de processamento WebP (3 variantes small/medium/large + 1 ficheiro para avatares)
- **bcryptjs** — hashing de palavras-passe
- **multer** — upload multipart
- **exceljs** — exportação XLSX (subscritores newsletter)
- **`@nestjs/throttler`** — rate-limit no login
- **`@nestjs/schedule`** — cron para publicação agendada

### Frontend (`frontend/`)
- **Next.js** 16 (App Router, **Turbopack**) — SSR para páginas públicas, Server Actions para o admin
- **React** 19
- **Tailwind CSS v4** (sem `@tailwindcss/typography`)
- **Tiptap 3** — editor rich-text dos artigos
- **TypeScript** estrito em todo o lado

---

## Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│                     Cliente (browser)                          │
└────────────────────────────────┬───────────────────────────────┘
                                 │
                 HTTP (Next dev server, porto 3005)
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│   web (Next.js)                                                │
│   • Renderização SSR das páginas públicas (/ /artigo /categoria│
│     /pesquisa /p)                                              │
│   • Backoffice em /admin (Server Actions + apiFetch)           │
│   • Route handler /admin/newsletter/export proxy do CSV/XLSX   │
└────────────────────────────────┬───────────────────────────────┘
                                 │
              HTTP interno (api:8585 dentro da rede docker)
                       JWT no header Authorization
                                 │
┌────────────────────────────────▼───────────────────────────────┐
│   api (NestJS)                                                 │
│   • Auth (JWT) + RBAC (matriz de 31 permissões)                │
│   • Articles, Categories, Users, Media, Ads, Newsletter,       │
│     Settings, Activity Log, Dashboard stats                    │
│   • Pipeline sharp → /uploads/YYYY/MM/<id>-{small,medium,large}│
│   • Cron @ */1m: AGENDADO → PUBLICADO quando scheduledAt ≤ now │
└────┬─────────────────────────┬───────────────────────┬─────────┘
     │                         │                       │
     ▼                         ▼                       ▼
┌─────────┐              ┌──────────┐         ┌─────────────────┐
│ Postgres│              │  Redis   │         │ /uploads/       │
│         │              │ - visits │         │ (volume Docker) │
│ Prisma  │              │ - rate-  │         │  • articles/    │
│ schema  │              │   limit  │         │  • avatars/     │
└─────────┘              └──────────┘         └─────────────────┘
```

---

## Pré-requisitos

- **Docker Desktop** (Windows / macOS) ou **Docker Engine + Compose v2** (Linux)
- **Git**
- (Opcional) Node 22+ se quiser correr `npm` fora do container

Não é necessário instalar Postgres, Redis, Node, npm ou Prisma na máquina —
tudo corre dentro de containers.

---

## Instalação local (Docker)

### 1. Clonar o repositório

```bash
git clone <url-do-repositório> patriota
cd patriota
```

### 2. Preparar ficheiros `.env`

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

Edite `backend/.env` e altere **no mínimo**:

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`
- `DATABASE_URL` (refletir as credenciais acima)
- `JWT_SECRET` — gere com:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`

### 3. Subir os containers

```bash
docker compose up -d
```

O primeiro arranque demora ~2 min (pull das imagens, build, `prisma migrate
deploy`, seed). O backend tem um healthcheck que só reporta `healthy` quando o
Nest está realmente a ouvir; o frontend só arranca depois disso.

### 4. Confirmar que está vivo

| Endpoint                                | Esperado |
| --------------------------------------- | -------- |
| `http://localhost:3005/`                | Homepage com artigos do seed |
| `http://localhost:8585/public/categories` | JSON com as 9 categorias |
| `http://localhost:3005/admin/login`     | Página de login |

### 5. Entrar no backoffice

Email/password do seed (definidos em `backend/.env`). Por defeito:

- **Email**: `admin@opatriota.pt`
- **Password**: `PatriotaAdmin!2025`

> **Mude antes de qualquer deploy.**

---

## Configuração — variáveis de ambiente

### `backend/.env`

| Variável                  | Obrigatória | Descrição |
| ------------------------- | :--: | --- |
| `NODE_ENV`                | ✓ | `development` em dev, `production` em prod |
| `PORT`                    | ✓ | Porto que o Nest escuta (default 8585) |
| `POSTGRES_USER/PASSWORD/DB` | ✓ | Credenciais Postgres |
| `DATABASE_URL`            | ✓ | URL connection string Postgres |
| `REDIS_URL`               | ✓ | URL do Redis (`redis://redis:6379` em compose) |
| `JWT_SECRET`              | ✓ | **Mínimo 32 chars**, gerado aleatoriamente. Boot falha se ausente em produção. |
| `JWT_EXPIRES_IN`          |   | Duração do token (default `8h`) |
| `CORS_ORIGIN`             | ✓ em prod | Lista separada por vírgulas de origens permitidas |
| `SUPERADMIN_EMAIL`        |   | Email do utilizador semeado no boot |
| `SUPERADMIN_PASSWORD`     |   | Password do utilizador semeado |
| `UPLOADS_DIR`             |   | Pasta onde o sharp grava as imagens |
| `UPLOADS_PUBLIC_BASE_URL` | ✓ em prod | URL público que serve `/uploads` (CDN recomendado) |
| `IMAGE_QUALITY`           |   | Default 80, controla compressão WebP |
| `IMAGE_SIZE_SMALL/MEDIUM/LARGE` |   | Larguras das 3 variantes (400/800/1600) |

### `frontend/.env`

| Variável                  | Descrição |
| ------------------------- | --- |
| `PORT`                    | Porto do Next (3005) |
| `NEXT_PUBLIC_API_URL`     | URL **público** do API (usado pelo browser) |
| `INTERNAL_API_URL`        | URL **interno** do API (Server Components a chamar SSR) |
| `NEXT_PUBLIC_FEATURE_*`   | Feature flags da UI pública (comments, audio reader, etc.) — todas off por defeito |

---

## Comandos do dia-a-dia

### Docker Compose

```bash
# Subir tudo (dev, com hot reload)
docker compose up -d

# Ver logs
docker compose logs -f api      # API
docker compose logs -f web      # Frontend
docker compose logs --tail=50   # Todos

# Parar (preserva dados)
docker compose down

# ⚠ NUNCA usar em prod: apaga volumes (incluindo Postgres)
docker compose down -v

# Reconstruir após mudar dependências (package.json, Dockerfile)
docker compose build --no-cache api
docker compose up -d
```

### Dentro do container `api`

```bash
# Testes unitários
docker compose exec api npm test
docker compose exec api npm test -- articles    # filtrar

# Testes e2e (corre contra DB isolada `patriota_test`)
docker compose exec api npm run test:e2e

# Prisma
docker compose exec api npx prisma studio       # GUI no porto 5555
docker compose exec api npx prisma migrate dev --name <descricao>
docker compose exec api npx prisma db seed
```

### Dentro do container `web`

```bash
# Lint
docker compose exec web npm run lint

# Build de produção (debug local)
docker compose exec web npm run build
```

---

## Estrutura de pastas

```
patriota/
├── README.md                   ← este ficheiro
├── docker-compose.yml          ← composição raiz, junta backend + frontend
│
├── backend/                    ← NestJS API
│   ├── docker-compose.yml      ← api + postgres + redis
│   ├── Dockerfile              ← multi-stage (dev / prod)
│   ├── .env.example            ← template do .env
│   ├── prisma/
│   │   ├── schema.prisma       ← models
│   │   ├── migrations/         ← migrations versionadas
│   │   └── seed.ts             ← dados iniciais (admin, categorias, artigos)
│   ├── src/
│   │   ├── articles/           ← CRUD + workflow editorial
│   │   ├── categories/
│   │   ├── users/              ← inclui upload de avatar
│   │   ├── media/              ← pipeline sharp 3 variantes
│   │   ├── ads/                ← gestão de slots publicitários
│   │   ├── newsletter/         ← subscribers + exports CSV/XLSX
│   │   ├── settings/           ← geral/email/seo/redes/segurança/newsletter
│   │   ├── activity-log/
│   │   ├── dashboard/          ← stats agregadas
│   │   ├── visits/             ← contador Redis + middleware
│   │   ├── auth/               ← JWT + guards + RBAC decorator
│   │   ├── rbac/               ← matriz de 31 permissões por papel
│   │   ├── common/dto/         ← PageQueryDto reutilizável
│   │   └── prisma/             ← PrismaService wrapper
│   └── test/                   ← e2e (jest + supertest)
│
└── frontend/                   ← Next.js 16
    ├── docker-compose.yml
    ├── Dockerfile
    ├── .env.example
    └── src/
        ├── app/
        │   ├── page.tsx        ← Homepage
        │   ├── artigo/[slug]/  ← Página de artigo
        │   ├── categoria/[slug]/
        │   ├── pesquisa/       ← Página de resultados
        │   ├── p/[slug]/       ← 12 páginas institucionais (Termos, etc.)
        │   ├── admin/          ← Backoffice protegido
        │   │   ├── login/
        │   │   ├── artigos/
        │   │   ├── categorias/
        │   │   ├── utilizadores/
        │   │   ├── media/
        │   │   ├── publicidade/
        │   │   ├── newsletter/
        │   │   ├── configuracoes/
        │   │   ├── perfil/
        │   │   └── permissions/
        │   └── actions/        ← Server actions partilhadas
        ├── components/
        │   ├── home/           ← TopBar, BreakingNews, HeroGrid, Sidebar...
        │   ├── article/        ← ArticleSidebar, EssentialBox, ContextBox...
        │   ├── category/
        │   ├── ads/            ← AdSlot público
        │   └── admin/          ← Toggle, CoverImagePicker, RichTextEditor...
        ├── contexts/           ← AdContext (admin)
        └── lib/                ← api.ts, public-api.ts, images.ts, features.ts
```

---

## Funcionalidades implementadas

### Backoffice (`/admin`)
- **Dashboard** — stats globais (artigos publicados, visitas hoje/semana/mês, utilizadores), feed de actividade
- **Artigos** — CRUD completo, workflow EM_REVISAO → AGENDADO → PUBLICADO → ARQUIVADO, editor Tiptap, agendamento com cron
- **Categorias** — CRUD + sub-tópicos
- **Utilizadores** — convite, papéis, reset de password (apenas Super/Editor-Chefe), suspensão
- **Mídia** — upload drag-and-drop, biblioteca com pesquisa, detecção de uso em artigos e publicidade, bloqueio de eliminação se em uso
- **Publicidade** — 11 slots IAB-standard (Billboard 970×250, MPU 300×250, Leaderboard 728×90, etc.), modo Imagem ou Código HTML/iframe
- **Newsletter** — listagem de subscritores, exportação CSV e XLSX
- **Configurações** — geral, email (futuro), SEO, redes sociais (aparecem no footer), segurança, newsletter
- **Perfil** — alterar nome/bio/telefone, upload de avatar (privado), trocar password, preferências de notificação
- **Permissões** — editor da matriz RBAC

### Site público
- Homepage com hero + side stack + últimas notícias + investigação + sidebar
- Páginas de artigo com caixas estruturadas (Essencial, Contexto, Citação destacada)
- Páginas de categoria com paginação
- Página de pesquisa (`/pesquisa?q=`) + modal de pesquisa global (⌘K)
- Modal de newsletter (subscribe + unsubscribe com confirmação)
- 12 páginas institucionais (Termos, Privacidade, Cookies, ERC, Estatuto, Equipa, Política Correções, Transparência, Redacção, Publicidade, Assinatura, Imprensa)
- Footer com ícones sociais lidos dinamicamente das configurações

---

## Papéis e permissões (RBAC)

7 papéis fixos definidos em `backend/src/rbac/rbac.constants.ts`:

| Papel           | Pode atribuir                          | Pode ser gerido por |
| --------------- | -------------------------------------- | ------------------- |
| `SUPER_ADMIN`   | Todos                                  | Apenas `SUPER_ADMIN` |
| `EDITOR_CHEFE`  | EDITOR_CHEFE e abaixo                  | `SUPER_ADMIN` |
| `EDITOR`        | JORNALISTA, REVISOR, MODERADOR, ANALISTA | EDITOR_CHEFE+ |
| `JORNALISTA`    | —                                      | EDITOR+ |
| `REVISOR`       | —                                      | EDITOR+ |
| `MODERADOR`     | —                                      | EDITOR+ |
| `ANALISTA`      | —                                      | EDITOR+ |

A matriz completa (31 permissões × 7 papéis) é editável no admin em
**`/admin/permissions`** mas as permissões em si estão hardcoded.

---

## Migrations Prisma

```bash
# Após mudar schema.prisma, criar nova migration
docker compose exec api npx prisma migrate dev --name <descricao_curta>

# Em produção, aplicar as migrations pendentes
docker compose exec api npx prisma migrate deploy

# Ver estado
docker compose exec api npx prisma migrate status
```

> **Nunca usar `prisma db push`** em produção — não cria histórico de migrations.

---

## Testes

```bash
# Unit (Jest, 69 testes)
docker compose exec api npm test

# E2E (Jest + supertest, 43 testes — corre contra a DB `patriota_test`)
docker compose exec api npm run test:e2e

# Cobertura
docker compose exec api npm run test:cov
```

Os testes e2e usam uma base de dados isolada (`patriota_test`) — **não tocam
nos dados de desenvolvimento**.

---

## Deploy em produção

O projecto não está atado a nenhum provedor. As secções abaixo são receitas
para os 3 cenários mais comuns. Em qualquer caso, são **obrigatórios** três
recursos externos:

1. **Postgres gerido** (Neon, Supabase, AWS RDS, DigitalOcean Managed DB)
2. **Redis gerido** (Upstash, AWS ElastiCache, DigitalOcean)
3. **Armazenamento de objectos** para os uploads (Cloudinary, AWS S3, R2 da
   Cloudflare) — fortemente recomendado (ver [Roadmap](#roadmap--melhorias-recomendadas))

### Receita 1 — VPS simples (DigitalOcean, Hetzner, Linode)

Mais barato e simples para começar; tudo num servidor.

**Pré-requisitos do servidor:**
- Ubuntu 22.04 LTS ou similar
- Docker + Docker Compose
- Domínio apontado (A record) para o IP do servidor
- Caddy ou Nginx como reverse proxy + Let's Encrypt

**Passos:**

```bash
# 1. SSH para o servidor
ssh user@seu-servidor.pt

# 2. Clonar o repositório
git clone <url-repo> /opt/patriota
cd /opt/patriota

# 3. Configurar .env (NÃO copiar do .example — escrever do zero com valores reais)
nano backend/.env
nano frontend/.env

# 4. Construir imagens de produção
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 5. Subir
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 6. Verificar
curl http://localhost:8585/public/categories
curl http://localhost:3005/
```

**Reverse proxy (Caddy)** — `/etc/caddy/Caddyfile`:

```caddy
opatriota.pt {
    reverse_proxy localhost:3005
}

api.opatriota.pt {
    reverse_proxy localhost:8585
}
```

Caddy obtém HTTPS automaticamente via Let's Encrypt.

⚠ Para evoluir para produção real, **mover Postgres e Redis para serviços
geridos** em vez de ficarem no mesmo servidor — backups, alta disponibilidade,
encriptação em repouso.

### Receita 2 — Vercel (frontend) + Railway/Render (backend)

Boa relação preço/escalabilidade para sites de notícias com tráfego variável.

**Frontend → Vercel:**
1. Importar repositório no Vercel
2. Root directory: `frontend`
3. Build command: `npm run build`
4. Variáveis de ambiente: copiar de `frontend/.env.example`
5. `INTERNAL_API_URL` aponta para o URL público da API (Vercel não tem rede privada partilhada com Railway)

**Backend → Railway / Render / Fly.io:**
1. Criar projecto novo, apontar para `backend/`
2. Variáveis: copiar de `backend/.env.example`
3. Adicionar Postgres + Redis pelos addons do provedor
4. `DATABASE_URL` e `REDIS_URL` vêm automaticamente
5. **Importante:** os uploads em disco **não persistem** entre deploys nestes
   provedores (filesystem é efémero) — **obrigatório** migrar para
   Cloudinary/S3 antes do deploy

### Receita 3 — Kubernetes

Apenas se houver justificação (alta escala, equipa DevOps dedicada). Os
Dockerfiles existentes funcionam; basta criar Deployments, Services, Ingress,
PersistentVolumeClaim para uploads (ou ainda melhor, S3). Foge ao escopo
deste README.

### Checklist pré-deploy

- [ ] `JWT_SECRET` gerado aleatoriamente, **NÃO** o valor de exemplo
- [ ] `SUPERADMIN_PASSWORD` mudada
- [ ] `CORS_ORIGIN` aponta apenas para o domínio de produção
- [ ] `NODE_ENV=production`
- [ ] Postgres com backups automáticos (ver [Backups](#backups))
- [ ] Migrations aplicadas (`prisma migrate deploy`)
- [ ] DNS configurado (A record para domínio principal + subdomínio API)
- [ ] HTTPS activo (Let's Encrypt via Caddy/Nginx)
- [ ] Tag ERC actualizada em `/p/erc`
- [ ] Páginas de Termos / Privacidade revistas por advogado
- [ ] Slots de publicidade activados em `/admin/publicidade`
- [ ] Logo e favicon actualizados em `frontend/public/brand/`
- [ ] Testes a passar: `npm test && npm run test:e2e`

---

## Backups

### Postgres

```bash
# Dump diário (cron / systemd timer)
docker compose exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB \
  | gzip > /backups/patriota-$(date +%F).sql.gz

# Restaurar
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
```

Recomendamos **retenção de 30 dias** + cópia semanal para storage externo
(S3 Glacier, Backblaze B2).

### Uploads

Se ainda em volume local, fazer rsync diário para storage externo. Quando
migrar para Cloudinary/S3, o backup é automático (versionamento incluído).

---

## Roadmap & melhorias recomendadas

A plataforma está funcional mas há áreas que **precisam de atenção** antes ou
durante o crescimento. Por ordem de impacto:

### 🔴 Crítico para produção

#### 1. Armazenamento de imagens em serviço externo

**Estado actual:** as imagens vão para um volume Docker local
(`/uploads/YYYY/MM/...`).

**Porquê migrar:**
- Em hosts efémeros (Vercel, Railway, Render, Fly) o filesystem **não
  persiste** entre deploys → todas as imagens desaparecem
- Não há CDN — cada visitante carrega do servidor de origem
- Sem backup automático
- Sem geo-distribuição

**Recomendações (por ordem de preferência):**

1. **Cloudinary** — mais simples, transforms on-the-fly, plano grátis até
   25 GB. Substituir o pipeline `sharp` por upload directo ao Cloudinary;
   eles devolvem URLs CDN com transformações por query string
   (`?w=400&q=80`).
2. **Cloudflare R2** — preço imbatível (sem custos de egress) + CDN
   incorporado. Mantém o pipeline `sharp` actual mas escreve para R2 em
   vez do disco. API compatível com S3.
3. **AWS S3 + CloudFront** — opção enterprise. Mais configuração, mais
   ferramentas. Indicado se já estiver na AWS.

**Estimativa de esforço:** 1-2 dias para abstrair o `MediaService` por trás
de um interface `StorageProvider` com implementações `LocalStorage` e
`CloudinaryStorage`/`S3Storage`.

#### 2. SMTP — envio real de emails

**Estado actual:** os formulários do `/admin/configuracoes › Email` guardam
credenciais mas **nada é enviado**. Convites de utilizador mostram a password
no ecrã do admin em vez de enviar por email; newsletter não envia.

**Recomendações:**
- **SendGrid** ou **Postmark** (transaccional) para invites, reset de
  password, notificações administrativas
- **Resend** ou **Mailgun** para a newsletter editorial em massa
- **AWS SES** se já estiver na AWS — mais barato a volume mas com mais
  burocracia na entrega de reputação

**Implementação:** adicionar `NodemailerModule` (ou usar SDK do provedor),
ler `smtpHost/smtpUser/smtpPass` das settings (já guardados na DB), expor
serviço `MailerService.send(template, data)`.

#### 3. Comentários

Apesar do menu admin ter ainda algumas referências (escondidas atrás de
feature flag), **não existe modelo `Comment` na DB nem moderação**. Para um
jornal de notícias é essencial decidir cedo:

- **Implementar nativo:** modelo `Comment` + moderação + reCAPTCHA
- **Externalizar:** Disqus, Hyvor Talk, Commento (auto-hospedado)
- **Não ter:** muitos jornais portugueses fecharam comentários por causa
  da carga de moderação

### 🟡 Importante a médio prazo

#### 4. CDN para o site público

Mesmo com imagens no Cloudinary, o HTML/JS/CSS do Next vai sair do servidor
de origem. Cloudflare grátis à frente do domínio:
- Cache de assets estáticos
- Protecção DDoS
- HTTP/3
- Custo: zero

#### 5. Sitemap & RSS feeds

Críticos para SEO e agregadores:
- `app/sitemap.ts` — gerar dinamicamente com base na lista de artigos
  publicados (Next 16 suporta nativamente)
- `app/feed.xml/route.ts` — RSS 2.0 com os 50 artigos mais recentes
- `app/[categoria]/feed.xml/route.ts` — RSS por categoria
- Submeter ao Google News + Bing Webmaster

#### 6. Cache estratégico do SSR

Actualmente quase tudo é `cache: "no-store"`. Páginas como a homepage podem
ser servidas com `revalidate: 60` (ISR do Next) — uma única rerenderização
por minuto serve milhares de leitores. Reduz pressão sobre Postgres em
horas de pico.

#### 7. Open Graph & Twitter Cards dinâmicos por artigo

`app/artigo/[slug]/opengraph-image.tsx` — geração da imagem OG por artigo
(Next 16 tem suporte nativo). Aumenta cliques quando o artigo é partilhado
em redes sociais.

#### 8. Auth de leitores (paywall / subscrição)

Hoje a página `/p/assinatura` é só placeholder. Quando entrar em monetização,
considerar:
- **Stripe Billing** — assinaturas recorrentes
- Modelo `Reader` separado de `User` (admin staff)
- Middleware que detecta artigos `premium` e bloqueia conteúdo a não-subscritores

#### 9. Analytics

- **Plausible** ou **Umami** auto-hospedado (RGPD-friendly, sem cookies)
- Eventos: tempo de leitura, scroll depth, partilhas
- Substituir o contador Redis actual (que só mede pageviews) por algo mais
  rico

#### 10. Pesquisa full-text

A pesquisa actual usa Postgres `ILIKE` em `title` + `summary`. Não pesquisa
no corpo do artigo, não tem ranking, é lenta a partir de ~10 mil artigos.
Alternativas:
- **Postgres FTS** (tsvector + GIN index) — incluso, suficiente até ~100k
  artigos
- **Meilisearch** ou **Typesense** — auto-hospedado, instantâneo, suporta
  typo tolerance
- **Algolia** — managed, mais caro

### 🟢 Nice to have

#### 11. Audit log queryable na UI

O `ActivityLog` é populado mas só aparece em forma de feed no dashboard.
Faltam filtros (por utilizador, por tipo de acção, por período) e
exportação.

#### 12. Histórico de versões de artigos

`Article` é editado in-place; quem fez que alteração e quando se perde.
Modelo `ArticleRevision` com snapshot de `title + content + summary` por
edição. Aumenta a confiança editorial.

#### 13. 2FA para admins

Tab existe (`/admin/perfil › Segurança`) mas é placeholder. Implementar
TOTP (app autenticadora) com `otplib` + recovery codes.

#### 14. Limpeza periódica de uploads órfãos

Imagens carregadas que nunca foram usadas em artigos / publicidade
acumulam. Job semanal: `Media` sem refs há > 30 dias → eliminar.

#### 15. Internacionalização (i18n)

Hoje só PT-PT. Se houver intenção de versão brasileira ou inglesa,
preparar o Next App Router com `app/[locale]/...`.

---

## Limitações conhecidas

Documentadas honestamente para evitar surpresas:

| Área | Limitação |
| --- | --- |
| Email | Nenhum email sai do sistema; toda a configuração SMTP é placeholder |
| 2FA | UI existe, lógica não |
| Sessões | JWT sem refresh-token; "terminar sessões" não funciona |
| Whitelist de IPs | Campo nas settings é cosmético |
| reCAPTCHA | Idem |
| Comentários | Sem modelo, sem moderação |
| Paywall | Sem implementação |
| Pesquisa | ILIKE simples; sem ranking |
| Uploads | Em volume local; perde-se em hosts efémeros |
| Importação | Não há importer de artigos de outras plataformas |
| Multi-idioma | Só PT-PT |

---

## Troubleshooting

### "Backend não arranca, erro `JWT_SECRET must be defined`"
Faltam variáveis de ambiente. `cp backend/.env.example backend/.env` e
preencher.

### "Login retorna 401 mesmo com a password certa"
O seed só corre uma vez. Se mudou `SUPERADMIN_PASSWORD` depois do primeiro
boot, a base de dados ainda tem o hash antigo. Reset:

```bash
docker compose exec api npx prisma db seed
```

### "Imagens não aparecem no site público mas estão na biblioteca"
Confirmar que `UPLOADS_PUBLIC_BASE_URL` no `backend/.env` aponta para uma
URL acessível pelo browser. Em produção atrás de proxy, deve ser tipo
`https://opatriota.pt/uploads` (não `http://localhost:8585/uploads`).

### "Mudei `schema.prisma` e o boot falha"
Aplicar a migration:
```bash
docker compose exec api npx prisma migrate dev --name <descricao>
```

### "Frontend mostra 404 em página que existe"
Cache do Turbopack. Restartar:
```bash
docker compose restart web
```

### "Teste e2e dá erro de conexão"
A DB de teste (`patriota_test`) é criada pelo `global-setup`. Se o teste
ainda não passou nunca, garantir que o container `postgres` está com
healthy:
```bash
docker compose ps
docker compose logs postgres
```

---

## Suporte

- **Issues técnicos:** abrir issue no repositório
- **Reportar erros editoriais públicos:** `correcoes@opatriota.pt`
- **Imprensa:** `imprensa@opatriota.pt`

---

## Licença

Proprietária — © 2026 O Patriota Notícias. Todos os direitos reservados.
