package store

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 16
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) Health(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

func (s *Store) Migrate(ctx context.Context) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		sqlBytes, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if _, err := s.pool.Exec(ctx, string(sqlBytes)); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
	}
	return nil
}

func (s *Store) CreateAutomationRequest(ctx context.Context, input models.AutomationRequestInput) (models.AutomationRequest, error) {
	graphBytes, err := json.Marshal(input.Graph)
	if err != nil {
		return models.AutomationRequest{}, fmt.Errorf("marshal graph: %w", err)
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return models.AutomationRequest{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var req models.AutomationRequest
	var graphRaw []byte
	err = tx.QueryRow(ctx, `
		INSERT INTO automation_requests (
			title, description, icon_kind, icon_value,
			customer_name, customer_email, customer_company, graph
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id::text, title, description, icon_kind, icon_value,
			customer_name, customer_email, customer_company, graph,
			status, created_at, updated_at
	`,
		input.Title,
		input.Description,
		input.IconKind,
		input.IconValue,
		input.Customer.Name,
		input.Customer.Email,
		input.Customer.Company,
		graphBytes,
	).Scan(
		&req.ID,
		&req.Title,
		&req.Description,
		&req.IconKind,
		&req.IconValue,
		&req.Customer.Name,
		&req.Customer.Email,
		&req.Customer.Company,
		&graphRaw,
		&req.Status,
		&req.CreatedAt,
		&req.UpdatedAt,
	)
	if err != nil {
		return models.AutomationRequest{}, fmt.Errorf("insert automation request: %w", err)
	}
	if err := json.Unmarshal(graphRaw, &req.Graph); err != nil {
		return models.AutomationRequest{}, fmt.Errorf("unmarshal graph: %w", err)
	}

	notificationPayload, err := json.Marshal(map[string]string{
		"title":          req.Title,
		"customer_email": req.Customer.Email,
		"status":         req.Status,
	})
	if err != nil {
		return models.AutomationRequest{}, fmt.Errorf("marshal notification: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO admin_notifications (automation_request_id, event_type, payload)
		VALUES ($1, 'automation_request.created', $2)
	`, req.ID, notificationPayload); err != nil {
		return models.AutomationRequest{}, fmt.Errorf("insert admin notification: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return models.AutomationRequest{}, fmt.Errorf("commit transaction: %w", err)
	}
	return req, nil
}

func (s *Store) ListAutomationRequests(ctx context.Context, limit int, offset int) ([]models.AutomationRequest, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, title, description, icon_kind, icon_value,
			customer_name, customer_email, customer_company, graph,
			status, created_at, updated_at
		FROM automation_requests
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("query automation requests: %w", err)
	}
	defer rows.Close()

	requests := make([]models.AutomationRequest, 0)
	for rows.Next() {
		var req models.AutomationRequest
		var graphRaw []byte
		if err := rows.Scan(
			&req.ID,
			&req.Title,
			&req.Description,
			&req.IconKind,
			&req.IconValue,
			&req.Customer.Name,
			&req.Customer.Email,
			&req.Customer.Company,
			&graphRaw,
			&req.Status,
			&req.CreatedAt,
			&req.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan automation request: %w", err)
		}
		if err := json.Unmarshal(graphRaw, &req.Graph); err != nil {
			return nil, fmt.Errorf("unmarshal graph: %w", err)
		}
		requests = append(requests, req)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate automation requests: %w", err)
	}
	return requests, nil
}

func (s *Store) GetAutomationRequest(ctx context.Context, id string) (models.AutomationRequest, error) {
	var req models.AutomationRequest
	var graphRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, title, description, icon_kind, icon_value,
			customer_name, customer_email, customer_company, graph,
			status, created_at, updated_at
		FROM automation_requests
		WHERE id = $1
	`, id).Scan(
		&req.ID,
		&req.Title,
		&req.Description,
		&req.IconKind,
		&req.IconValue,
		&req.Customer.Name,
		&req.Customer.Email,
		&req.Customer.Company,
		&graphRaw,
		&req.Status,
		&req.CreatedAt,
		&req.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return models.AutomationRequest{}, fmt.Errorf("automation request not found")
		}
		return models.AutomationRequest{}, fmt.Errorf("get automation request: %w", err)
	}
	if err := json.Unmarshal(graphRaw, &req.Graph); err != nil {
		return models.AutomationRequest{}, fmt.Errorf("unmarshal graph: %w", err)
	}
	return req, nil
}

func NewID() string {
	return uuid.NewString()
}
