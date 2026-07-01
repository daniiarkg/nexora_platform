package mail

import (
	"bytes"
	"context"
	"embed"
	"encoding/base64"
	"errors"
	"fmt"
	htmltmpl "html/template"
	"log/slog"
	"mime"
	netmail "net/mail"
	"net/smtp"
	"sort"
	"strings"
	texttmpl "text/template"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
)

const logoCID = "nexora-logo-dark"

//go:embed templates/*.tmpl assets/nexora-logo-dark.svg
var templateFS embed.FS

type Config struct {
	Host        string
	Port        int
	Username    string
	Password    string
	From        string
	FromOptions []string
	Recipients  []string
	AppURL      string
}

type Mailer struct {
	cfg    Config
	logger *slog.Logger
	queue  chan models.AutomationRequest
}

type renderedMessage struct {
	TemplateID string
	From       string
	To         []string
	Subject    string
	Preheader  string
	HTML       string
	Text       string
	Headers    map[string]string
}

type templateDefinition struct {
	ID              string
	Name            string
	Description     string
	Subject         string
	Preheader       string
	ActionKey       string
	ActionFallback  string
	ActionLabel     string
	DefaultMetadata map[string]string
}

type templateData struct {
	Subject            string
	Preheader          string
	LogoCID            string
	AppURL             string
	AdminURL           string
	SupportEmail       string
	CustomerName       string
	CustomerEmail      string
	CustomerCompany    string
	RequestID          string
	RequestTitle       string
	RequestDescription string
	Status             string
	GraphNodeCount     int
	GraphEdgeCount     int
	ActionURL          string
	ActionLabel        string
	Headline           string
	BodyText           string
	FooterNote         string
	Metadata           map[string]string
	CurrentYear        int
}

var templateDefinitions = map[string]templateDefinition{
	"admin_automation_request": {
		ID:             "admin_automation_request",
		Name:           "Новая заявка для админки",
		Description:    "Внутреннее уведомление о новом графе автоматизации.",
		Subject:        "Новая заявка Nexora: {{.RequestTitle}}",
		Preheader:      "Клиент отправил граф автоматизации. Откройте админку, чтобы обработать заявку.",
		ActionFallback: "admin",
		ActionLabel:    "Открыть в админке",
		DefaultMetadata: map[string]string{
			"priority": "new",
		},
	},
	"account_confirmation": {
		ID:             "account_confirmation",
		Name:           "Подтверждение аккаунта",
		Description:    "Письмо со ссылкой подтверждения после регистрации.",
		Subject:        "Подтвердите аккаунт Nexora",
		Preheader:      "Завершите регистрацию и получите доступ к рабочему пространству Nexora.",
		ActionKey:      "confirmation_url",
		ActionFallback: "app",
		ActionLabel:    "Подтвердить аккаунт",
		DefaultMetadata: map[string]string{
			"confirmation_url": "https://nexora.kg/confirm?token=example",
		},
	},
	"password_reset": {
		ID:             "password_reset",
		Name:           "Сброс пароля",
		Description:    "Письмо со ссылкой для восстановления доступа.",
		Subject:        "Сброс пароля Nexora",
		Preheader:      "Перейдите по ссылке, чтобы задать новый пароль.",
		ActionKey:      "reset_url",
		ActionFallback: "app",
		ActionLabel:    "Сбросить пароль",
		DefaultMetadata: map[string]string{
			"reset_url": "https://nexora.kg/reset-password?token=example",
		},
	},
	"request_received": {
		ID:             "request_received",
		Name:           "Заявка принята",
		Description:    "Подтверждение для клиента после отправки графа.",
		Subject:        "Заявка принята: {{.RequestTitle}}",
		Preheader:      "Мы получили ваш сценарий автоматизации и передали его команде Nexora.",
		ActionFallback: "app",
		ActionLabel:    "Открыть Nexora",
		DefaultMetadata: map[string]string{
			"source": "automation_builder",
		},
	},
	"custom_client": {
		ID:             "custom_client",
		Name:           "Кастомное письмо клиенту",
		Description:    "Свободный брендовый шаблон для ручной отправки из админки.",
		Subject:        "{{.Headline}}",
		Preheader:      "{{.BodyText}}",
		ActionKey:      "action_url",
		ActionFallback: "",
		ActionLabel:    "{{.ActionLabel}}",
		DefaultMetadata: map[string]string{
			"headline":     "Сообщение от Nexora",
			"body_text":    "Мы посмотрели ваш сценарий и готовы обсудить следующие шаги.",
			"footer_note":  "Ответьте на это письмо, если хотите уточнить детали проекта.",
			"action_label": "Открыть Nexora",
			"action_url":   "https://nexora.kg",
		},
	},
}

