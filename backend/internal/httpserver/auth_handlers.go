package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/daniiarkg/nexora_platform/backend/internal/auth"
	"github.com/daniiarkg/nexora_platform/backend/internal/models"
	"github.com/daniiarkg/nexora_platform/backend/internal/store"
)

const (
	authPurposeEmailConfirmation = "email_confirmation"
	authPurposePasswordReset     = "password_reset"
	googleOAuthAuthorizeURL      = "https://accounts.google.com/o/oauth2/v2/auth"
	googleOAuthTokenURL          = "https://oauth2.googleapis.com/token"
	googleOAuthUserInfoURL       = "https://www.googleapis.com/oauth2/v3/userinfo"
	maxProfileAvatarURLBytes     = 260_000
)

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var input models.RegisterInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	normalized, err := validateRegisterInput(input)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}

	passwordHash, err := auth.HashPassword(input.Password)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	user, err := s.store.CreateUser(r.Context(), store.CreateUserInput{
		Email:        normalized.Email,
		FirstName:    normalized.FirstName,
		LastName:     normalized.LastName,
		Company:      normalized.Company,
		Phone:        normalized.Phone,
		PasswordHash: passwordHash,
	})
	if err != nil {
		if errors.Is(err, store.ErrDuplicateEmail) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "Аккаунт с таким email уже существует."})
			return
		}
		s.logger.Error("register user failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Аккаунт не удалось создать."})
		return
	}

	emailSent := s.issueConfirmationEmail(r.Context(), user)
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":       authUser(user),
		"email_sent": emailSent,
		"message":    "Проверьте почту и подтвердите аккаунт.",
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input models.LoginInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	email, err := auth.NormalizeEmail(input.Email)
	if err != nil || strings.TrimSpace(input.Password) == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Неверный email или пароль."})
		return
	}

	user, err := s.store.GetUserByEmail(r.Context(), email)
	if err != nil || !auth.VerifyPassword(user.PasswordHash, input.Password) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Неверный email или пароль."})
		return
	}
	if user.EmailVerifiedAt == nil {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error": "Подтвердите email перед входом.",
			"user":  authUser(user),
		})
		return
	}

	if err := s.createSession(w, r, user); err != nil {
		s.logger.Error("create login session failed", "error", err, "user_id", user.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Не удалось создать сессию."})
		return
	}
	writeJSON(w, http.StatusOK, models.AuthResponse{User: authUser(user)})
}

func (s *Server) loginWithAccessKey(w http.ResponseWriter, r *http.Request) {
	var input models.AccessKeyLoginInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	accessKey := strings.TrimSpace(input.AccessKey)
	if len(accessKey) < 16 || len(accessKey) > 256 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Неверный ключ доступа."})
		return
	}

	user, err := s.store.AuthenticateAccessKey(r.Context(), auth.HashToken(accessKey))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Неверный ключ доступа."})
		return
	}
	if err := s.createSession(w, r, user); err != nil {
		s.logger.Error("create access key session failed", "error", err, "user_id", user.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Не удалось создать сессию."})
		return
	}
	writeJSON(w, http.StatusOK, models.AuthResponse{User: authUser(user)})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	user, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, models.AuthResponse{User: authUser(user)})
}

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	current, ok := s.currentUser(w, r)
	if !ok {
		return
	}
	var input models.UpdateProfileInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	normalized, err := validateProfileInput(input)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	user, err := s.store.UpdateUserProfile(r.Context(), current.ID, store.UpdateUserProfileInput{
		FirstName: normalized.FirstName,
		LastName:  normalized.LastName,
		Company:   normalized.Company,
		Phone:     normalized.Phone,
		AvatarURL: normalized.AvatarURL,
	})
	if err != nil {
		s.logger.Error("update profile failed", "error", err, "user_id", current.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Профиль не удалось обновить."})
		return
	}
	writeJSON(w, http.StatusOK, models.AuthResponse{User: authUser(user)})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if tokenHash := s.sessionTokenHashFromRequest(r); tokenHash != "" {
		if err := s.store.RevokeSession(r.Context(), tokenHash); err != nil {
			s.logger.Warn("session revoke failed", "error", err)
		}
	}
	s.clearSessionCookie(w)
	writeJSON(w, http.StatusOK, models.MessageResponse{Message: "Сессия завершена."})
}

func (s *Server) confirmEmail(w http.ResponseWriter, r *http.Request) {
	var input models.TokenInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	token := strings.TrimSpace(input.Token)
	if len(token) < 32 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Некорректная ссылка подтверждения."})
		return
	}

	user, err := s.store.ConsumeAuthToken(r.Context(), authPurposeEmailConfirmation, auth.HashToken(token))
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Ссылка подтверждения недействительна или устарела."})
		return
	}
	if err := s.createSession(w, r, user); err != nil {
		s.logger.Error("create confirmation session failed", "error", err, "user_id", user.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Email подтвержден, но сессию создать не удалось."})
		return
	}
	writeJSON(w, http.StatusOK, models.AuthResponse{User: authUser(user)})
}

