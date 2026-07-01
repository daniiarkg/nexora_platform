package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrDuplicateEmail     = errors.New("email already exists")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid or expired token")
	ErrSessionNotFound    = errors.New("session not found")
)

type CreateUserInput struct {
	Email         string
	FirstName     string
	LastName      string
	Company       string
	Phone         string
	PasswordHash  string
	EmailVerified bool
}

type AccessKeySeed struct {
	Label     string
	TokenHash string
}

func (s *Store) CreateUser(ctx context.Context, input CreateUserInput) (models.User, error) {
	var verifiedAt any
	if input.EmailVerified {
		verifiedAt = time.Now().UTC()
	}

	var user models.User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (
			email, first_name, last_name, company, phone, password_hash, email_verified_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id::text, email, first_name, last_name, company, phone,
			password_hash, email_verified_at, created_at, updated_at
	`,
		input.Email,
		input.FirstName,
		input.LastName,
		input.Company,
		input.Phone,
		input.PasswordHash,
		verifiedAt,
	).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return models.User{}, ErrDuplicateEmail
		}
		return models.User{}, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (models.User, error) {
	return s.getUser(ctx, `lower(email) = lower($1)`, email)
}

func (s *Store) GetUserByID(ctx context.Context, id string) (models.User, error) {
	return s.getUser(ctx, `id = $1`, id)
}

func (s *Store) getUser(ctx context.Context, where string, arg any) (models.User, error) {
	var user models.User
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, first_name, last_name, company, phone,
			password_hash, email_verified_at, created_at, updated_at
		FROM users
		WHERE `+where,
		arg,
	).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrInvalidCredentials
		}
		return models.User{}, fmt.Errorf("get user: %w", err)
	}
	return user, nil
}

func (s *Store) MarkUserEmailVerified(ctx context.Context, userID string) (models.User, error) {
	var user models.User
	err := s.pool.QueryRow(ctx, `
		UPDATE users
		SET email_verified_at = COALESCE(email_verified_at, now()),
			updated_at = now()
		WHERE id = $1
		RETURNING id::text, email, first_name, last_name, company, phone,
			password_hash, email_verified_at, created_at, updated_at
	`, userID).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return models.User{}, fmt.Errorf("mark email verified: %w", err)
	}
	return user, nil
}

func (s *Store) UpdateUserPassword(ctx context.Context, userID string, passwordHash string) error {
	cmd, err := s.pool.Exec(ctx, `
		UPDATE users
		SET password_hash = $2,
			updated_at = now()
		WHERE id = $1
	`, userID, passwordHash)
	if err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return ErrInvalidCredentials
	}
	return nil
}

func (s *Store) CreateAuthToken(ctx context.Context, userID string, purpose string, tokenHash string, expiresAt time.Time) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin token tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE auth_tokens
		SET used_at = now()
		WHERE user_id = $1
			AND purpose = $2
			AND used_at IS NULL
	`, userID, purpose); err != nil {
		return fmt.Errorf("invalidate old tokens: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
	`, userID, purpose, tokenHash, expiresAt); err != nil {
		return fmt.Errorf("create auth token: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit token tx: %w", err)
	}
	return nil
}