func NewMailer(cfg Config, logger *slog.Logger) *Mailer {
	cfg.FromOptions = normalizeFromOptions(cfg.From, cfg.FromOptions)
	return &Mailer{
		cfg:    cfg,
		logger: logger,
		queue:  make(chan models.AutomationRequest, 128),
	}
}

func (m *Mailer) Enabled() bool {
	return m.smtpReady() && (len(m.cfg.Recipients) > 0 || m.cfg.From != "")
}

func (m *Mailer) Start(ctx context.Context, workers int) {
	if workers < 1 {
		workers = 1
	}
	for i := 0; i < workers; i++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case req := <-m.queue:
					if err := m.sendAutomationRequest(req); err != nil {
						m.logger.Error("send automation request email failed", "error", err, "request_id", req.ID)
					}
				}
			}
		}()
	}
}

func (m *Mailer) QueueAutomationRequest(ctx context.Context, req models.AutomationRequest) (bool, error) {
	if !m.smtpReady() {
		m.logger.Warn("smtp is not fully configured; email notification skipped")
		return false, nil
	}
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	case m.queue <- req:
		return true, nil
	default:
		return false, errors.New("email queue is full")
	}
}

func (m *Mailer) Options() models.AdminEmailOptions {
	return models.AdminEmailOptions{
		FromOptions: append([]string(nil), m.cfg.FromOptions...),
		Templates:   TemplateSummaries(),
	}
}

func TemplateSummaries() []models.EmailTemplateSummary {
	ids := make([]string, 0, len(templateDefinitions))
	for id := range templateDefinitions {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	summaries := make([]models.EmailTemplateSummary, 0, len(ids))
	for _, id := range ids {
		def := templateDefinitions[id]
		summaries = append(summaries, models.EmailTemplateSummary{
			ID:              def.ID,
			Name:            def.Name,
			Description:     def.Description,
			DefaultMetadata: cloneMap(def.DefaultMetadata),
		})
	}
	return summaries
}

func (m *Mailer) RenderTemplate(templateID string, req *models.AutomationRequest, metadata map[string]string) (models.EmailTemplateRender, error) {
	rendered, err := m.renderTemplate(templateID, req, metadata)
	if err != nil {
		return models.EmailTemplateRender{}, err
	}
	return models.EmailTemplateRender{
		TemplateID: rendered.TemplateID,
		Subject:    rendered.Subject,
		Preheader:  rendered.Preheader,
		HTML:       rendered.HTML,
		Text:       rendered.Text,
		Metadata:   mergeMetadata(templateDefinitions[templateID], req, metadata),
	}, nil
}

func (m *Mailer) SendAdminClientEmail(ctx context.Context, input models.AdminClientEmailInput, req *models.AutomationRequest) error {
	if !m.smtpReady() {
		return errors.New("smtp is not fully configured")
	}
	if strings.TrimSpace(input.From) == "" {
		input.From = m.cfg.From
	}
	if !m.fromAllowed(input.From) {
		return fmt.Errorf("from address is not allowed")
	}

	to, err := parseRecipients([]string{input.To})
	if err != nil {
		return err
	}

	rendered, err := m.renderTemplate(input.TemplateID, req, input.Metadata)
	if err != nil {
		return err
	}
	if strings.TrimSpace(input.Subject) != "" {
		rendered.Subject = strings.TrimSpace(input.Subject)
	}
	if strings.TrimSpace(input.Preheader) != "" {
		rendered.Preheader = strings.TrimSpace(input.Preheader)
	}
	if strings.TrimSpace(input.HTML) != "" {
		rendered.HTML = input.HTML
	}
	if strings.TrimSpace(input.Text) != "" {
		rendered.Text = input.Text
	}
	rendered.From = input.From
	rendered.To = to
	rendered.Headers = map[string]string{
		"X-Nexora-Template": input.TemplateID,
	}
	if req != nil {
		rendered.Headers["X-Nexora-Request-ID"] = req.ID
	}

	done := make(chan error, 1)
	go func() {
		done <- m.send(rendered)
	}()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-done:
		return err
	}
}