func (s *Server) resendConfirmation(w http.ResponseWriter, r *http.Request) {
	var input models.PasswordResetRequestInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	email, err := auth.NormalizeEmail(input.Email)
	if err == nil {
		if user, err := s.store.GetUserByEmail(r.Context(), email); err == nil && user.EmailVerifiedAt == nil {
			s.issueConfirmationEmail(r.Context(), user)
		}
	}
	writeJSON(w, http.StatusOK, models.MessageResponse{Message: "Если аккаунт существует, мы отправили письмо подтверждения."})
}

func (s *Server) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var input models.PasswordResetRequestInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	email, err := auth.NormalizeEmail(input.Email)
	if err == nil {
		if user, err := s.store.GetUserByEmail(r.Context(), email); err == nil {
			s.issuePasswordResetEmail(r.Context(), user)
		}
	}
	writeJSON(w, http.StatusOK, models.MessageResponse{Message: "Если аккаунт существует, мы отправили ссылку для сброса пароля."})
}

func (s *Server) confirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var input models.PasswordResetConfirmInput
	if err := readJSON(w, r, &input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if input.Password != input.ConfirmPassword {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Пароли не совпадают."})
		return
	}
	passwordHash, err := auth.HashPassword(input.Password)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
		return
	}
	token := strings.TrimSpace(input.Token)
	if len(token) < 32 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Некорректная ссылка сброса пароля."})
		return
	}

	user, err := s.store.ConsumeAuthToken(r.Context(), authPurposePasswordReset, auth.HashToken(token))
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "Ссылка сброса пароля недействительна или устарела."})
		return
	}
	if err := s.store.UpdateUserPassword(r.Context(), user.ID, passwordHash); err != nil {
		s.logger.Error("password reset update failed", "error", err, "user_id", user.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Пароль не удалось обновить."})
		return
	}
	writeJSON(w, http.StatusOK, models.MessageResponse{Message: "Пароль обновлен. Теперь можно войти."})
}

func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) {
	if s.cfg.GoogleOAuthClientID == "" || s.cfg.GoogleOAuthClientSecret == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Google OAuth не настроен."})
		return
	}
	state, _, err := auth.NewToken()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Не удалось начать OAuth."})
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.oauthStateCookieName(),
		Value:    state,
		Path:     "/api/v1/auth/google",
		HttpOnly: true,
		Secure:   s.secureCookie(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   10 * 60,
	})

	params := url.Values{}
	params.Set("client_id", s.cfg.GoogleOAuthClientID)
	params.Set("redirect_uri", s.cfg.GoogleOAuthRedirectURL)
	params.Set("response_type", "code")
	params.Set("scope", "openid email profile")
	params.Set("state", state)
	params.Set("access_type", "offline")
	params.Set("prompt", "select_account")
	http.Redirect(w, r, googleOAuthAuthorizeURL+"?"+params.Encode(), http.StatusFound)
}

func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	appURL := strings.TrimRight(s.cfg.PublicAppURL, "/")
	fail := func(reason string) {
		http.Redirect(w, r, appURL+"/auth/login?error="+url.QueryEscape(reason), http.StatusFound)
	}

	stateCookie, err := r.Cookie(s.oauthStateCookieName())
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		fail("oauth_state")
		return
	}
	s.clearOAuthStateCookie(w)

	if oauthErr := r.URL.Query().Get("error"); oauthErr != "" {
		fail(oauthErr)
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		fail("missing_code")
		return
	}

	profile, err := s.fetchGoogleProfile(r.Context(), code)
	if err != nil {
		s.logger.Error("google oauth failed", "error", err)
		fail("oauth_failed")
		return
	}
	if !profile.EmailVerified {
		fail("google_email_not_verified")
		return
	}

	user, err := s.store.UpsertGoogleUser(r.Context(), profile)
	if err != nil {
		s.logger.Error("google user upsert failed", "error", err)
		fail("oauth_user")
		return
	}
	if err := s.createSession(w, r, user); err != nil {
		s.logger.Error("google session failed", "error", err, "user_id", user.ID)
		fail("session")
		return
	}
	http.Redirect(w, r, appURL+"/profile", http.StatusFound)
}

