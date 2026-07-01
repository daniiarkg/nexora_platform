"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchAutomationRequests } from "@/lib/api";
import type { AutomationRequest } from "@/types";

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [requests, setRequests] = useState<AutomationRequest[]>([]);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("nexora_admin_token");
    if (saved) {
      setToken(saved);
    }
  }, []);

  async function loadRequests(nextToken = token) {
    if (!nextToken.trim()) {
      setStatus({ type: "error", text: "Введите admin token." });
      return;
    }
    setIsLoading(true);
    setStatus(null);
    try {
      window.localStorage.setItem("nexora_admin_token", nextToken);
      const payload = await fetchAutomationRequests(nextToken);
      setRequests(payload.requests);
      setStatus({ type: "ok", text: `Загружено: ${payload.requests.length}` });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось загрузить заявки." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-wrap">
        <div className="admin-toolbar">
          <div className="brand">
            <div className="brand-mark">
              <ShieldCheck size={24} />
            </div>
            <h1 className="brand-name">Nexora Admin</h1>
          </div>
          <Link className="secondary-button" href="/">
            <ArrowLeft size={18} />
            <span>Canvas</span>
          </Link>
        </div>

        <div className="admin-card">
          <div className="admin-toolbar">
            <label className="field" style={{ minWidth: 280, flex: 1 }}>
              <span>Admin token</span>
              <input
                autoComplete="off"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <button className="primary-button" type="button" onClick={() => loadRequests()} disabled={isLoading}>
              <RefreshCw size={18} />
              <span>{isLoading ? "Загрузка" : "Обновить"}</span>
            </button>
          </div>
          {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
        </div>

        <div className="admin-list">
          {requests.map((request) => (
            <article className="request-row" key={request.id}>
              <div>
                <h3>{request.title}</h3>
                <p>{request.description}</p>
              </div>
              <div>
                <p>{request.customer.name}</p>
                <p>{request.customer.email}</p>
                <p>{request.customer.company || "Без компании"}</p>
              </div>
              <span className="badge">{request.status}</span>
            </article>
          ))}
          {!requests.length ? (
            <div className="admin-card">
              <p style={{ color: "var(--muted)", margin: 0 }}>Заявок пока нет.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
