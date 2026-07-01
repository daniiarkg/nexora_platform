"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";

export default function ProfilePage() {
  return (
    <AuthGuard>
      {(user) => (
        <main className="profile-page">
          <section className="profile-panel">
            <Link className="auth-logo" href="/">
              <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
            </Link>
            <div className="auth-heading">
              <span>Профиль</span>
              <h1>
                {user.first_name} {user.last_name}
              </h1>
            </div>
            <div className="profile-grid">
              <div>
                <span>Email</span>
                <p>{user.email}</p>
              </div>
              <div>
                <span>Компания</span>
                <p>{user.company || "Не указана"}</p>
              </div>
              <div>
                <span>Телефон</span>
                <p>{user.phone || "Не указан"}</p>
              </div>
              <div>
                <span>Статус</span>
                <p>{user.email_verified ? "Подтвержден" : "Ожидает подтверждения"}</p>
              </div>
            </div>
            <Link className="primary-button profile-action" href="/">
              Открыть дашборд
            </Link>
          </section>
        </main>
      )}
    </AuthGuard>
  );
}
