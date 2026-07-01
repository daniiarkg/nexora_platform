# Nexora Architecture

## Product Flow

1. Customer opens the canvas and describes the desired business automation.
2. The UI creates a demonstrational graph. It is intentionally not executable.
3. Customer selects or uploads an icon and submits the request.
4. Backend validates and stores the graph in PostgreSQL.
5. Backend creates an admin notification and asynchronously sends an SMTP email.
6. Admin reviews requests through the protected admin API/UI.

## Backend

- Go HTTP API with bounded request bodies and server timeouts.
- PostgreSQL stores automation requests and notifications.
- Valkey stores short-lived AI chat logs and acts as a production-ready cache layer.
- Gemini is called through the REST API, with the model selected by `GEMINI_MODEL`.
- SMTP uses Gmail-compatible variables, including an app-password variable.

## Payments

Payments are intentionally represented through a provider interface. Until the MoR is selected, checkout intent requests return `provider_not_selected`. This keeps product code stable while allowing Lemon Squeezy, Paddle, Stripe MoR alternatives or another provider to be added behind one adapter.

## Security Baseline

- All secrets are environment variables.
- `.env` is gitignored; `.env.example` documents required keys.
- Admin routes require bearer auth.
- CORS uses `ALLOWED_ORIGINS`.
- Security headers are applied to all responses.
- User submissions are stored as structured JSON and rendered as text.
