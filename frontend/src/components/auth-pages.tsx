"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Mail, RotateCcw } from "lucide-react";
import {
  confirmEmail,
  confirmPasswordReset,
  googleOAuthURL,
  login,
  loginWithAccessKey,
  register,
  requestPasswordReset,
  resendConfirmation,
} from "@/lib/api";

type Status = { type: "ok" | "error"; text: string } | null;

function AuthShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Link className="auth-logo" href="/">
          <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
        </Link>
        <div className="auth-heading">
          {eyebrow ? <span>{eyebrow}</span> : null}
          <h1>{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

export function RegisterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    company: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      await register({
        email: form.email,
        first_name: form.firstName,
        last_name: form.lastName,
        company: form.company,
        phone: form.phone,
        password: form.password,
        confirm_password: form.confirmPassword,
      });
      router.replace(`/auth/waiting-confirmation?email=${encodeURIComponent(form.email)}`);
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Регистрация не удалась." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell eyebrow="Регистрация" title="Создать аккаунт">
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="auth-field-grid">
          <label className="field">
            <span>Имя</span>
            <input
              autoComplete="given-name"
              value={form.firstName}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Фамилия</span>
            <input
              autoComplete="family-name"
              value={form.lastName}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
              required
            />
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            required
          />
        </label>
        <label className="field">
          <span>Название компании (необязательно)</span>
          <input
            autoComplete="organization"
            value={form.company}
            onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Телефон</span>
          <input
            autoComplete="tel"
            inputMode="tel"
            placeholder="+996 555 000 000"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <div className="password-input">
            <input
              autoComplete="new-password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </label>
        <label className="field">
          <span>Повторите пароль</span>
          <input
            autoComplete="new-password"
            type={showPassword ? "text" : "password"}
            value={form.confirmPassword}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
            required
          />
        </label>
        {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
        <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
          <span>{isSubmitting ? "Создание" : "Зарегистрироваться"}</span>
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="auth-switch">
        Уже есть аккаунт? <Link href="/auth/login">Войти</Link>
      </p>
    </AuthShell>
  );
}

export function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "key">("password");
  const [status, setStatus] = useState<Status>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessKey, setAccessKey] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const payload =
        mode === "password" ? await login({ email, password }) : await loginWithAccessKey({ access_key: accessKey });
      if (!payload.user.email_verified) {
        router.replace(`/auth/waiting-confirmation?email=${encodeURIComponent(payload.user.email)}`);
        return;
      }
      router.replace("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Вход не удался.";
      if (message.includes("Подтвердите")) {
        router.replace(`/auth/waiting-confirmation?email=${encodeURIComponent(email)}`);
        return;
      }
      setStatus({ type: "error", text: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Войдите в аккаунт">
      <div className="auth-tabs" role="tablist">
        <button className={mode === "password" ? "active" : ""} type="button" onClick={() => setMode("password")}>
          <Mail size={16} />
          <span>Email</span>
        </button>
        <button className={mode === "key" ? "active" : ""} type="button" onClick={() => setMode("key")}>
          <KeyRound size={16} />
          <span>Ключ</span>
        </button>
      </div>

      <form className="auth-form" onSubmit={onSubmit}>
        {mode === "password" ? (
          <>
            <label className="field">
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <div className="password-input">
                <input
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <Link className="auth-secondary-link" href="/auth/forgot-password">
              Сбросить пароль
            </Link>
          </>
        ) : (
          <label className="field">
            <span>Ключ доступа</span>
            <input
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect="off"
              spellCheck={false}
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              required
            />
            <small className="field-hint">Введите ключ ровно в том виде, в котором он был выдан и сохранен.</small>
          </label>
        )}

        {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
        <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
          <span>{isSubmitting ? "Проверка" : "Войти"}</span>
          <ArrowRight size={18} />
        </button>
      </form>

      <GoogleMaterialButton />

      <p className="auth-switch">
        Нет аккаунта? <Link href="/auth/register">Зарегистрироваться</Link>
      </p>
    </AuthShell>
  );
}

function GoogleMaterialButton() {
  return (
    <a className="gsi-material-button" href={googleOAuthURL()}>
      <div className="gsi-material-button-state" />
      <div className="gsi-material-button-content-wrapper">
        <div className="gsi-material-button-icon">
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 48 48"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            aria-hidden="true"
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
            <path fill="none" d="M0 0h48v48H0z" />
          </svg>
        </div>
        <span className="gsi-material-button-contents">Continue with Google</span>
        <span className="sr-only">Continue with Google</span>
      </div>
    </a>
  );
}

export function WaitingConfirmationPage({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [isSending, setIsSending] = useState(false);

  async function resend() {
    if (!currentEmail.trim()) {
      setStatus({ type: "error", text: "Введите email." });
      return;
    }
    setIsSending(true);
    setStatus(null);
    try {
      const payload = await resendConfirmation(currentEmail);
      setStatus({ type: "ok", text: payload.message });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Письмо не удалось отправить." });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AuthShell eyebrow="Подтверждение" title="Проверьте почту">
      <div className="auth-state-icon">
        <CheckCircle2 size={28} />
      </div>
      <label className="field">
        <span>Email</span>
        <input value={currentEmail} onChange={(event) => setCurrentEmail(event.target.value)} type="email" />
      </label>
      {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
      <button className="primary-button auth-submit" type="button" onClick={resend} disabled={isSending}>
        <RotateCcw size={17} />
        <span>{isSending ? "Отправка" : "Отправить еще раз"}</span>
      </button>
      <p className="auth-switch">
        Уже подтвердили? <Link href="/auth/login">Войти</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const payload = await requestPasswordReset(email);
      setStatus({ type: "ok", text: payload.message });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось отправить ссылку." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell eyebrow="Сброс пароля" title="Восстановить доступ">
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
        <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
          <span>{isSubmitting ? "Отправка" : "Получить ссылку"}</span>
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="auth-switch">
        Вспомнили пароль? <Link href="/auth/login">Войти</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const payload = await confirmPasswordReset(token, password, confirm);
      setStatus({ type: "ok", text: payload.message });
      window.setTimeout(() => router.replace("/auth/login"), 900);
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Пароль не удалось обновить." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell eyebrow="Новый пароль" title="Задайте пароль">
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Пароль</span>
          <input
            autoComplete="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Повторите пароль</span>
          <input
            autoComplete="new-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </label>
        {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
        <button className="primary-button auth-submit" type="submit" disabled={isSubmitting || !token}>
          <span>{isSubmitting ? "Сохранение" : "Обновить пароль"}</span>
          <ArrowRight size={18} />
        </button>
      </form>
    </AuthShell>
  );
}

export function ConfirmEmailPage({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ type: "ok", text: "Подтверждаем email." });

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus({ type: "error", text: "Ссылка подтверждения некорректна." });
      return;
    }
    confirmEmail(token)
      .then(() => {
        if (!active) {
          return;
        }
        setStatus({ type: "ok", text: "Email подтвержден." });
        window.setTimeout(() => router.replace("/"), 700);
      })
      .catch((error) => {
        if (active) {
          setStatus({
            type: "error",
            text: error instanceof Error ? error.message : "Email не удалось подтвердить.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [router, token]);

  return (
    <AuthShell eyebrow="Email" title="Подтверждение">
      {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
      <p className="auth-switch">
        <Link href="/auth/login">Вернуться ко входу</Link>
      </p>
    </AuthShell>
  );
}