func (s *Store) ConsumeAuthToken(ctx context.Context, purpose string, tokenHash string) (models.User, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return models.User{}, fmt.Errorf("begin consume token tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var tokenID string
	var user models.User
	err = tx.QueryRow(ctx, `
		SELECT t.id::text, u.id::text, u.email, u.first_name, u.last_name,
			u.company, u.phone, u.password_hash, u.email_verified_at,
			u.created_at, u.updated_at
		FROM auth_tokens t
		JOIN users u ON u.id = t.user_id
		WHERE t.token_hash = $1
			AND t.purpose = $2
			AND t.used_at IS NULL
			AND t.expires_at > now()
		FOR UPDATE OF t
	`, tokenHash, purpose).Scan(
		&tokenID,
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrInvalidToken
		}
		return models.User{}, fmt.Errorf("select auth token: %w", err)
	}

	if _, err := tx.Exec(ctx, `UPDATE auth_tokens SET used_at = now() WHERE id = $1`, tokenID); err != nil {
		return models.User{}, fmt.Errorf("mark token used: %w", err)
	}
	if purpose == "email_confirmation" {
		err = tx.QueryRow(ctx, `
			UPDATE users
			SET email_verified_at = COALESCE(email_verified_at, now()),
				updated_at = now()
			WHERE id = $1
			RETURNING id::text, email, first_name, last_name, company, phone,
				password_hash, email_verified_at, created_at, updated_at
		`, user.ID).Scan(
			&user.ID,
			&user.Email,
			&user.FirstName,
			&user.LastName,
			&user.Company,
			&user.Phone,
			&user.PasswordHash,
			&user.EmailVerifiedAt,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			return models.User{}, fmt.Errorf("verify user email: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return models.User{}, fmt.Errorf("commit consume token tx: %w", err)
	}
	return user, nil
}

func (s *Store) CreateSession(ctx context.Context, userID string, tokenHash string, userAgent string, ipAddress string, expiresAt time.Time) error {
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO user_sessions (user_id, token_hash, user_agent, ip_address, expires_at)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, tokenHash, userAgent, ipAddress, expiresAt); err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

func (s *Store) GetUserBySessionTokenHash(ctx context.Context, tokenHash string) (models.User, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return models.User{}, fmt.Errorf("begin session tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var sessionID string
	var user models.User
	err = tx.QueryRow(ctx, `
		SELECT s.id::text, u.id::text, u.email, u.first_name, u.last_name,
			u.company, u.phone, u.password_hash, u.email_verified_at,
			u.created_at, u.updated_at
		FROM user_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1
			AND s.revoked_at IS NULL
			AND s.expires_at > now()
	`, tokenHash).Scan(
		&sessionID,
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrSessionNotFound
		}
		return models.User{}, fmt.Errorf("get session: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE user_sessions SET last_seen_at = now() WHERE id = $1`, sessionID); err != nil {
		return models.User{}, fmt.Errorf("touch session: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return models.User{}, fmt.Errorf("commit session tx: %w", err)
	}
	return user, nil
}

func (s *Store) RevokeSession(ctx context.Context, tokenHash string) error {
	if tokenHash == "" {
		return nil
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE user_sessions
		SET revoked_at = now()
		WHERE token_hash = $1
			AND revoked_at IS NULL
	`, tokenHash); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

func (s *Store) UpsertGoogleUser(ctx context.Context, profile models.GoogleProfile) (models.User, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return models.User{}, fmt.Errorf("begin oauth tx: %w", err)
	}
	defer tx.Rollback(ctx)

	user, err := scanOAuthUser(ctx, tx, profile.ProviderUserID)
	if err == nil {
		if _, err := tx.Exec(ctx, `
			UPDATE oauth_accounts
			SET email = $2,
				updated_at = now()
			WHERE provider = 'google'
				AND provider_user_id = $1
		`, profile.ProviderUserID, profile.Email); err != nil {
			return models.User{}, fmt.Errorf("update oauth account: %w", err)
		}
		if profile.EmailVerified && user.EmailVerifiedAt == nil {
			user, err = updateUserVerifiedInTx(ctx, tx, user.ID)
			if err != nil {
				return models.User{}, err
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return models.User{}, fmt.Errorf("commit oauth tx: %w", err)
		}
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return models.User{}, fmt.Errorf("find oauth user: %w", err)
	}

	user, err = scanUserByEmailInTx(ctx, tx, profile.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		var verifiedAt any
		if profile.EmailVerified {
			verifiedAt = time.Now().UTC()
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO users (
				email, first_name, last_name, company, phone, password_hash, email_verified_at
			)
			VALUES ($1, $2, $3, '', '', '', $4)
			RETURNING id::text, email, first_name, last_name, company, phone,
				password_hash, email_verified_at, created_at, updated_at
		`, profile.Email, profile.FirstName, profile.LastName, verifiedAt).Scan(
			&user.ID,
			&user.Email,
			&user.FirstName,
			&user.LastName,
			&user.Company,
			&user.Phone,
			&user.PasswordHash,
			&user.EmailVerifiedAt,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			return models.User{}, fmt.Errorf("create oauth user: %w", err)
		}
	} else if err != nil {
		return models.User{}, fmt.Errorf("find user by oauth email: %w", err)
	} else if profile.EmailVerified && user.EmailVerifiedAt == nil {
		user, err = updateUserVerifiedInTx(ctx, tx, user.ID)
		if err != nil {
			return models.User{}, err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
		VALUES ($1, 'google', $2, $3)
		ON CONFLICT (provider, provider_user_id)
		DO UPDATE SET user_id = EXCLUDED.user_id,
			email = EXCLUDED.email,
			updated_at = now()
	`, user.ID, profile.ProviderUserID, profile.Email); err != nil {
		return models.User{}, fmt.Errorf("insert oauth account: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return models.User{}, fmt.Errorf("commit oauth tx: %w", err)
	}
	return user, nil
}

func (s *Store) AuthenticateAccessKey(ctx context.Context, tokenHash string) (models.User, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return models.User{}, fmt.Errorf("begin access key tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var keyID string
	var label string
	var userID sql.NullString
	err = tx.QueryRow(ctx, `
		SELECT id::text, label, user_id::text
		FROM access_keys
		WHERE token_hash = $1
			AND revoked_at IS NULL
			AND (expires_at IS NULL OR expires_at > now())
		FOR UPDATE
	`, tokenHash).Scan(&keyID, &label, &userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrInvalidCredentials
		}
		return models.User{}, fmt.Errorf("find access key: %w", err)
	}

	var user models.User
	if userID.Valid {
		user, err = scanUserByIDInTx(ctx, tx, userID.String)
		if err != nil {
			return models.User{}, fmt.Errorf("load access key user: %w", err)
		}
	} else {
		userEmail := fmt.Sprintf("access-%s@nexora.local", strings.ReplaceAll(keyID[:8], "-", ""))
		err = tx.QueryRow(ctx, `
			INSERT INTO users (
				email, first_name, last_name, company, phone, password_hash, email_verified_at
			)
			VALUES ($1, 'Access', 'Key', $2, '', '', now())
			RETURNING id::text, email, first_name, last_name, company, phone,
				password_hash, email_verified_at, created_at, updated_at
		`, userEmail, label).Scan(
			&user.ID,
			&user.Email,
			&user.FirstName,
			&user.LastName,
			&user.Company,
			&user.Phone,
			&user.PasswordHash,
			&user.EmailVerifiedAt,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			return models.User{}, fmt.Errorf("create access key user: %w", err)
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE access_keys
		SET user_id = $2,
			last_used_at = now()
		WHERE id = $1
	`, keyID, user.ID); err != nil {
		return models.User{}, fmt.Errorf("mark access key used: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return models.User{}, fmt.Errorf("commit access key tx: %w", err)
	}
	return user, nil
}

func (s *Store) SeedAccessKeys(ctx context.Context, seeds []AccessKeySeed) error {
	for _, seed := range seeds {
		if strings.TrimSpace(seed.TokenHash) == "" {
			continue
		}
		label := strings.TrimSpace(seed.Label)
		if label == "" {
			label = "Bootstrap access key"
		}
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO access_keys (label, token_hash)
			VALUES ($1, $2)
			ON CONFLICT (token_hash) DO NOTHING
		`, label, seed.TokenHash); err != nil {
			return fmt.Errorf("seed access key: %w", err)
		}
	}
	return nil
}

func scanOAuthUser(ctx context.Context, tx pgx.Tx, providerUserID string) (models.User, error) {
	var user models.User
	err := tx.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.first_name, u.last_name, u.company, u.phone,
			u.password_hash, u.email_verified_at, u.created_at, u.updated_at
		FROM oauth_accounts a
		JOIN users u ON u.id = a.user_id
		WHERE a.provider = 'google'
			AND a.provider_user_id = $1
	`, providerUserID).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	return user, err
}

func scanUserByEmailInTx(ctx context.Context, tx pgx.Tx, email string) (models.User, error) {
	var user models.User
	err := tx.QueryRow(ctx, `
		SELECT id::text, email, first_name, last_name, company, phone,
			password_hash, email_verified_at, created_at, updated_at
		FROM users
		WHERE lower(email) = lower($1)
		FOR UPDATE
	`, email).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	return user, err
}

func scanUserByIDInTx(ctx context.Context, tx pgx.Tx, id string) (models.User, error) {
	var user models.User
	err := tx.QueryRow(ctx, `
		SELECT id::text, email, first_name, last_name, company, phone,
			password_hash, email_verified_at, created_at, updated_at
		FROM users
		WHERE id = $1
		FOR UPDATE
	`, id).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	return user, err
}

func updateUserVerifiedInTx(ctx context.Context, tx pgx.Tx, userID string) (models.User, error) {
	var user models.User
	err := tx.QueryRow(ctx, `
		UPDATE users
		SET email_verified_at = COALESCE(email_verified_at, now()),
			updated_at = now()
		WHERE id = $1
		RETURNING id::text, email, first_name, last_name, company, phone,
			password_hash, email_verified_at, created_at, updated_at
	`, userID).Scan(
		&user.ID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Company,
		&user.Phone,
		&user.PasswordHash,
		&user.EmailVerifiedAt,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		return models.User{}, fmt.Errorf("verify oauth user: %w", err)
	}
	return user, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
