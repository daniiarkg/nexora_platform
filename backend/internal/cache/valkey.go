package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

func New(ctx context.Context, valkeyURL string) (*Client, error) {
	opts, err := redis.ParseURL(valkeyURL)
	if err != nil {
		return nil, fmt.Errorf("parse valkey url: %w", err)
	}
	rdb := redis.NewClient(opts)
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("ping valkey: %w", err)
	}
	return &Client{rdb: rdb}, nil
}

func (c *Client) Close() error {
	return c.rdb.Close()
}

func (c *Client) Health(ctx context.Context) error {
	return c.rdb.Ping(ctx).Err()
}

func (c *Client) AppendChatLog(ctx context.Context, sessionID string, messages []models.ChatMessage, answer string) error {
	if sessionID == "" {
		return nil
	}
	payload, err := json.Marshal(map[string]any{
		"messages": messages,
		"answer":   answer,
		"at":       time.Now().UTC(),
	})
	if err != nil {
		return fmt.Errorf("marshal chat log: %w", err)
	}

	key := "chat:" + sessionID
	pipe := c.rdb.TxPipeline()
	pipe.LPush(ctx, key, payload)
	pipe.LTrim(ctx, key, 0, 24)
	pipe.Expire(ctx, key, 24*time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("write chat log: %w", err)
	}
	return nil
}
