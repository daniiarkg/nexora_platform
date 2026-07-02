"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, LogOut, Save } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { logout, updateProfile } from "@/lib/api";
import type { AuthUser, UpdateProfilePayload } from "@/types";

type Status = { type: "ok" | "error"; text: string } | null;

export default function ProfilePage() {
  return <AuthGuard>{(user) => <ProfileCabinet initialUser={user} />}</AuthGuard>;
}

function ProfileCabinet({ initialUser }: { initialUser: AuthUser }) {
  const [profile, setProfile] = useState(initialUser);
  const [form, setForm] = useState<UpdateProfilePayload>({
    first_name: initialUser.first_name,
    last_name: initialUser.last_name,
    company: initialUser.company,
    phone: initialUser.phone,
    avatar_url: initialUser.avatar_url,
  });
  const [status, setStatus] = useState<Status>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const payload = await updateProfile(form);
      setProfile(payload.user);
      setForm({
        first_name: payload.user.first_name,
        last_name: payload.user.last_name,
        company: payload.user.company,
        phone: payload.user.phone,
        avatar_url: payload.user.avatar_url,
      });
      setStatus({ type: "ok", text: "Профиль обновлен." });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Профиль не удалось обновить." });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    window.location.href = "/auth/login";
  }

  function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > 180_000) {
      setStatus({ type: "error", text: "Фото профиля должно быть меньше 180 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, avatar_url: String(reader.result ?? "") }));
      setStatus({ type: "ok", text: "Фото выбрано. Сохраните профиль, чтобы применить изменения." });
    };
    reader.readAsDataURL(file);
  }

  const displayName = `${profile.first_name} ${profile.last_name}`.trim();

  return (
    <main className="profile-page">
      <section className="profile-panel profile-cabinet">
        <div className="profile-cabinet-top">
          <Link className="auth-logo" href="/">
            <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
          </Link>
          <button className="dashboard-logout" type="button" onClick={handleLogout} aria-label="Выйти">
            <LogOut size={18} />
          </button>
        </div>

        <div className="profile-hero">
          <label className="profile-avatar-upload">
            <img alt="" src={form.avatar_url || "/brand/nexora-icon.png"} />
            <span>
              <Camera size={16} />
            </span>
            <input accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden type="file" onChange={handleAvatar} />
          </label>
          <div className="auth-heading">
            <span>Личный кабинет</span>
            <h1>{displayName || "Профиль"}</h1>
            <p>{profile.email}</p>
          </div>
        </div>

        <form className="profile-form" onSubmit={onSubmit}>
          <div className="auth-field-grid">
            <label className="field">
              <span>Имя</span>
              <input
                autoComplete="given-name"
                value={form.first_name}
                onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Фамилия</span>
              <input
                autoComplete="family-name"
                value={form.last_name}
                onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))}
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Email</span>
            <input value={profile.email} readOnly />
          </label>

          <label className="field">
            <span>Название компании</span>
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

          <div className="profile-status-card">
            <CheckCircle2 size={18} />
            <div>
              <span>Статус аккаунта</span>
              <p>{profile.email_verified ? "Email подтвержден" : "Ожидает подтверждения"}</p>
            </div>
          </div>

          {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}

          <div className="profile-actions">
            <Link className="secondary-save-button" href="/">
              <ArrowLeft size={16} />
              <span>В дашборд</span>
            </Link>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              <Save size={17} />
              <span>{isSubmitting ? "Сохранение" : "Сохранить профиль"}</span>
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
