package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
)

type GeminiClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

func NewGeminiClient(apiKey string, model string) *GeminiClient {
	return &GeminiClient{
		apiKey: strings.TrimSpace(apiKey),
		model:  strings.TrimSpace(model),
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

func (c *GeminiClient) Model() string {
	return c.model
}

func (c *GeminiClient) Generate(ctx context.Context, messages []models.ChatMessage) (string, error) {
	if c.apiKey == "" {
		return "", errors.New("GEMINI_API_KEY is not configured")
	}
	if c.model == "" {
		return "", errors.New("GEMINI_MODEL is not configured")
	}

	contents := make([]geminiContent, 0, len(messages))
	for _, message := range messages {
		role := "user"
		if message.Role == "assistant" || message.Role == "model" {
			role = "model"
		}
		contents = append(contents, geminiContent{
			Role: role,
			Parts: []geminiPart{{
				Text: message.Content,
			}},
		})
	}

	body := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{
				Text: "You are Nexora's automation architect. Reply in Russian unless the user asks otherwise. Help transform business goals into clear automation nodes, integrations, data handoffs, and implementation risks. Do not claim the demo graph is already executing.",
			}},
		},
		Contents: contents,
		GenerationConfig: geminiGenerationConfig{
			Temperature:     0.45,
			MaxOutputTokens: 2400,
		},
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal gemini request: %w", err)
	}

	endpoint := fmt.Sprintf(
		"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
		url.PathEscape(c.model),
		url.QueryEscape(c.apiKey),
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return "", fmt.Errorf("create gemini request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call gemini: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("gemini returned %s: %s", resp.Status, strings.TrimSpace(string(bodyBytes)))
	}

	var decoded geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return "", fmt.Errorf("decode gemini response: %w", err)
	}
	for _, candidate := range decoded.Candidates {
		var answer strings.Builder
		for _, part := range candidate.Content.Parts {
			text := strings.TrimSpace(part.Text)
			if text != "" {
				if answer.Len() > 0 {
					answer.WriteString("\n\n")
				}
				answer.WriteString(text)
			}
		}
		if answer.Len() > 0 {
			return answer.String(), nil
		}
	}
	return "", errors.New("gemini response did not include text")
}

type geminiRequest struct {
	SystemInstruction *geminiContent         `json:"systemInstruction,omitempty"`
	Contents          []geminiContent        `json:"contents"`
	GenerationConfig  geminiGenerationConfig `json:"generationConfig"`
}

type geminiGenerationConfig struct {
	Temperature     float64 `json:"temperature"`
	MaxOutputTokens int     `json:"maxOutputTokens"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}
