"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CircleHelp,
  Clock3,
  CreditCard,
  DatabaseZap,
  FileDown,
  FilePenLine,
  FolderOpen,
  History,
  Hourglass,
  LayoutDashboard,
  LogOut,
  PauseCircle,
  PlusCircle,
  RadioTower,
  Rocket,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { logout } from "@/lib/api";
import {
  mockAutomationActivityDataExtractPort,
  type AutomationActivityDataExtractPort,
  type AutomationActivityPoint,
  type AutomationActivityRange,
  type AutomationActivitySeries,
} from "@/lib/activity-data";
import type { AuthUser } from "@/types";

type ProjectStatus = "черновик" | "в обработке" | "в разработке" | "запущен" | "приостановлен";

const projectStatusMeta = {
  черновик: { className: "draft", icon: FilePenLine },
  "в обработке": { className: "processing", icon: Hourglass },
  "в разработке": { className: "development", icon: Wrench },
  запущен: { className: "launched", icon: Rocket },
  приостановлен: { className: "paused", icon: PauseCircle },
} satisfies Record<ProjectStatus, { className: string; icon: typeof FilePenLine }>;

const projects: Array<{
  id: string;
  name: string;
  icon: typeof DatabaseZap;
  status: ProjectStatus;
  availability: string;
  report: string;
  href: string;
}> = [
  {
    id: "sales-demo",
    name: "Тестовый граф продаж",
    icon: DatabaseZap,
    status: "запущен",
    availability: "99.9%",
    report: "Сегодня, 14:20",
    href: "/create?demo=test",
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification AI",
    icon: Sparkles,
    status: "в обработке",
    availability: "98.4%",
    report: "Сегодня, 11:05",
    href: "/create?demo=test",
  },
  {
    id: "slack-sales-alerts",
    name: "Slack Sales Alerts",
    icon: RadioTower,
    status: "черновик",
    availability: "—",
    report: "Вчера, 18:41",
    href: "/create",
  },
  {
    id: "data-pipeline-pro",
    name: "Data Pipeline Pro",
    icon: DatabaseZap,
    status: "в разработке",
    availability: "—",
    report: "После запуска",
    href: "/create?demo=test",
  },
  {
    id: "ecommerce-sync",
    name: "E-commerce Sync",
    icon: RadioTower,
    status: "приостановлен",
    availability: "92.1%",
    report: "Недоступен",
    href: "/create?demo=test",
  },
  {
    id: "customer-support",
    name: "Customer Support QA",
    icon: Sparkles,
    status: "запущен",
    availability: "99.4%",
    report: "Сегодня, 15:10",
    href: "/create?demo=test",
  },
];

const navItems = [
  { label: "Главная", icon: LayoutDashboard, href: "#main", active: true },
  { label: "История", icon: History, href: "/create/history" },
  { label: "Оплата", icon: CreditCard, href: "#payment" },
  { label: "Помощь", icon: CircleHelp, href: "/create/settings" },
];

const mainProjectStatuses = new Set<ProjectStatus>(["запущен", "в обработке", "в разработке"]);
const mainProjects = projects.filter((project) => mainProjectStatuses.has(project.status));
const activeProjects = projects.filter((project) => project.status === "запущен");
const activityDataExtractPort: AutomationActivityDataExtractPort = mockAutomationActivityDataExtractPort;

type DashboardProps = {
  user: AuthUser;
};

