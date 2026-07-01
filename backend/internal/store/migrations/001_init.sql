CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS automation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_kind TEXT NOT NULL,
    icon_value TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_company TEXT NOT NULL DEFAULT '',
    graph JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_requests_created_at_idx
    ON automation_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS automation_requests_status_idx
    ON automation_requests (status);

CREATE TABLE IF NOT EXISTS admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_request_id UUID NOT NULL REFERENCES automation_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
    ON admin_notifications (created_at DESC);