func (m *Mailer) SendAccountConfirmation(ctx context.Context, user models.User, confirmationURL string) (bool, error) {
	return m.sendUserTemplate(ctx, "account_confirmation", user, map[string]string{
		"confirmation_url": confirmationURL,
	})
}

func (m *Mailer) SendPasswordReset(ctx context.Context, user models.User, resetURL string) (bool, error) {
	return m.sendUserTemplate(ctx, "password_reset", user, map[string]string{
		"reset_url": resetURL,
	})
}

func (m *Mailer) sendUserTemplate(ctx context.Context, templateID string, user models.User, metadata map[string]string) (bool, error) {
	if !m.smtpReady() {
		m.logger.Warn("smtp is not fully configured; auth email skipped", "template_id", templateID)
		return false, nil
	}

	metadata = mergeStringMaps(map[string]string{
		"customer_name":  strings.TrimSpace(user.FirstName + " " + user.LastName),
		"customer_email": user.Email,
	}, metadata)

	rendered, err := m.renderTemplate(templateID, nil, metadata)
	if err != nil {
		return false, err
	}
	rendered.From = m.cfg.From
	rendered.To = []string{user.Email}
	rendered.Headers = map[string]string{
		"X-Nexora-Template": templateID,
		"X-Nexora-User-ID":  user.ID,
	}

	done := make(chan error, 1)
	go func() {
		done <- m.send(rendered)
	}()

	select {
	case <-ctx.Done():
		return false, ctx.Err()
	case err := <-done:
		return err == nil, err
	}
}

func (m *Mailer) sendAutomationRequest(req models.AutomationRequest) error {
	var errs []error
	if len(m.cfg.Recipients) > 0 {
		adminMessage, err := m.renderTemplate("admin_automation_request", &req, nil)
		if err != nil {
			errs = append(errs, err)
		} else {
			adminMessage.From = m.cfg.From
			adminMessage.To = append([]string(nil), m.cfg.Recipients...)
			adminMessage.Headers = map[string]string{
				"X-Nexora-Template":   "admin_automation_request",
				"X-Nexora-Request-ID": req.ID,
			}
			if err := m.send(adminMessage); err != nil {
				errs = append(errs, fmt.Errorf("admin notification: %w", err))
			}
		}
	}

	clientMessage, err := m.renderTemplate("request_received", &req, nil)
	if err != nil {
		errs = append(errs, err)
	} else {
		clientMessage.From = m.cfg.From
		clientMessage.To = []string{req.Customer.Email}
		clientMessage.Headers = map[string]string{
			"X-Nexora-Template":   "request_received",
			"X-Nexora-Request-ID": req.ID,
		}
		if err := m.send(clientMessage); err != nil {
			errs = append(errs, fmt.Errorf("client confirmation: %w", err))
		}
	}

	return errors.Join(errs...)
}

