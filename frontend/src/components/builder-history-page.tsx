"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, History, PlusCircle, Trash2 } from "lucide-react";
import {
  readProjectHistory,
  writeProjectHistory,
  type ProjectHistoryEvent,
} from "@/lib/project-storage";

export function BuilderHistoryPage() {
  const [events, setEvents] = useState<ProjectHistoryEvent[]>([]);

  useEffect(() => {
    setEvents(readProjectHistory());
  }, []);

  function clearHistory() {
    writeProjectHistory([]);
    setEvents([]);
  }

  return (
    <main className="project-page">
      <header className="project-page-header">
        <Link className="project-logo" href="/">
          <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
        </Link>
        <div className="project-page-actions">
          <Link className="header-action" href="/create">
            <PlusCircle size={18} />
            <span>Новый граф</span>
          </Link>
          <Link className="header-action" href="/create?demo=test">
            <History size={18} />
            <span>Тестовый граф</span>
          </Link>
        </div>
      </header>

      <section className="project-page-content">
        <div className="project-page-title">
          <Link className="dashboard-secondary-link" href="/create">
            <ArrowLeft size={17} />
            <span>В builder</span>
          </Link>
          <div>
            <h1>История</h1>
            <p>Сохранения, генерации графов и действия с canvas.</p>
          </div>
        </div>

        <div className="history-panel neu-raised">
          <div className="history-panel-header">
            <div className="panel-title">
              <History size={18} />
              <span>Журнал правок</span>
            </div>
            <button className="dashboard-secondary-link" type="button" onClick={clearHistory}>
              <Trash2 size={16} />
              <span>Очистить</span>
            </button>
          </div>

          <div className="history-list">
            {events.length > 0 ? (
              events.map((event) => (
                <article className="history-item" key={event.id}>
                  <div className="history-icon">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <h2>{event.action}</h2>
                    <p>{event.detail}</p>
                  </div>
                  <time>{new Date(event.createdAt).toLocaleString("ru-RU")}</time>
                </article>
              ))
            ) : (
              <div className="empty-history">
                <History size={28} />
                <p>История пока пустая.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
