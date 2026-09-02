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
7. [Configurar o Stripe (passo a passo)](#configurar-o-stripe-passo-a-passo)
8. [Comandos do dia-a-dia](#comandos-do-dia-a-dia)
9. [Estrutura de pastas](#estrutura-de-pastas)
10. [Funcionalidades implementadas](#funcionalidades-implementadas)
11. [Papéis e permissões (RBAC)](#papéis-e-permissões-rbac)
12. [Migrations Prisma](#migrations-prisma)
13. [Testes](#testes)
14. [Deploy em produção](#deploy-em-produção)
15. [Backups](#backups)
16. [Roadmap & melhorias recomendadas](#roadmap--melhorias-recomendadas)
17. [Limitações conhecidas](#limitações-conhecidas)
18. [Troubleshooting](#troubleshooting)
19. [Suporte](#suporte)

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
| `FEATURE_READER_AREA`     |   | Interruptor do lado do servidor para a área de leitores. Sem prefixo `NEXT_PUBLIC_` de propósito — toda a rota de leitores devolve 404 enquanto não for `true` |
| `READER_JWT_SECRET`       | ✓ se a área de leitores estiver ligada | **Mínimo 32 chars, TEM de ser diferente de `JWT_SECRET`** — o boot recusa arrancar se forem iguais |
| `FEATURE_PAYWALL`         |   | Decide se "Conteúdo Exclusivo" retém mesmo o texto. `false` por omissão |
| `STRIPE_SECRET_KEY`       |   | **A presença desta chave É o interruptor** das assinaturas pagas — sem ela o checkout devolve 503 e o webhook responde 200 a dizer que ignorou. Não há flag à parte. Ver [guia do Stripe](#configurar-o-stripe-passo-a-passo) abaixo |
| `STRIPE_WEBHOOK_SECRET`   | ✓ se `STRIPE_SECRET_KEY` estiver definida | Assina os eventos recebidos do Stripe |
| `STRIPE_PRICE_ID`         | ✓ se `STRIPE_SECRET_KEY` estiver definida | Id do preço recorrente no catálogo do Stripe |
| `GOOGLE_CLIENT_ID/SECRET` |   | Login social de leitores via Google. Deixe em branco para desligar |
| `FACEBOOK_APP_ID/SECRET`  |   | Login social de leitores via Facebook. Deixe em branco para desligar |
| `MAIL_DRIVER`             |   | `log` (default, escreve no log da app), `resend` ou `smtp` |

### `frontend/.env`

| Variável                  | Descrição |
| ------------------------- | --- |
| `PORT`                    | Porto do Next (3005) |
| `NEXT_PUBLIC_API_URL`     | URL **público** do API (usado pelo browser) |
| `INTERNAL_API_URL`        | URL **interno** do API (Server Components a chamar SSR) |
| `NEXT_PUBLIC_FEATURE_READER_AREA` | Mostra/esconde `/conta/*`. O backend tem a sua própria `FEATURE_READER_AREA` — as duas têm de estar ligadas |
| `NEXT_PUBLIC_FEATURE_BILLING`     | Mostra "Assinar agora" em vez da página "em preparação". Só faz sentido ligada se o backend também tiver `STRIPE_SECRET_KEY` configurada |
| `NEXT_PUBLIC_FEATURE_*`   | Restantes feature flags da UI pública (comments, audio reader, etc.) |

> Nota importante para quem mexe nestas variáveis com os containers já a
> correr: **`docker compose restart` não relê o `.env`** — o ambiente do
> container é fixado no momento em que é criado. Depois de editar o
> `.env`, use `docker compose up -d <serviço>`, que recria o container
> com os valores novos.

---

## Configurar o Stripe (passo a passo)

As assinaturas pagas usam o Stripe. Sem `STRIPE_SECRET_KEY` no
`backend/.env`, o site funciona normalmente e ninguém é cobrado — o
botão de assinar simplesmente não aparece (ou mostra a página "em
preparação", consoante `NEXT_PUBLIC_FEATURE_BILLING`).

### 1. Modo de teste

No [dashboard do Stripe](https://dashboard.stripe.com), confirme que o
interruptor **"Modo de teste"** está ligado (canto superior). Faça tudo
o que se segue em modo de teste primeiro — usa cartões falsos, zero
dinheiro real.

### 2. Criar o produto e o preço

Menu lateral → **Catálogo de produtos** → **Adicionar produto**. Dê-lhe
um nome (ex: "Assinatura Premium") e um **preço recorrente** (mensal ou
anual). Depois de gravar, copie o **id do preço** — começa por
`price_...` (não confundir com o id do produto, que começa por
`prod_...`). Isto vai para `STRIPE_PRICE_ID`.

### 3. Apanhar a chave secreta

Menu lateral → **Desenvolvedores** → **Chaves de API** → copie a
**Chave secreta** (`sk_test_...` em modo de teste, `sk_live_...` em
produção). Isto vai para `STRIPE_SECRET_KEY`.

### 4. Criar o webhook

**Em produção**, com um domínio público:

Ainda em **Desenvolvedores** → **Webhooks** → **Adicionar endpoint** (o
ecrã pode aparecer como "Criar destino de eventos", consoante a versão
da interface):
- **URL**: `https://<o-seu-domínio>/public/stripe/webhook`
- **Eventos a escutar** — adicione exactamente estes quatro:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Depois de criado, abra o webhook e copie o **Signing secret**
(`whsec_...`). Isto vai para `STRIPE_WEBHOOK_SECRET`.

**Em desenvolvimento local**, o Stripe não consegue alcançar
`localhost` para lhe entregar eventos — o ecrã acima não serve. Use o
**Stripe CLI** em vez disso:

```bash
# instalar (uma vez só)
winget install --id Stripe.StripeCli -e

# autenticar (abre o browser para autorizar a sua conta Stripe)
stripe login

# encaminhar eventos para a API local — deixe esta janela aberta
# enquanto estiver a testar
stripe listen --forward-to localhost:8585/public/stripe/webhook
```

O `stripe listen` imprime um `whsec_...` novo **de cada vez que
arranca** — copie-o para `STRIPE_WEBHOOK_SECRET` sempre que reiniciar o
comando. O script [`scripts/stripe-dev.ps1`](scripts/stripe-dev.ps1)
(Windows) faz isto automaticamente: abre o `stripe listen` numa janela
própria, apanha o secret novo, actualiza o `backend/.env` e recria o
container da API — bastando correr:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stripe-dev.ps1
```

### 5. Preencher os `.env` e reiniciar

No `backend/.env`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
FEATURE_PAYWALL=true
```

No `frontend/.env`:

```bash
NEXT_PUBLIC_FEATURE_BILLING=true
```

Depois:

```bash
docker compose up -d api web
```

(lembre-se: `restart` não chega, tem de ser `up -d` para reler o `.env`)

### 6. Testar

Cartão de teste `4242 4242 4242 4242`, qualquer data futura, qualquer
CVC. Percorra o ciclo completo: assinar → ler um artigo exclusivo →
gerir/cancelar assinatura → confirmar que continua a ler até ao fim do
período pago. Tudo sem dinheiro real.

### 7. Passar para produção

Repita os passos 1–4 com o interruptor **"Modo de teste" desligado** no
Stripe (chaves `sk_live_...`, novo webhook apontando para o domínio
real) e troque os três valores no `.env` de produção.

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
- **Dashboard** — stats globais (artigos publicados, visitas hoje/semana/mês, utilizadores), painel de assinaturas (activas, novas no período, a expirar em 30 dias — cada número liga à lista filtrada), feed de actividade
- **Artigos** — CRUD completo, workflow EM_REVISAO → AGENDADO → PUBLICADO → ARQUIVADO, editor Tiptap com autosave, agendamento com cron, interruptor "Conteúdo Exclusivo" (paywall)
- **Categorias** — hierárquicas (4 níveis: categoria → subcategoria → tópico → subtópico), arrastar-e-largar para reordenar e mudar de pai
- **Utilizadores** — convite, papéis, reset de password (apenas Super/Editor-Chefe), suspensão
- **Leitores** — página própria (`/admin/leitores`) com pesquisa e filtro por plano/estado, banimento por 15 dias, 30 dias ou definitivo (expira sozinho, sem cron), oferta manual de assinatura com data de fim
- **Mídia** — **biblioteca por pessoa**: cada jornalista/editor vê só o que carregou; só o SUPER_ADMIN vê a de toda a gente (`?scope=todas`). Ficheiros nascem **privados** e tornam-se públicos automaticamente quando usados num artigo publicado ou anúncio activo — o endereço nunca muda. Imagem (até 10 MB, GIF animado até 15 MB/300 frames, mantendo a animação) e vídeo (MP4/H.264 ou WebM, até 100 MB / 5 min / 1080p, com miniatura automática por `ffprobe`). Quota de 2 GB por utilizador. Tipo do ficheiro decidido pelos bytes, não pelo cabeçalho enviado
- **Publicidade** — 11 slots IAB-standard (Billboard 970×250, MPU 300×250, Leaderboard 728×90, etc.), modo Imagem ou Código HTML/iframe. As imagens de banners ficam **fora** da biblioteca de Mídia (não gastam a quota de ninguém) e têm eliminação **permanente e imediata** própria, com confirmação e permissão dedicada (`publicidade.eliminar_imagem`)
- **Newsletter** — listagem de subscritores, exportação CSV e XLSX
- **Configurações** — geral, email, SEO, redes sociais (aparecem no footer), segurança, newsletter
- **Perfil** — alterar nome/bio/telefone, upload de avatar (privado), trocar password, preferências de notificação
- **Permissões** — editor da matriz RBAC (equipa) + matriz de planos GRATIS/PREMIUM (leitores)

### Área de leitores e assinaturas (`/conta`)
- Registo, login (email/password + Google/Facebook), verificação de email, recuperação de password
- Paywall: artigo marcado "Conteúdo Exclusivo" mostra um resumo a quem não é assinante — **o resto do texto nunca chega ao browser**, cortado no servidor. JSON-LD com `isAccessibleForFree` para não ser penalizado como *cloaking*
- Assinatura via **Stripe** (checkout + portal do cliente) ou oferecida manualmente por um administrador
- `/conta/assinatura` — estado do plano, data de renovação, gerir/cancelar
- Comentários (limite de 280 caracteres), favoritos, seguir categorias com notificação por email
- Leitor banido é bloqueado no login e sabe até quando

### Site público
- Homepage com hero + side stack + últimas notícias + investigação + sidebar
- Páginas de artigo com caixas estruturadas (Essencial, Contexto, Citação destacada)
- Páginas de categoria com paginação e afunilamento hierárquico (abrir "Portugal" mostra também o Funchal)
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

### Primeiro deploy em produção — bootstrap automático do super admin

Antes de qualquer das receitas abaixo, é importante perceber o **fluxo de
arranque inicial**: na primeira vez que o backend arranca em produção, ele
detecta automaticamente que a base de dados está vazia e **cria o
SUPER_ADMIN inicial a partir do `.env`**. Não há comandos manuais a correr.

**Como funciona:**

```
1. docker compose up -d
2. backend arranca em modo prod
3. Executa: prisma migrate deploy        ← tabelas criadas
4. Executa: bootstrapInitialAdmin()      ← lógica em src/bootstrap-admin.ts
   ├─ Verifica: userCount + articleCount + activityLogCount === 0?
   ├─ Sim → cria SUPER_ADMIN com SUPERADMIN_EMAIL/PASSWORD do .env
   ├─       popula matriz de permissões (7 papéis × 31 permissões)
   ├─       loga "✓ INITIAL BOOTSTRAP COMPLETE — created SUPER_ADMIN..."
   └─ Não  → não faz nada (a "janela de bootstrap" fechou-se permanentemente)
5. App.listen() — API começa a aceitar pedidos
```

**Validações que o bootstrap faz antes de criar o admin (caso contrário falha boot):**

- `SUPERADMIN_EMAIL` válido (regex `*@*.*`)
- `SUPERADMIN_PASSWORD` tem pelo menos **12 caracteres**
- Password não contém valores comuns/exemplo (`admin`, `password`, `changeme`,
  `patriotaadmin!2025`, etc.) — força o cliente a escolher uma password real

**O que NÃO se faz em produção:**

- ❌ Correr `prisma db seed` (refusa-se a executar com `NODE_ENV=production`)
- ❌ Criar utilizadores demo (`editor.chefe@...`, `jorn1@...`)
- ❌ Criar artigos demo

Resultado: **base de dados limpa, só com o admin do cliente**. As categorias
e ads default são criados via outros mecanismos (`AdsModule.onModuleInit`
cria os 10 slots de publicidade idempotentemente; categorias têm de ser
criadas pelo admin via `/admin/categorias`).

> **Self-healing:** se algum acidente esvaziar completamente as 3 tabelas-
> guardas (users, articles, activity_logs), o próximo restart vai recriar
> o admin do `.env`. Útil em recuperação de desastres.

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

# 3. Configurar .env de produção
# IMPORTANTE: cumprir os requisitos validados pelo bootstrap:
#   - SUPERADMIN_PASSWORD: ≥12 caracteres, sem palavras comuns
#   - JWT_SECRET: gerar com `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
#   - CORS_ORIGIN: domínio real
#   - NODE_ENV=production
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
nano backend/.env       # preencher TODOS os valores
nano frontend/.env

# Permissões restritivas para o .env (só dono lê)
chmod 600 backend/.env frontend/.env

# 4. Construir imagens de produção
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# 5. Subir
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 6. Verificar bootstrap (procurar "INITIAL BOOTSTRAP COMPLETE" no log)
docker compose logs api | grep -i bootstrap

# Output esperado:
#   ⚠ DATABASE IS EMPTY — bootstrapping initial SUPER_ADMIN from .env
#   ✓ INITIAL BOOTSTRAP COMPLETE — created SUPER_ADMIN <admin@cliente.pt>.
#     Log in at /admin/login and change the password from /admin/perfil.

# 7. Smoke test
curl http://localhost:8585/public/categories
curl http://localhost:3005/

# 8. Login
# Browser → https://cliente.pt/admin/login
# Email: o que pôs em SUPERADMIN_EMAIL
# Password: o que pôs em SUPERADMIN_PASSWORD
# ⚠ Primeira coisa a fazer: ir a /admin/perfil → Segurança → alterar password
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

**Antes do `docker compose up` em produção:**

- [ ] `NODE_ENV=production` definido
- [ ] `JWT_SECRET` gerado aleatoriamente, ≥ 32 chars, **NÃO** valor de exemplo
- [ ] `SUPERADMIN_EMAIL` é o endereço real do administrador do cliente
- [ ] `SUPERADMIN_PASSWORD` cumpre **todos**:
  - [ ] ≥ 12 caracteres
  - [ ] Não contém palavras comuns (`admin`, `password`, `changeme`, etc. — bootstrap recusa)
  - [ ] Misturado: maiúsculas, minúsculas, números, símbolos
- [ ] `CORS_ORIGIN` aponta apenas para o domínio de produção
- [ ] `DATABASE_URL` aponta para Postgres com password forte
- [ ] `backend/.env` e `frontend/.env` com `chmod 600`
- [ ] Postgres com backups automáticos (ver [Backups](#backups))
- [ ] DNS configurado (A record para domínio principal + subdomínio API se separado)
- [ ] HTTPS activo (Let's Encrypt via Caddy/Nginx)

**Logo após o primeiro `docker compose up`:**

- [ ] Verificar bootstrap no log (`docker compose logs api | grep BOOTSTRAP`)
- [ ] Fazer login em `/admin/login` com as credenciais do `.env`
- [ ] **Alterar a password** em `/admin/perfil › Segurança` (a do `.env` fica "queimada")
- [ ] Convidar a equipa real em `/admin/utilizadores` (cada um com a própria password)
- [ ] Criar categorias em `/admin/categorias`
- [ ] Activar slots de publicidade em `/admin/publicidade`
- [ ] Configurar redes sociais em `/admin/configuracoes › Redes`
- [ ] Tag ERC actualizada em `/p/erc` (via `static-pages.ts` ou conteúdo editável futuro)
- [ ] Páginas de Termos / Privacidade revistas por advogado
- [ ] Logo e favicon actualizados em `frontend/public/brand/`
- [ ] Testes a passar antes do deploy: `npm test && npm run test:e2e`

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

#### 8. ~~Auth de leitores (paywall / subscrição)~~ — implementado

Área de leitores completa (`/conta`), paywall com Stripe Billing, modelo
`Reader` separado de `User`, e o corte de conteúdo aplicado no servidor.
Ver [Funcionalidades implementadas](#funcionalidades-implementadas) e
[Configurar o Stripe](#configurar-o-stripe-passo-a-passo).

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
| 2FA | UI existe, lógica não |
| Sessões (staff) | JWT sem refresh-token; "terminar sessões" não funciona. Os leitores NÃO têm este problema: `Reader.tokenVersion` revoga todas as sessões |
| Whitelist de IPs | Campo nas settings é cosmético |
| reCAPTCHA | Idem |
| Login social | Código pronto; inerte até haver credenciais Google/Meta. O App Review da Meta demora dias |
| Pesquisa | ILIKE simples; sem ranking |
| Uploads | Em volume local; perde-se em hosts efémeros. Ver roadmap #1 |
| Importação | Não há importer de artigos de outras plataformas |
| Multi-idioma | Só PT-PT |
| Publicação | `PATCH /admin/articles/:id` aceita `status` sem verificar `artigos.publicar` — um JORNALISTA consegue auto-publicar-se. Bug pré-existente, por corrigir |

### Resolvido na área de leitores (branch `feat/area-leitores`)

Estas linhas estavam na tabela acima e deixaram de se aplicar:

| Área | Estado |
| --- | --- |
| Email | Sai a sério. `MailerModule` com drivers `log` / `resend` / `smtp`, escolhidos por `MAIL_DRIVER`. Verificação de conta, reposição de palavra-passe e digests de categoria |
| Comentários | Modelo, moderação em `/admin/comentarios`, thread renderizada no servidor, texto simples (sem XSS), contador desnormalizado |
| Contas de leitor | Registo, login, favoritos, histórico e notificações, com isolamento total do staff — chave de assinatura distinta, claim `typ`, tabela distinta, propriedade distinta no request |

### Resolvido nas assinaturas e na média por utilizador

| Área | Estado |
| --- | --- |
| Paywall | `Article.exclusive` bloqueia o conteúdo a sério — cortado no servidor, nunca chega ao browser de quem não é assinante |
| Billing | Stripe: checkout, portal do cliente, webhooks idempotentes. Ver [Configurar o Stripe](#configurar-o-stripe-passo-a-passo) |
| Moderação de leitores | Banimento por 15/30 dias ou definitivo, expira por data sem precisar de cron |
| Biblioteca de mídia | Deixou de ser partilhada — cada pessoa vê só o que carregou. Ficheiros privados até serem publicados, quota de 2 GB, vídeo com miniatura |
| Publicidade | Imagens de banners saíram da biblioteca de Mídia, com eliminação permanente própria |

---

## Troubleshooting

### "Backend não arranca, erro `JWT_SECRET must be defined`"
Faltam variáveis de ambiente. `cp backend/.env.example backend/.env` e
preencher.

### "API não arranca: `READER_JWT_SECRET must be defined`"

A área de leitores exige uma chave de assinatura **diferente** da do
staff, e a aplicação recusa-se a arrancar sem ela ou se for igual à
`JWT_SECRET`. É deliberado: com uma só chave, um esquecimento em qualquer
guard passa a valer um token de leitor aceite numa rota de administração.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Cole o resultado em `READER_JWT_SECRET` no `backend/.env`.

### "Mudei o `.env` e nada mudou"

`docker compose restart` **não relê o `env_file`**. Para variáveis novas
tem de recriar o container:

```bash
docker compose up -d --force-recreate api
```

### "Instalei um pacote e o container diz `Cannot find module`"

O `node_modules` **não** é bind-mounted em nenhum dos dois serviços —
vive na camada da imagem. Um `npm install` feito no host (ou dentro de
um container a correr, que se perde na próxima recriação) é invisível.

Depois de mexer no `package.json`, reconstrua o serviço em causa:

```bash
# backend
docker compose build api && docker compose up -d --force-recreate api

# frontend
docker compose build web && docker compose up -d --force-recreate web
```

No frontend nem o `package.json` está montado (só `src`, `public` e as
configs), por isso o rebuild é sempre obrigatório.

### "Criei uma página nova no frontend e dá 404"

O Turbopack não deteta **ficheiros novos** através do bind mount do
Docker em Windows — não chegam eventos inotify. Editar ficheiros
existentes recarrega normalmente; criar rotas novas obriga a:

```bash
docker compose restart web
```

### "Erro de hidratação numa data"

Formatar `new Date()` sem `timeZone` usa a timezone do *runtime*, e há
dois: o container corre UTC, o browser do leitor corre a hora local
dele. Fixe sempre a timezone ao formatar o "agora" em código que corre
nos dois lados — ver `formatToday()` em `components/home/TopBar.tsx`.
Datas **vindas dos dados** não têm este problema: ambos os lados
formatam o mesmo instante.

### "Os e-mails não chegam"

Por omissão `MAIL_DRIVER=log`: as mensagens vão para os logs da API em
vez de saírem. É intencional, para que um clone novo e os testes
funcionem sem credenciais. Para ver a ligação de confirmação de um
registo:

```bash
docker compose logs api --tail 40 | grep -A12 "Mailer:log"
```

Para enviar a sério, ponha `MAIL_DRIVER=resend` e `RESEND_API_KEY`, e
garanta que o `fromEmail` está num domínio verificado no Resend — caso
contrário todos os envios voltam com 403.

### "Os leitores não recebem a notificação de notícia nova"

Três interruptores em série, por esta ordem:

1. `FEATURE_READER_AREA=true` no `backend/.env`
2. `settings.email.emailArticlePublished` — em `/admin/configuracoes ›
   Email`. **Vem desligado por omissão**: é a redação que opta por
   ativar
3. O leitor tem de seguir a categoria com `notify` ligado, ter o e-mail
   confirmado e não estar em `digestFrequency: NUNCA`

O enfileiramento corre de minuto a minuto; o envio depende da cadência
do leitor (imediato = 5/5 min, diário = 08:00 de Lisboa). Para
diagnosticar:

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
  'SELECT status, attempts, "lastError" FROM "ArticleNotification";'
```

### "Os botões de login social não aparecem"

É o comportamento correto quando não há credenciais.
`GET /public/reader/auth/providers` devolve apenas os fornecedores que
têm **id e secret** definidos, e a página de login desenha os botões a
partir dessa lista. Sem credenciais: lista vazia, sem botões, e as rotas
de início dão 404.

Note que o Facebook exige **App Review da Meta** para pedir o e-mail em
produção, o que demora dias. Em modo de desenvolvimento funciona logo,
mas só para contas listadas como testers na app.

### "Login retorna 401 mesmo com a password certa"

**Em dev:** o seed só corre uma vez. Se mudou `SUPERADMIN_PASSWORD` depois
do primeiro boot, a BD ainda tem o hash antigo. Reset:
```bash
docker compose exec api npx prisma db seed
```

**Em produção:** o bootstrap também só corre uma vez (intencionalmente — ver
[Primeiro deploy](#primeiro-deploy-em-produção--bootstrap-automático-do-super-admin)).
Se perdeu a password do admin, **NÃO** corra o seed (refusa-se a executar
em prod). Em vez disso:

1. Faça login com outro utilizador SUPER_ADMIN se houver
2. Vá a `/admin/utilizadores`, reset da password ao admin afectado
3. **Se não houver outro SUPER_ADMIN**, recurso de último caso:
   ```bash
   # Gerar hash da nova password
   docker compose exec api node -e \
     "console.log(require('bcryptjs').hashSync('NovaPasswordForte!2026', 12))"

   # Atualizar directamente no Postgres
   docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c \
     "UPDATE \"User\" SET password='<HASH_AQUI>' WHERE email='admin@cliente.pt';"
   ```

### "Bootstrap aborted: SUPERADMIN_PASSWORD must be at least 12 characters"

O bootstrap recusa criar um admin com password fraca. Edite o `.env`,
ponha uma password ≥ 12 chars sem palavras comuns, e restart:
```bash
nano backend/.env
docker compose restart api
```

### "Como faço backup do admin antes de mexer no servidor?"

O admin está apenas no Postgres — basta `pg_dump`. Ver [Backups](#backups).

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