func (m *Mailer) renderTemplate(templateID string, req *models.AutomationRequest, metadata map[string]string) (renderedMessage, error) {
	def, ok := templateDefinitions[templateID]
	if !ok {
		return renderedMessage{}, fmt.Errorf("unknown email template: %s", templateID)
	}

	data := m.templateData(def, req, metadata)

	subject, err := renderTextString(def.Subject, data)
	if err != nil {
		return renderedMessage{}, fmt.Errorf("render subject: %w", err)
	}
	preheader, err := renderTextString(def.Preheader, data)
	if err != nil {
		return renderedMessage{}, fmt.Errorf("render preheader: %w", err)
	}
	data.Subject = strings.TrimSpace(subject)
	data.Preheader = strings.TrimSpace(preheader)

	html, err := renderHTMLTemplate(templateID, data)
	if err != nil {
		return renderedMessage{}, fmt.Errorf("render html template: %w", err)
	}
	text, err := renderTextTemplate(templateID, data)
	if err != nil {
		return renderedMessage{}, fmt.Errorf("render text template: %w", err)
	}

	return renderedMessage{
		TemplateID: templateID,
		From:       m.cfg.From,
		Subject:    data.Subject,
		Preheader:  data.Preheader,
		HTML:       html,
		Text:       text,
	}, nil
}

func (m *Mailer) templateData(def templateDefinition, req *models.AutomationRequest, metadata map[string]string) templateData {
	merged := mergeMetadata(def, req, metadata)
	appURL := strings.TrimRight(m.cfg.AppURL, "/")
	if appURL == "" {
		appURL = "https://nexora.kg"
	}
	data := templateData{
		Subject:         def.Subject,
		Preheader:       def.Preheader,
		LogoCID:         logoCID,
		AppURL:          appURL,
		AdminURL:        appURL + "/admin",
		SupportEmail:    firstAddress(m.cfg.From),
		CustomerName:    metadataValue(merged, "customer_name", "клиент"),
		CustomerEmail:   metadataValue(merged, "customer_email", ""),
		CustomerCompany: metadataValue(merged, "customer_company", "Без компании"),
		RequestTitle:    metadataValue(merged, "request_title", "Автоматизация Nexora"),
		Status:          metadataValue(merged, "status", "new"),
		ActionLabel:     renderLiteral(def.ActionLabel, merged, "Открыть Nexora"),
		Headline:        metadataValue(merged, "headline", "Сообщение от Nexora"),
		BodyText:        metadataValue(merged, "body_text", "Мы подготовили обновление по вашему проекту."),
		FooterNote:      metadataValue(merged, "footer_note", "Ответьте на это письмо, если хотите уточнить детали."),
		Metadata:        merged,
		CurrentYear:     time.Now().Year(),
	}
	data.ActionURL = actionURL(def, data, merged)

	if req != nil {
		data.CustomerName = fallback(req.Customer.Name, data.CustomerName)
		data.CustomerEmail = fallback(req.Customer.Email, data.CustomerEmail)
		data.CustomerCompany = fallback(req.Customer.Company, "Без компании")
		data.RequestID = req.ID
		data.RequestTitle = fallback(req.Title, data.RequestTitle)
		data.RequestDescription = fallback(req.Description, metadataValue(merged, "request_description", "Описание не указано."))
		data.Status = fallback(req.Status, data.Status)
		data.GraphNodeCount = len(req.Graph.Nodes)
		data.GraphEdgeCount = len(req.Graph.Edges)
	} else {
		data.RequestDescription = metadataValue(merged, "request_description", "Описание не указано.")
	}

	return data
}

func (m *Mailer) send(message renderedMessage) error {
	fromHeader := fallback(message.From, m.cfg.From)
	fromAddress, err := mailboxAddress(fromHeader)
	if err != nil {
		return fmt.Errorf("invalid from address: %w", err)
	}
	recipients, err := parseRecipients(message.To)
	if err != nil {
		return err
	}

	raw, err := buildMIMEMessage(fromHeader, recipients, message)
	if err != nil {
		return err
	}

	auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
	return smtp.SendMail(
		fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port),
		auth,
		fromAddress,
		recipients,
		raw,
	)
}

func (m *Mailer) smtpReady() bool {
	return m.cfg.Host != "" &&
		m.cfg.Port > 0 &&
		m.cfg.Username != "" &&
		m.cfg.Password != "" &&
		m.cfg.From != ""
}

