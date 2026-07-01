"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, PlusCircle, Settings, SlidersHorizontal } from "lucide-react";
import {
  defaultWorkspaceSettings,
  readWorkspaceSettings,
  writeWorkspaceSettings,
  type WorkspaceSettings,
} from "@/lib/project-storage";

export function BuilderSettingsPage() {
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(readWorkspaceSettings());
  }, []);

  function updateSetting<Key extends keyof WorkspaceSettings>(key: Key, value: WorkspaceSettings[Key]) {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    writeWorkspaceSettings(settings);
    setSaved(true);
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
        </div>
      </header>

      <section className="project-page-content">
        <div className="project-page-title">
          <Link className="dashboard-secondary-link" href="/create">
            <ArrowLeft size={17} />
            <span>В builder</span>
          </Link>
          <div>
            <h1>Настройки</h1>
            <p>Рабочие параметры проекта и значения для новых заявок.</p>
          </div>
        </div>

        <div className="settings-page-card neu-raised">
          <div className="history-panel-header">
            <div className="panel-title">
              <SlidersHorizontal size={18} />
              <span>Workspace</span>
            </div>
            {saved ? (
              <span className="settings-saved">
                <CheckCircle2 size={15} />
                Сохранено
              </span>
            ) : null}
          </div>

          <div className="settings-page-grid">
            <label className="field">
              <span>Название workspace</span>
              <input
                value={settings.workspaceName}
                onChange={(event) => updateSetting("workspaceName", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Email по умолчанию</span>
              <input
                value={settings.defaultEmail}
                onChange={(event) => updateSetting("defaultEmail", event.target.value)}
                placeholder="owner@company.com"
              />
            </label>

            <label className="toggle-row">
              <input
                checked={settings.autosave}
                type="checkbox"
                onChange={(event) => updateSetting("autosave", event.target.checked)}
              />
              <span>Автосохранение</span>
            </label>
            <label className="toggle-row">
              <input
                checked={settings.snapToGrid}
                type="checkbox"
                onChange={(event) => updateSetting("snapToGrid", event.target.checked)}
              />
              <span>Привязка к сетке</span>
            </label>

            <label className="field settings-notes">
              <span>Заметки</span>
              <textarea
                value={settings.notes}
                onChange={(event) => updateSetting("notes", event.target.value)}
                rows={6}
                placeholder="Внутренние заметки по проекту"
              />
            </label>
          </div>

          <button className="primary-button settings-submit" type="button" onClick={saveSettings}>
            <Settings size={18} />
            <span>Сохранить настройки</span>
          </button>
        </div>
      </section>
    </main>
  );
}
