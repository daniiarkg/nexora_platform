package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	netmail "net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
	"github.com/daniiarkg/nexora_platform/backend/internal/payments"
	"github.com/daniiarkg/nexora_platform/backend/internal/store"
)

const maxRequestBodyBytes = 1 << 20

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	dependencies := map[string]string{
		"postgres": "ok",
		"valkey":   "ok",
	}
	status := "ok"
	code := http.StatusOK
	if err := s.store.Health(ctx); err != nil {
		status = "degraded"
		code = http.StatusServiceUnavailable
		dependencies["postgres"] = err.Error()
	}
	if err := s.cache.Health(ctx); err != nil {
		status = "degraded"
		code = http.StatusServiceUnavailable
		dependencies["valkey"] = err.Error()
	}

	writeJSON(w, code, map[string]any{
		"status":       status,
		"dependencies": dependencies,
	})
}

func (s *Server) createAutomationRequest(w http.ResponseWriter, r *http.Request) {
	var input models.AutomationRequestInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := validateAutomationRequest(input); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	req, err := s.store.CreateAutomationRequest(r.Context(), input)
	if err != nil {
		s.logger.Error("create automation request failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "request could not be saved"})
		return
	}
	emailQueued, err := s.mailer.QueueAutomationRequest(r.Context(), req)
	if err != nil {
		emailQueued = false
		s.logger.Error("queue email failed", "error", err, "request_id", req.ID)
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"request":      req,
		"email_queued": emailQueued,
	})
}

func (s *Server) listAutomationRequests(w http.ResponseWriter, r *http.Request) {
	limit := parseBoundedInt(r.URL.Query().Get("limit"), 50, 1, 100)
	offset := parseBoundedInt(r.URL.Query().Get("offset"), 0, 0, 10000)

	requests, err := s.store.ListAutomationRequests(r.Context(), limit, offset)
	if err != nil {
		s.logger.Error("list automation requests failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "requests could not be loaded"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"requests": requests,
		"limit":    limit,
		"offset":   offset,
	})
}

func (s *Server) emailOptions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.mailer.Options())
}

func (s *Server) emailPreview(w http.ResponseWriter, r *http.Request) {
	var input models.AdminEmailPreviewInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := validateAdminEmailPreview(input); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	req, err := s.requestContext(r.Context(), input.RequestID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	rendered, err := s.mailer.RenderTemplate(input.TemplateID, req, input.Metadata)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, rendered)
}

func (s *Server) sendClientEmail(w http.ResponseWriter, r *http.Request) {
	var input models.AdminClientEmailInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := validateAdminClientEmail(input); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	req, err := s.requestContext(r.Context(), input.RequestID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	if err := s.mailer.SendAdminClientEmail(r.Context(), input, req); err != nil {
		s.logger.Error("admin client email failed", "error", err, "template_id", input.TemplateID, "to", input.To)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.AdminClientEmailResponse{
		Sent:       true,
		TemplateID: input.TemplateID,
		To:         input.To,
		From:       input.From,
	})
}

func (s *Server) chat(w http.ResponseWriter, r *http.Request) {
	var input models.ChatRequest
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if input.SessionID == "" {
		input.SessionID = store.NewID()
	}
	if err := validateChatRequest(input); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	answer, err := s.ai.Generate(r.Context(), input.Messages)
	if err != nil {
		s.logger.Error("gemini chat failed", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "ai response failed"})
		return
	}
	if err := s.cache.AppendChatLog(r.Context(), input.SessionID, input.Messages, answer); err != nil {
		s.logger.Warn("chat cache write failed", "error", err)
	}

	writeJSON(w, http.StatusOK, models.ChatResponse{
		SessionID: input.SessionID,
		Message:   answer,
		Model:     s.ai.Model(),
	})
}

func (s *Server) requestContext(ctx context.Context, requestID string) (*models.AutomationRequest, error) {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return nil, nil
	}
	req, err := s.store.GetAutomationRequest(ctx, requestID)
	if err != nil {
		return nil, err
	}
	return &req, nil
}

func (s *Server) createCheckoutIntent(w http.ResponseWriter, r *http.Request) {
	var input payments.CheckoutRequest
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if strings.TrimSpace(input.PlanID) == "" {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "plan_id is required"})
		return
	}
	intent, err := s.payments.CreateCheckoutIntent(r.Context(), input)
	if err != nil {
		s.logger.Error("create checkout intent failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "checkout intent could not be created"})
		return
	}
	writeJSON(w, http.StatusOK, intent)
}

func readJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("invalid json: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("invalid json: multiple json documents")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func validateAutomationRequest(input models.AutomationRequestInput) error {
	if length := len([]rune(strings.TrimSpace(input.Title))); length < 3 || length > 120 {
		return errors.New("title must be 3-120 characters")
	}
	if length := len([]rune(strings.TrimSpace(input.Description))); length < 10 || length > 4000 {
		return errors.New("description must be 10-4000 characters")
	}
	if input.IconKind != "preset" && input.IconKind != "upload" {
		return errors.New("icon_kind must be preset or upload")
	}
	if len(input.IconValue) == 0 || len(input.IconValue) > 200000 {
		return errors.New("icon_value is required and must be below 200000 bytes")
	}
	if length := len([]rune(strings.TrimSpace(input.Customer.Name))); length < 2 || length > 120 {
		return errors.New("customer.name must be 2-120 characters")
	}
	if _, err := netmail.ParseAddress(input.Customer.Email); err != nil {
		return errors.New("customer.email must be a valid email")
	}
	if len([]rune(input.Customer.Company)) > 160 {
		return errors.New("customer.company must be at most 160 characters")
	}
	if len(input.Graph.Nodes) == 0 || len(input.Graph.Nodes) > 40 {
		return errors.New("graph.nodes must contain 1-40 nodes")
	}
	if len(input.Graph.Edges) > 80 {
		return errors.New("graph.edges must contain at most 80 edges")
	}
	seen := map[string]struct{}{}
	for _, node := range input.Graph.Nodes {
		nodeID := strings.TrimSpace(node.ID)
		if nodeID == "" || len(nodeID) > 80 {
			return errors.New("each graph node requires an id below 80 characters")
		}
		if _, ok := seen[nodeID]; ok {
			return errors.New("graph node ids must be unique")
		}
		seen[nodeID] = struct{}{}
		if strings.TrimSpace(node.Title) == "" || len([]rune(node.Title)) > 120 {
			return errors.New("each graph node requires a title below 120 characters")
		}
	}
	for _, edge := range input.Graph.Edges {
		if _, ok := seen[edge.Source]; !ok {
			return errors.New("edge source must reference an existing node")
		}
		if _, ok := seen[edge.Target]; !ok {
			return errors.New("edge target must reference an existing node")
		}
	}
	return nil
}

func validateAdminEmailPreview(input models.AdminEmailPreviewInput) error {
	if strings.TrimSpace(input.TemplateID) == "" || len(input.TemplateID) > 80 {
		return errors.New("template_id is required")
	}
	return validateEmailMetadata(input.Metadata)
}

func validateAdminClientEmail(input models.AdminClientEmailInput) error {
	if _, err := netmail.ParseAddress(input.To); err != nil {
		return errors.New("to must be a valid email")
	}
	if strings.TrimSpace(input.From) == "" || len([]rune(input.From)) > 180 {
		return errors.New("from is required")
	}
	if strings.TrimSpace(input.TemplateID) == "" || len(input.TemplateID) > 80 {
		return errors.New("template_id is required")
	}
	if length := len([]rune(strings.TrimSpace(input.Subject))); length < 3 || length > 180 {
		return errors.New("subject must be 3-180 characters")
	}
	if len([]rune(input.Preheader)) > 240 {
		return errors.New("preheader must be at most 240 characters")
	}
	if len(input.HTML) > 200000 {
		return errors.New("html must be below 200000 bytes")
	}
	if len(input.Text) > 40000 {
		return errors.New("text must be below 40000 bytes")
	}
	if strings.TrimSpace(input.HTML) == "" && strings.TrimSpace(input.Text) == "" {
		return errors.New("html or text is required")
	}
	return validateEmailMetadata(input.Metadata)
}

func validateEmailMetadata(metadata map[string]string) error {
	if len(metadata) > 40 {
		return errors.New("metadata can contain at most 40 fields")
	}
	for key, value := range metadata {
		if len([]rune(strings.TrimSpace(key))) == 0 || len([]rune(key)) > 80 {
			return errors.New("metadata keys must be 1-80 characters")
		}
		if len([]rune(value)) > 2000 {
			return errors.New("metadata values must be below 2000 characters")
		}
	}
	return nil
}

func validateChatRequest(input models.ChatRequest) error {
	if len(input.Messages) == 0 || len(input.Messages) > 20 {
		return errors.New("messages must contain 1-20 items")
	}
	for _, message := range input.Messages {
		role := strings.TrimSpace(message.Role)
		if role != "user" && role != "assistant" && role != "model" {
			return errors.New("message role must be user, assistant or model")
		}
		if length := len([]rune(strings.TrimSpace(message.Content))); length == 0 || length > 2000 {
			return errors.New("message content must be 1-2000 characters")
		}
	}
	return nil
}

func parseBoundedInt(value string, fallback int, minValue int, maxValue int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	if parsed < minValue {
		return minValue
	}
	if parsed > maxValue {
		return maxValue
	}
	return parsed
}