export function Dashboard({ user }: DashboardProps) {
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [activityRange, setActivityRange] = useState<AutomationActivityRange>("30d");
  const [selectedAutomationId, setSelectedAutomationId] = useState(activeProjects[0]?.id ?? "");
  const selectedAutomation = activeProjects.find((project) => project.id === selectedAutomationId) ?? activeProjects[0] ?? null;
  const activitySeries = useMemo(
    () => (selectedAutomation ? activityDataExtractPort.extractActivity(selectedAutomation.id, activityRange) : null),
    [activityRange, selectedAutomation?.id],
  );

  async function confirmLogout() {
    await logout().catch(() => undefined);
    router.replace("/auth/login");
  }

  function downloadProjectReport(project: (typeof projects)[number]) {
    if (project.status !== "запущен") {
      return;
    }
    const report = [
      `Отчет по проекту: ${project.name}`,
      `Статус: ${project.status}`,
      `SLI доступность: ${project.availability}`,
      `Обновлен: ${project.report}`,
      "",
      "Сводка: проект запущен, сценарий доступен для мониторинга и дальнейшей оптимизации.",
    ].join("\n");
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "")}-report.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  return (
    <main className="dashboard-page">
      <aside className="dashboard-sidebar">
        <Link className="dashboard-create" href="/create">
          <PlusCircle size={22} />
          <span>Создать автоматизацию</span>
        </Link>

        <nav className="dashboard-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const className = `dashboard-nav-item ${item.active ? "active" : ""}`;
            return (
              <Link className={className} href={item.href} key={item.label}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-section-title">Проекты</div>
        <div className="project-list">
          {projects.map((project) => (
            <Link className="dashboard-nav-item sidebar-project-link" href={project.href} key={project.name}>
              <FolderOpen size={20} />
              <span>{project.name}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-profile">
          <Link className="sidebar-profile-link" href="/profile">
            <div className="scenario-icon profile-avatar-mini">
              <img alt="" src={user.avatar_url || "/brand/nexora-icon.png"} />
            </div>
            <div>
              <p>
                {user.first_name} {user.last_name}
              </p>
              <span>{user.company || "Личный кабинет"}</span>
            </div>
          </Link>
          <button className="dashboard-logout" type="button" onClick={() => setShowLogoutConfirm(true)} aria-label="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <Link className="dashboard-logo" href="/">
            <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
          </Link>
          <div className="dashboard-topbar-actions">
            <div className="system-pill">
              <Zap size={16} />
              <span>Система активна</span>
            </div>
            <button className="dashboard-icon-button" type="button" aria-label="Уведомления">
              <Bell size={20} />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="dashboard-section" id="main">
            <div className="section-heading">
              <div>
                <h1>Активность автоматизации</h1>
                <p>Использование запущенных сценариев по дням</p>
              </div>
              <div className="activity-controls">
                <label>
                  <span>Автоматизация</span>
                  <select
                    value={selectedAutomation?.id ?? ""}
                    onChange={(event) => setSelectedAutomationId(event.target.value)}
                  >
                    {activeProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="range-toggle">
                  <button
                    className={activityRange === "30d" ? "active" : ""}
                    type="button"
                    onClick={() => setActivityRange("30d")}
                  >
                    30 Дней
                  </button>
                  <button className={activityRange === "7d" ? "active" : ""} type="button" onClick={() => setActivityRange("7d")}>
                    7 Дней
                  </button>
                </div>
              </div>
            </div>

            <div className="analytics-card">
              {activitySeries ? <AutomationActivityChart series={activitySeries} /> : null}
            </div>
          </section>

          <section className="dashboard-section" id="projects">
            <div className="section-heading compact">
              <div>
                <h2>Ваши проекты</h2>
                <p>Все рабочие сценарии и заявки собраны в одном месте</p>
              </div>
              <Link className="dashboard-secondary-link" href="/create">
                <PlusCircle size={17} />
                <span>Новый граф</span>
              </Link>
            </div>

            <div className="automation-table-card">
              <table className="automation-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Статус</th>
                    <th>SLI Доступность</th>
                    <th>Отчет</th>
                  </tr>
                </thead>
                <tbody>
                  {mainProjects.map((project) => {
                    const Icon = project.icon;
                    const status = projectStatusMeta[project.status];
                    const StatusIcon = status.icon;
                    const reportAvailable = project.status === "запущен";
                    return (
                      <tr key={project.name}>
                        <td>
                          <div className="automation-name">
                            <Icon size={20} />
                            <Link href={project.href}>{project.name}</Link>
                          </div>
                        </td>
                        <td>
                          <span className={`status-chip status-${status.className}`}>
                            <StatusIcon size={14} />
                            {project.status}
                          </span>
                        </td>
                        <td>
                          <div className="availability">
                            <div>
                              <i style={{ width: project.availability === "—" ? "18%" : project.availability }} />
                            </div>
                            <span>{project.availability}</span>
                          </div>
                        </td>
                        <td>
                          <button
                            className="report-download"
                            type="button"
                            disabled={!reportAvailable}
                            onClick={() => downloadProjectReport(project)}
                            title={reportAvailable ? "Скачать отчет о проекте" : "Отчет доступен только для запущенных проектов"}
                          >
                            {reportAvailable ? <FileDown size={16} /> : <Clock3 size={16} />}
                            <span>{reportAvailable ? "Скачать отчет" : "Недоступен"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-cards" id="payment">
            <article className="dashboard-card">
              <div className="scenario-icon">
                <img alt="" src="/brand/nexora-icon.png" />
              </div>
              <h3>Оплата</h3>
              <p>Платежный слой подготовлен под будущий MoR. Провайдер подключается отдельно.</p>
            </article>
            <Link className="dashboard-card dashboard-card-link" href="/create/history">
              <Activity size={24} />
              <h3>История</h3>
              <p>События заявок, правок графов и AI-сессий будут отображаться здесь.</p>
            </Link>
            <Link className="dashboard-card dashboard-card-link" href="/create/settings">
              <CircleHelp size={24} />
              <h3>Помощь</h3>
              <p>Справка по созданию демонстрационных автоматизаций и подготовке к внедрению.</p>
            </Link>
          </section>
        </div>
      </section>
      {showLogoutConfirm ? (
        <div className="modal-backdrop" role="presentation">
          <section className="save-modal logout-modal neu-raised" role="dialog" aria-modal="true" aria-label="Подтверждение выхода">
            <div className="floating-ai-header">
              <div className="panel-title">
                <LogOut size={18} />
                <span>Выйти из аккаунта?</span>
              </div>
              <button className="mini-close" type="button" onClick={() => setShowLogoutConfirm(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="logout-modal-body">
              <p>Текущая сессия будет завершена. Для доступа к проектам нужно будет войти снова.</p>
              <div className="save-modal-actions">
                <button className="secondary-save-button" type="button" onClick={() => setShowLogoutConfirm(false)}>
                  Остаться
                </button>
                <button className="danger-button" type="button" onClick={confirmLogout}>
                  Выйти
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function AutomationActivityChart({ series }: { series: AutomationActivitySeries }) {
  const chart = useMemo(() => buildChart(series.points), [series.points]);
  const peak = Math.max(...series.points.map((point) => point.runs), 0);
  const lastPoint = series.points[series.points.length - 1];

  return (
    <div className="activity-chart-layout">
      <div className="activity-summary">
        <div>
          <span>Запусков</span>
          <strong>{series.summary.totalRuns.toLocaleString("ru-RU")}</strong>
        </div>
        <div>
          <span>Успешность</span>
          <strong>{series.summary.successRate}%</strong>
        </div>
        <div>
          <span>Ошибок</span>
          <strong>{series.summary.failedRuns}</strong>
        </div>
        <div>
          <span>Среднее время</span>
          <strong>{formatDuration(series.summary.avgDurationMs)}</strong>
        </div>
      </div>
      <svg className="usage-chart" viewBox="0 0 1000 320" role="img" aria-label="График запусков автоматизации">
        <defs>
          <linearGradient id="dashboard-gradient" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#00674f" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#00674f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart-grid-lines">
          {[0, 1, 2, 3].map((line) => (
            <line key={line} x1="44" x2="956" y1={56 + line * 66} y2={56 + line * 66} />
          ))}
        </g>
        {chart.areaPath ? <path d={chart.areaPath} fill="url(#dashboard-gradient)" /> : null}
        {chart.linePath ? (
          <path d={chart.linePath} fill="none" stroke="#00674f" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        ) : null}
        {chart.points.map((point) => (
          <g key={point.source.date}>
            <circle cx={point.x} cy={point.y} r="5" />
            <title>{`${formatChartDate(point.source.date)}: ${point.source.runs} запусков`}</title>
          </g>
        ))}
        <text x="44" y="302">
          {formatChartDate(series.points[0]?.date ?? "")}
        </text>
        <text x="956" y="302" textAnchor="end">
          {formatChartDate(lastPoint?.date ?? "")}
        </text>
        <text x="956" y="44" textAnchor="end">
          Пик: {peak}
        </text>
      </svg>
    </div>
  );
}

function buildChart(points: AutomationActivityPoint[]) {
  const maxRuns = Math.max(...points.map((point) => point.runs), 1);
  const width = 912;
  const left = 44;
  const top = 46;
  const height = 218;
  const mapped = points.map((point, index) => {
    const x = left + (points.length === 1 ? 0 : (index / (points.length - 1)) * width);
    const y = top + height - (point.runs / maxRuns) * height;
    return { x: Math.round(x), y: Math.round(y), source: point };
  });
  return {
    points: mapped,
    linePath: mapped.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" "),
    areaPath:
      mapped.length > 0 ? `${mapped.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ")} L956,264 L44,264 Z` : "",
  };
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) {
    return `${milliseconds} мс`;
  }
  return `${(milliseconds / 1000).toFixed(1)} c`;
}

function formatChartDate(value: string) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(`${value}T00:00:00`));
}
