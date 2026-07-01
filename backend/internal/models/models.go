package models

import "time"

type Customer struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Company string `json:"company"`
}

type GraphNode struct {
	ID          string            `json:"id"`
	Type        string            `json:"type"`
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Icon        string            `json:"icon"`
	Position    GraphPosition     `json:"position"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

type GraphPosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type GraphEdge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label,omitempty"`
}

type AutomationGraph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type AutomationRequestInput struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	IconKind    string          `json:"icon_kind"`
	IconValue   string          `json:"icon_value"`
	Customer    Customer        `json:"customer"`
	Graph       AutomationGraph `json:"graph"`
}

type AutomationRequest struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	IconKind    string          `json:"icon_kind"`
	IconValue   string          `json:"icon_value"`
	Customer    Customer        `json:"customer"`
	Graph       AutomationGraph `json:"graph"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type EmailTemplateSummary struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	Description     string            `json:"description"`
	DefaultMetadata map[string]string `json:"default_metadata"`
}

type AdminEmailOptions struct {
	FromOptions []string               `json:"from_options"`
	Templates   []EmailTemplateSummary `json:"templates"`
}

type AdminEmailPreviewInput struct {
	TemplateID string            `json:"template_id"`
	RequestID  string            `json:"request_id,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

type EmailTemplateRender struct {
	TemplateID string            `json:"template_id"`
	Subject    string            `json:"subject"`
	Preheader  string            `json:"preheader"`
	HTML       string            `json:"html"`
	Text       string            `json:"text"`
	Metadata   map[string]string `json:"metadata"`
}

type AdminClientEmailInput struct {
	To         string            `json:"to"`
	From       string            `json:"from"`
	TemplateID string            `json:"template_id"`
	RequestID  string            `json:"request_id,omitempty"`
	Subject    string            `json:"subject"`
	Preheader  string            `json:"preheader,omitempty"`
	HTML       string            `json:"html"`
	Text       string            `json:"text"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

type AdminClientEmailResponse struct {
	Sent       bool   `json:"sent"`
	TemplateID string `json:"template_id"`
	To         string `json:"to"`
	From       string `json:"from"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	SessionID string        `json:"session_id"`
	Messages  []ChatMessage `json:"messages"`
}

type ChatResponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
	Model     string `json:"model"`
}