func (m *Mailer) fromAllowed(value string) bool {
	valueAddress := firstAddress(value)
	for _, option := range m.cfg.FromOptions {
		if strings.EqualFold(strings.TrimSpace(option), strings.TrimSpace(value)) {
			return true
		}
		if strings.EqualFold(firstAddress(option), valueAddress) {
			return true
		}
	}
	return false
}

func renderHTMLTemplate(templateID string, data templateData) (string, error) {
	tpl, err := htmltmpl.ParseFS(templateFS, "templates/base.html.tmpl", "templates/"+templateID+".html.tmpl")
	if err != nil {
		return "", err
	}
	var out bytes.Buffer
	if err := tpl.ExecuteTemplate(&out, "layout", data); err != nil {
		return "", err
	}
	return out.String(), nil
}

func renderTextTemplate(templateID string, data templateData) (string, error) {
	tpl, err := texttmpl.ParseFS(templateFS, "templates/"+templateID+".txt.tmpl")
	if err != nil {
		return "", err
	}
	var out bytes.Buffer
	if err := tpl.Execute(&out, data); err != nil {
		return "", err
	}
	return out.String(), nil
}

func renderTextString(pattern string, data templateData) (string, error) {
	tpl, err := texttmpl.New("inline").Parse(pattern)
	if err != nil {
		return "", err
	}
	var out bytes.Buffer
	if err := tpl.Execute(&out, data); err != nil {
		return "", err
	}
	return out.String(), nil
}

func renderLiteral(pattern string, metadata map[string]string, fallbackValue string) string {
	value := strings.TrimSpace(pattern)
	switch value {
	case "{{.ActionLabel}}":
		value = strings.TrimSpace(metadata["action_label"])
	}
	if value == "" {
		return fallbackValue
	}
	return value
}

func actionURL(def templateDefinition, data templateData, metadata map[string]string) string {
	if def.ActionKey != "" {
		if value := strings.TrimSpace(metadata[def.ActionKey]); value != "" {
			return value
		}
	}
	if value := strings.TrimSpace(metadata["action_url"]); value != "" {
		return value
	}
	switch def.ActionFallback {
	case "admin":
		return data.AdminURL
	case "app":
		return data.AppURL
	default:
		return ""
	}
}

func buildMIMEMessage(from string, recipients []string, message renderedMessage) ([]byte, error) {
	logoBytes, err := templateFS.ReadFile("assets/nexora-logo-dark.svg")
	if err != nil {
		return nil, fmt.Errorf("read logo asset: %w", err)
	}

	relatedBoundary := "nexora-related-" + strings.ReplaceAll(time.Now().Format("20060102150405.000000000"), ".", "")
	alternativeBoundary := "nexora-alt-" + strings.ReplaceAll(time.Now().Add(time.Nanosecond).Format("20060102150405.000000000"), ".", "")

	headers := map[string]string{
		"From":         from,
		"To":           strings.Join(recipients, ", "),
		"Subject":      mime.QEncoding.Encode("utf-8", cleanHeader(message.Subject)),
		"MIME-Version": "1.0",
		"Content-Type": fmt.Sprintf(`multipart/related; boundary="%s"`, relatedBoundary),
	}
	for key, value := range message.Headers {
		headers[key] = value
	}

	var raw strings.Builder
	for key, value := range headers {
		raw.WriteString(cleanHeader(key))
		raw.WriteString(": ")
		raw.WriteString(cleanHeader(value))
		raw.WriteString("\r\n")
	}
	raw.WriteString("\r\n")

	raw.WriteString("--" + relatedBoundary + "\r\n")
	raw.WriteString(fmt.Sprintf("Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n", alternativeBoundary))

	raw.WriteString("--" + alternativeBoundary + "\r\n")
	raw.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	raw.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	raw.WriteString(message.Text)
	raw.WriteString("\r\n\r\n")

	raw.WriteString("--" + alternativeBoundary + "\r\n")
	raw.WriteString("Content-Type: text/html; charset=utf-8\r\n")
	raw.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
	raw.WriteString(message.HTML)
	raw.WriteString("\r\n\r\n")
	raw.WriteString("--" + alternativeBoundary + "--\r\n")

	raw.WriteString("--" + relatedBoundary + "\r\n")
	raw.WriteString("Content-Type: image/svg+xml; name=\"nexora-logo-dark.svg\"\r\n")
	raw.WriteString("Content-Transfer-Encoding: base64\r\n")
	raw.WriteString("Content-ID: <" + logoCID + ">\r\n")
	raw.WriteString("Content-Disposition: inline; filename=\"nexora-logo-dark.svg\"\r\n\r\n")
	raw.WriteString(wrapBase64(logoBytes))
	raw.WriteString("\r\n")
	raw.WriteString("--" + relatedBoundary + "--\r\n")

	return []byte(raw.String()), nil
}