func (s *Server) fetchGoogleProfile(ctx context.Context, code string) (models.GoogleProfile, error) {
	form := url.Values{}
	form.Set("client_id", s.cfg.GoogleOAuthClientID)
	form.Set("client_secret", s.cfg.GoogleOAuthClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", s.cfg.GoogleOAuthRedirectURL)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleOAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return models.GoogleProfile{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return models.GoogleProfile{}, err
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return models.GoogleProfile{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || tokenResp.AccessToken == "" {
		return models.GoogleProfile{}, fmt.Errorf("google token exchange failed: %s", tokenResp.Error)
	}

	profileReq, err := http.NewRequestWithContext(ctx, http.MethodGet, googleOAuthUserInfoURL, nil)
	if err != nil {
		return models.GoogleProfile{}, err
	}
	profileReq.Header.Set("Authorization", "Bearer "+tokenResp.AccessToken)

	profileResp, err := http.DefaultClient.Do(profileReq)
	if err != nil {
		return models.GoogleProfile{}, err
	}
	defer profileResp.Body.Close()

	var googleUser struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		GivenName     string `json:"given_name"`
		FamilyName    string `json:"family_name"`
	}
	if err := json.NewDecoder(profileResp.Body).Decode(&googleUser); err != nil {
		return models.GoogleProfile{}, err
	}
	if profileResp.StatusCode < 200 || profileResp.StatusCode >= 300 {
		return models.GoogleProfile{}, fmt.Errorf("google userinfo failed")
	}
	email, err := auth.NormalizeEmail(googleUser.Email)
	if err != nil {
		return models.GoogleProfile{}, err
	}
	if strings.TrimSpace(googleUser.Sub) == "" {
		return models.GoogleProfile{}, fmt.Errorf("google profile missing sub")
	}
	firstName := auth.CleanName(googleUser.GivenName)
	lastName := auth.CleanName(googleUser.FamilyName)
	if firstName == "" {
		firstName = "Google"
	}
	if lastName == "" {
		lastName = "User"
	}
	return models.GoogleProfile{
		ProviderUserID: googleUser.Sub,
		Email:          email,
		EmailVerified:  googleUser.EmailVerified,
		FirstName:      firstName,
		LastName:       lastName,
	}, nil
}

func (s *Server) issueConfirmationEmail(ctx context.Context, user models.User) bool {
	token, tokenHash, err := auth.NewToken()
	if err != nil {
		s.logger.Error("confirmation token generate failed", "error", err, "user_id", user.ID)
		return false
	}
	expiresAt := time.Now().UTC().Add(time.Duration(s.cfg.EmailConfirmationTTLHours) * time.Hour)
	if err := s.store.CreateAuthToken(ctx, user.ID, authPurposeEmailConfirmation, tokenHash, expiresAt); err != nil {
		s.logger.Error("confirmation token create failed", "error", err, "user_id", user.ID)
		return false
	}
	confirmationURL := strings.TrimRight(s.cfg.PublicAppURL, "/") + "/auth/confirm?token=" + url.QueryEscape(token)
	sent, err := s.mailer.SendAccountConfirmation(ctx, user, confirmationURL)
	if err != nil {
		s.logger.Error("confirmation email failed", "error", err, "user_id", user.ID)
		return false
	}
	return sent
}

func (s *Server) issuePasswordResetEmail(ctx context.Context, user models.User) bool {
	token, tokenHash, err := auth.NewToken()
	if err != nil {
		s.logger.Error("password reset token generate failed", "error", err, "user_id", user.ID)
		return false
	}
	expiresAt := time.Now().UTC().Add(time.Duration(s.cfg.PasswordResetTTLMinutes) * time.Minute)
	if err := s.store.CreateAuthToken(ctx, user.ID, authPurposePasswordReset, tokenHash, expiresAt); err != nil {
		s.logger.Error("password reset token create failed", "error", err, "user_id", user.ID)
		return false
	}
	resetURL := strings.TrimRight(s.cfg.PublicAppURL, "/") + "/auth/reset-password?token=" + url.QueryEscape(token)
	sent, err := s.mailer.SendPasswordReset(ctx, user, resetURL)
	if err != nil {
		s.logger.Error("password reset email failed", "error", err, "user_id", user.ID)
		return false
	}
	return sent
}

func (s *Server) createSession(w http.ResponseWriter, r *http.Request, user models.User) error {
	token, tokenHash, err := auth.NewToken()
	if err != nil {
		return err
	}
	expiresAt := time.Now().UTC().Add(time.Duration(s.cfg.SessionTTLHours) * time.Hour)
	if err := s.store.CreateSession(r.Context(), user.ID, tokenHash, r.UserAgent(), realIP(r), expiresAt); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.secureCookie(),
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
	})
	return nil
}

