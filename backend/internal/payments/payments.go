package payments

import (
	"context"
	"strings"
)

type CheckoutRequest struct {
	PlanID        string `json:"plan_id"`
	CustomerEmail string `json:"customer_email"`
	SuccessURL    string `json:"success_url"`
	CancelURL     string `json:"cancel_url"`
}

type CheckoutIntent struct {
	Provider    string `json:"provider"`
	Status      string `json:"status"`
	CheckoutURL string `json:"checkout_url,omitempty"`
	Message     string `json:"message"`
}

type Provider interface {
	CreateCheckoutIntent(context.Context, CheckoutRequest) (CheckoutIntent, error)
}

func NewProvider(name string) Provider {
	switch strings.ToLower(strings.TrimSpace(name)) {
	default:
		return NullProvider{Name: fallbackName(name)}
	}
}

type NullProvider struct {
	Name string
}

func (p NullProvider) CreateCheckoutIntent(_ context.Context, _ CheckoutRequest) (CheckoutIntent, error) {
	return CheckoutIntent{
		Provider: p.Name,
		Status:   "provider_not_selected",
		Message:  "Payment provider is intentionally not connected yet. Select a MoR and add its adapter behind the Provider interface.",
	}, nil
}

func fallbackName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "unselected"
	}
	return value
}