func mergeMetadata(def templateDefinition, req *models.AutomationRequest, metadata map[string]string) map[string]string {
	merged := cloneMap(def.DefaultMetadata)
	for key, value := range metadata {
		key = strings.TrimSpace(key)
		if key != "" {
			merged[key] = strings.TrimSpace(value)
		}
	}
	if req != nil {
		merged["customer_name"] = req.Customer.Name
		merged["customer_email"] = req.Customer.Email
		merged["customer_company"] = fallback(req.Customer.Company, "Без компании")
		merged["request_id"] = req.ID
		merged["request_title"] = req.Title
		merged["request_description"] = req.Description
		merged["status"] = req.Status
	}
	return merged
}

func normalizeFromOptions(primary string, options []string) []string {
	out := make([]string, 0, len(options)+1)
	seen := map[string]struct{}{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		key := strings.ToLower(firstAddress(value))
		if key == "" {
			key = strings.ToLower(value)
		}
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	add(primary)
	for _, option := range options {
		add(option)
	}
	return out
}

func parseRecipients(values []string) ([]string, error) {
	recipients := make([]string, 0, len(values))
	for _, value := range values {
		for _, raw := range strings.Split(value, ",") {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				continue
			}
			addr, err := netmail.ParseAddress(raw)
			if err != nil {
				return nil, fmt.Errorf("invalid recipient address: %w", err)
			}
			recipients = append(recipients, addr.Address)
		}
	}
	if len(recipients) == 0 {
		return nil, errors.New("at least one recipient is required")
	}
	return recipients, nil
}

func mailboxAddress(value string) (string, error) {
	addr, err := netmail.ParseAddress(strings.TrimSpace(value))
	if err != nil {
		return "", err
	}
	return addr.Address, nil
}

func firstAddress(value string) string {
	addr, err := mailboxAddress(value)
	if err != nil {
		return strings.TrimSpace(value)
	}
	return addr
}

func metadataValue(metadata map[string]string, key string, fallbackValue string) string {
	value := strings.TrimSpace(metadata[key])
	if value == "" {
		return fallbackValue
	}
	return value
}

func fallback(value string, fallbackValue string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallbackValue
	}
	return value
}

func cloneMap(input map[string]string) map[string]string {
	out := make(map[string]string, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func mergeStringMaps(base map[string]string, extra map[string]string) map[string]string {
	out := cloneMap(base)
	for key, value := range extra {
		key = strings.TrimSpace(key)
		if key != "" {
			out[key] = value
		}
	}
	return out
}

func cleanHeader(value string) string {
	value = strings.ReplaceAll(value, "\r", "")
	value = strings.ReplaceAll(value, "\n", "")
	return value
}

func wrapBase64(data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	if len(encoded) <= 76 {
		return encoded
	}
	var out strings.Builder
	for len(encoded) > 76 {
		out.WriteString(encoded[:76])
		out.WriteString("\r\n")
		encoded = encoded[76:]
	}
	out.WriteString(encoded)
	return out.String()
}
