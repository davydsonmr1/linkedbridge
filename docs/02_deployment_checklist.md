# 📋 Deployment Checklist — LinkedBridge

Este documento lista todos os passos necessários para colocar o LinkedBridge em produção.

---

## 1. Variáveis de Ambiente

Todas as variáveis abaixo são **obrigatórias** para o correto funcionamento.

| Variável | Tipo | Como Gerar | Exemplo |
|---|---|---|---|
| `DATABASE_URL` | Connection string | Painel do Supabase → Settings → Database | `postgresql://user:pass@host:5432/db?schema=public` |
| `ENCRYPTION_MASTER_KEY` | Base64 (32 bytes) | `openssl rand -base64 32` | `aBcD1234...==` |
| `NODE_ENV` | String | – | `production` |
| `PORT` | Number | – | `3333` |
| `LINKEDIN_CLIENT_ID` | String | LinkedIn Developer Console | `77abc123` |
| `LINKEDIN_CLIENT_SECRET` | String | LinkedIn Developer Console | `WPLs8...` |
| `LINKEDIN_REDIRECT_URI` | URL | LinkedIn Developer Console | `https://app.example.com/api/auth/linkedin/callback` |
| `CRON_SECRET_KEY` | Hex (32 bytes) | `openssl rand -hex 32` | `a1b2c3d4...` |
| `COOKIE_SECRET` | String | `openssl rand -hex 16` | `f1e2d3c4...` |

> **⚠️ IMPORTANTE:** Nunca commite o arquivo `.env` no repositório. Use o painel da plataforma de deploy (Vercel, Railway, etc.) para configurar as variáveis.

---

## 2. Comandos de Deploy

### Primeira vez (setup inicial)

```bash
# 1. Clone o repositório
git clone https://github.com/davydsonmr1/socialmedia-service.git
cd socialmedia-service

# 2. Instale dependências
npm install

# 3. Gere o Prisma Client
npx prisma generate

# 4. Execute as migrações no banco de produção
npm run db:migrate

# 5. Build do TypeScript
npm run build

# 6. Inicie o servidor
npm start
```

### Deploy subsequente

```bash
npm install
npx prisma generate
npm run db:migrate
npm run build
npm start
```

---

## 3. Supabase (PostgreSQL)

### Setup do banco

1. Acesse [Supabase Dashboard](https://app.supabase.com/)
2. Crie um novo projeto ou selecione o existente
3. Vá em **Settings → Database → Connection string → URI**
4. Copie a URI e configure como `DATABASE_URL`
5. Certifique-se de que o **pooler mode** está como `Transaction`

### Migrações

```bash
# Desenvolvimento (cria + aplica migração)
npm run prisma:migrate

# Produção (aplica migrações pendentes)
npm run db:migrate

# Visualizar dados (desenvolvimento apenas)
npm run prisma:studio
```

---

## 4. Vercel

### Deploy automático

1. Conecte o repositório GitHub no painel da Vercel
2. Configure as variáveis de ambiente na aba **Settings → Environment Variables**
3. O `vercel.json` já configura:
   - Build: `npm run build`
   - Install: `npm install && npx prisma generate`
   - Rewrites: todas as rotas → `dist/main/server.js`
   - Cron: sync a cada hora (`0 * * * *`)

### Cron Job

O cron da Vercel chamará `POST /api/internal/cron/sync` automaticamente.
A autenticação é feita via `CRON_SECRET_KEY` no header `Authorization: Bearer <key>`.

---

## 5. Verificação Pós-Deploy

```bash
# Health check
curl https://your-app.vercel.app/health

# Testar cron manualmente
curl -X POST https://your-app.vercel.app/api/internal/cron/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET_KEY"

# Testar API pública (com API Key)
curl https://your-app.vercel.app/api/v1/posts \
  -H "X-API-KEY: lb_live_your_api_key_here"
```

---

## 6. Checklist de Segurança

- [ ] `NODE_ENV=production` configurado
- [ ] `ENCRYPTION_MASTER_KEY` com 32 bytes de entropia
- [ ] `CRON_SECRET_KEY` com pelo menos 32 bytes de entropia
- [ ] HTTPS habilitado (Vercel faz automaticamente)
- [ ] Variáveis de ambiente **NÃO** commitadas no git
- [ ] Rate limiting ativo (100 req/min global, 60 req/min por API key)
- [ ] Pino redact configurado (tokens/PII nunca nos logs)
- [ ] Graceful Shutdown configurado (SIGINT/SIGTERM)
- [ ] Circuit Breaker no Gateway LinkedIn (5 falhas → 60s cooldown)
