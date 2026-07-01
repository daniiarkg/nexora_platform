package mail

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"mime"
	"net/smtp"
	"strings"

	"github.com/daniiarkg/nexora_platform/backend/internal/models"
)

type Config struct {
	Host       string
	Port       int
	Username   string
	Password   string
	From       string
	Recipients []string
	AppURL     string
}

type Mailer struct {
	cfg    Config
	logger *slog.Logger
	queue  chan models.AutomationRequest
}

func NewMailer(cfg Config, logger *slog.Logger) *Mailer {
	return &Mailer{
		cfg:    cfg,
		logger: logger,
		queue:  make(chan models.AutomationRequest, 128),
	}
}

func (m *Mailer) Enabled() bool {
	return m.cfg.Host != "" &&
		m.cfg.Port > 0 &&
		m.cfg.Username != "" &&
		m.cfg.Password != "" &&
		m.cfg.From != "" &&
		len(m.cfg.Recipients) > 0
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
	if !m.Enabled() {
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

func (m *Mailer) sendAutomationRequest(req models.AutomationRequest) error {
	subject := "Новая заявка Nexora: " + req.Title
	body := fmt.Sprintf(
		"Новая заявка на автоматизацию\n\nID: %s\nНазвание: %s\nКлиент: %s <%s>\nКомпания: %s\nСтатус: %s\n\nОписание:\n%s\n\nУзлов в графе: %d\nСвязей в графе: %d\n\nАдминка: %s/admin\n",
		req.ID,
		req.Title,
		req.Customer.Name,
		req.Customer.Email,
		req.Customer.Company,
		req.Status,
		req.Description,
		len(req.Graph.Nodes),
		len(req.Graph.Edges),
		strings.TrimRight(m.cfg.AppURL, "/"),
	)

	headers := map[string]string{
		"From":                      m.cfg.From,
		"To":                        strings.Join(m.cfg.Recipients, ", "),
		"Subject":                   mime.QEncoding.Encode("utf-8", subject),
		"MIME-Version":              "1.0",
		"Content-Type":              "text/plain; charset=utf-8",
		"Content-Transfer-Encoding": "8bit",
	}

	var message strings.Builder
	for key, value := range headers {
		message.WriteString(key)
		message.WriteString(": ")
		message.WriteString(value)
		message.WriteString("\r\n")
	}
	message.WriteString("\r\n")
	message.WriteString(body)

	auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
	return smtp.SendMail(
		fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port),
		auth,
		m.cfg.From,
		m.cfg.Recipients,
		[]byte(message.String()),
	)
}
