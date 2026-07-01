# Nexora Platform

Nexora is an AI automation request platform. A customer describes an automation, shapes a demonstrational n8n-style graph, chats with an LLM, then submits the request. The backend stores the graph, creates an admin notification, and sends an email to configured operators.

## Stack

- Frontend: Next.js 16, React 19, TypeScript, `@xyflow/react`
- Backend: Go, Chi HTTP router, PostgreSQL, Valkey, Gemini API, SMTP
- Infra: Docker Compose with Postgres, Valkey, backend and frontend services
- Payments: provider interface and checkout intent endpoint ready for a future MoR

## Local Environment

Copy `.env.example` to `.env` and fill secrets. A local `.env` is already ignored by git.

Important variables:

- `GEMINI_API_KEY`: Gemini API key for AI chat
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_APP_PASSWORD`, `SMTP_FROM`, `SMTP_ADMIN_RECIPIENTS`: Gmail SMTP delivery
- `ADMIN_API_TOKEN`: bearer token for `/api/v1/admin/*`
- `PAYMENT_PROVIDER`: currently `unselected`; replace when MoR is selected

## Run With Docker

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/healthz`
- Postgres: `localhost:5432`
- Valkey: `localhost:6379`

## Local Frontend Only

```bash
cd frontend
npm install
npm run dev
```

## Backend API

Public endpoints:

- `GET /healthz`
- `POST /api/v1/automation-requests`
- `POST /api/v1/ai/chat`
- `POST /api/v1/payments/checkout-intents`

Admin endpoints require:

```http
Authorization: Bearer <ADMIN_API_TOKEN>
```

- `GET /api/v1/admin/automation-requests`

## Security Notes

- Secrets are read only from environment variables.
- Admin APIs use bearer-token authorization.
- HTTP security headers, CORS allowlist, request size limits, panic recovery and IP rate limiting are enabled in the backend.
- Graph submissions are stored as JSONB; no user-supplied HTML is rendered by the frontend.
