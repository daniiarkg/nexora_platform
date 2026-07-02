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
	return c.generateText(ctx, messages, "You are Nexora's automation architect. Reply in Russian unless the user asks otherwise. Help transform business goals into clear automation nodes, integrations, data handoffs, and implementation risks. Do not claim the demo graph is already executing.", 0.45, 2400, "")
}

func (c *GeminiClient) GenerateGraphEdit(ctx context.Context, input models.GraphEditRequest) (models.GraphEditPlan, error) {
	currentGraph, err := json.Marshal(input.Graph)
	if err != nil {
		return models.GraphEditPlan{}, fmt.Errorf("marshal current graph: %w", err)
	}

	system := strings.Join([]string{
		"You are Nexora's graph editing engine for a demo automation builder.",
		"Return only valid JSON. Do not wrap JSON in markdown.",
		"Allowed JSON schema: {\"message\":\"short Russian response\",\"title\":\"optional project title\",\"commands\":[...]}",
		"Allowed command actions: replace_graph, add_node, update_node, delete_node, connect, delete_edge, clear_graph.",
		"For replace_graph use nodes and edges arrays. For add_node use node. For update_node use id and node with fields to change. For connect use source and target. For delete_edge use id or source and target.",
		"Nodes must have id, type, title, description, icon, position. Use lowercase latin kebab-case ids.",
		"Allowed icons: Zap, Webhook, BrainCircuit, DatabaseZap, MailCheck, Boxes, ShieldCheck, Rocket.",
		"Edges must only connect existing node ids. Never add text labels to edges; omit label entirely.",
		"If mode is create, replace the graph with a complete useful automation of 4-8 nodes.",
		"If mode is edit, preserve the current graph and return only commands needed for the user's requested change. If the user only asks a question, return an empty commands array.",
		"Keep descriptions concise and practical. The graph is a demonstration, not an executing workflow.",
	}, "\n")

	prompt := fmt.Sprintf(
		"Mode: %s\nUser request: %s\nCurrent graph JSON: %s",
		strings.TrimSpace(input.Mode),
		strings.TrimSpace(input.Prompt),
		string(currentGraph),
	)
	raw, err := c.generateText(ctx, []models.ChatMessage{{Role: "user", Content: prompt}}, system, 0.28, 3200, "application/json")
	if err != nil {
		return models.GraphEditPlan{}, err
	}

	var plan models.GraphEditPlan
	if err := json.Unmarshal([]byte(extractJSON(raw)), &plan); err != nil {
		return models.GraphEditPlan{}, fmt.Errorf("decode graph edit json: %w", err)
	}
	plan.Message = strings.TrimSpace(plan.Message)
	if plan.Message == "" {
		plan.Message = "Готово."
	}
	if plan.Commands == nil {
		plan.Commands = []models.GraphEditCommand{}
	}
	return plan, nil
}

func (c *GeminiClient) generateText(ctx context.Context, messages []models.ChatMessage, systemInstruction string, temperature float64, maxOutputTokens int, responseMimeType string) (string, error) {
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
				Text: systemInstruction,
			}},
		},
		Contents: contents,
		GenerationConfig: geminiGenerationConfig{
			Temperature:      temperature,
			MaxOutputTokens:  maxOutputTokens,
			ResponseMimeType: responseMimeType,
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

func extractJSON(raw string) string {
	value := strings.TrimSpace(raw)
	value = strings.TrimPrefix(value, "```json")
	value = strings.TrimPrefix(value, "```")
	value = strings.TrimSuffix(value, "```")
	value = strings.TrimSpace(value)
	start := strings.Index(value, "{")
	end := strings.LastIndex(value, "}")
	if start >= 0 && end > start {
		return value[start : end+1]
	}
	return value
}

type geminiRequest struct {
	SystemInstruction *geminiContent         `json:"systemInstruction,omitempty"`
	Contents          []geminiContent        `json:"contents"`
	GenerationConfig  geminiGenerationConfig `json:"generationConfig"`
}

type geminiGenerationConfig struct {
	Temperature      float64 `json:"temperature"`
	MaxOutputTokens  int     `json:"maxOutputTokens"`
	ResponseMimeType string  `json:"responseMimeType,omitempty"`
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
