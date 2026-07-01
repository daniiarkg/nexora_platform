package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const passwordMinLength = 10

var phonePattern = regexp.MustCompile(`^\+?[0-9][0-9\s().-]{6,24}$`)

func NewToken() (string, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	return token, HashToken(token), nil
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func VerifyPassword(hash string, password string) bool {
	if strings.TrimSpace(hash) == "" || password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func NormalizeEmail(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "", errors.New("email is required")
	}
	parsed, err := mail.ParseAddress(value)
	if err != nil || parsed.Address != value {
		return "", errors.New("email must be valid")
	}
	if len([]rune(value)) > 254 {
		return "", errors.New("email is too long")
	}
	return value, nil
}

func NormalizePhone(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if !phonePattern.MatchString(value) {
		return "", errors.New("phone must be a valid international phone number")
	}
	var out strings.Builder
	for _, r := range value {
		if unicode.IsDigit(r) || (r == '+' && out.Len() == 0) {
			out.WriteRune(r)
		}
	}
	normalized := out.String()
	if len(normalized) < 8 || len(normalized) > 18 {
		return "", errors.New("phone must contain 8-18 digits")
	}
	return normalized, nil
}

func ValidatePassword(password string) error {
	if len([]rune(password)) < passwordMinLength {
		return errors.New("password must be at least 10 characters")
	}
	var hasUpper, hasLower, hasDigit bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit {
		return errors.New("password must include uppercase, lowercase and a number")
	}
	return nil
}

func CleanName(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}
