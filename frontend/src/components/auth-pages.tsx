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
  eyebrow: string;
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
          <span>{eyebrow}</span>
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
          <span>Компания</span>
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
      router.replace("/profile");
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
    <AuthShell eyebrow="Вход" title="Продолжить в Nexora">
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
              autoComplete="one-time-code"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              required
            />
          </label>
        )}

        {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
        <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
          <span>{isSubmitting ? "Проверка" : "Войти"}</span>
          <ArrowRight size={18} />
        </button>
      </form>

      <a className="google-button" href={googleOAuthURL()}>
        <span>G</span>
        <b>Войти через Google</b>
      </a>

      <p className="auth-switch">
        Нет аккаунта? <Link href="/auth/register">Зарегистрироваться</Link>
      </p>
    </AuthShell>
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
        window.setTimeout(() => router.replace("/profile"), 700);
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