func (s *Server) currentUser(w http.ResponseWriter, r *http.Request) (models.User, bool) {
	tokenHash := s.sessionTokenHashFromRequest(r)
	if tokenHash == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "auth required"})
		return models.User{}, false
	}
	user, err := s.store.GetUserBySessionTokenHash(r.Context(), tokenHash)
	if err != nil {
		s.clearSessionCookie(w)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "auth required"})
		return models.User{}, false
	}
	return user, true
}

func (s *Server) sessionTokenHashFromRequest(r *http.Request) string {
	cookie, err := r.Cookie(s.cfg.SessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return ""
	}
	return auth.HashToken(cookie.Value)
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cfg.SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.secureCookie(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func (s *Server) oauthStateCookieName() string {
	return s.cfg.SessionCookieName + "_google_state"
}

func (s *Server) clearOAuthStateCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.oauthStateCookieName(),
		Value:    "",
		Path:     "/api/v1/auth/google",
		HttpOnly: true,
		Secure:   s.secureCookie(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func (s *Server) secureCookie() bool {
	return s.cfg.AppEnv == "production"
}

func authUser(user models.User) models.AuthUser {
	return models.AuthUser{
		ID:            user.ID,
		Email:         user.Email,
		FirstName:     user.FirstName,
		LastName:      user.LastName,
		Company:       user.Company,
		Phone:         user.Phone,
		AvatarURL:     user.AvatarURL,
		EmailVerified: user.EmailVerifiedAt != nil,
	}
}

func validateRegisterInput(input models.RegisterInput) (models.RegisterInput, error) {
	email, err := auth.NormalizeEmail(input.Email)
	if err != nil {
		return models.RegisterInput{}, err
	}
	phone, err := auth.NormalizePhone(input.Phone)
	if err != nil {
		return models.RegisterInput{}, err
	}
	firstName := auth.CleanName(input.FirstName)
	lastName := auth.CleanName(input.LastName)
	company := auth.CleanName(input.Company)
	if len([]rune(firstName)) < 2 || len([]rune(firstName)) > 80 {
		return models.RegisterInput{}, errors.New("Имя должно быть 2-80 символов.")
	}
	if len([]rune(lastName)) < 2 || len([]rune(lastName)) > 80 {
		return models.RegisterInput{}, errors.New("Фамилия должна быть 2-80 символов.")
	}
	if len([]rune(company)) > 160 {
		return models.RegisterInput{}, errors.New("Название компании должно быть до 160 символов.")
	}
	if input.Password != input.ConfirmPassword {
		return models.RegisterInput{}, errors.New("Пароли не совпадают.")
	}
	return models.RegisterInput{
		Email:     email,
		FirstName: firstName,
		LastName:  lastName,
		Company:   company,
		Phone:     phone,
	}, nil
}

func validateProfileInput(input models.UpdateProfileInput) (models.UpdateProfileInput, error) {
	phone, err := auth.NormalizePhone(input.Phone)
	if err != nil {
		return models.UpdateProfileInput{}, err
	}
	firstName := auth.CleanName(input.FirstName)
	lastName := auth.CleanName(input.LastName)
	company := auth.CleanName(input.Company)
	avatarURL := strings.TrimSpace(input.AvatarURL)
	if len([]rune(firstName)) < 2 || len([]rune(firstName)) > 80 {
		return models.UpdateProfileInput{}, errors.New("Имя должно быть 2-80 символов.")
	}
	if len([]rune(lastName)) < 2 || len([]rune(lastName)) > 80 {
		return models.UpdateProfileInput{}, errors.New("Фамилия должна быть 2-80 символов.")
	}
	if len([]rune(company)) > 160 {
		return models.UpdateProfileInput{}, errors.New("Название компании должно быть до 160 символов.")
	}
	if len(avatarURL) > maxProfileAvatarURLBytes {
		return models.UpdateProfileInput{}, errors.New("Фото профиля должно быть меньше 180 KB.")
	}
	if avatarURL != "" && !isAllowedAvatarURL(avatarURL) {
		return models.UpdateProfileInput{}, errors.New("Фото профиля должно быть PNG, JPEG, WebP, SVG data URL или HTTPS URL.")
	}
	return models.UpdateProfileInput{
		FirstName: firstName,
		LastName:  lastName,
		Company:   company,
		Phone:     phone,
		AvatarURL: avatarURL,
	}, nil
}

func isAllowedAvatarURL(value string) bool {
	return strings.HasPrefix(value, "https://") ||
		strings.HasPrefix(value, "data:image/png;base64,") ||
		strings.HasPrefix(value, "data:image/jpeg;base64,") ||
		strings.HasPrefix(value, "data:image/webp;base64,") ||
		strings.HasPrefix(value, "data:image/svg+xml;base64,")
}
