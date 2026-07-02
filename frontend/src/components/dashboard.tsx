"use client";

import { useState } from "react";
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
import type { AuthUser } from "@/types";

const chartPoints = "M0,250 Q100,220 200,240 T400,150 T600,180 T800,80 T1000,120";

type ProjectStatus = "черновик" | "в обработке" | "в разработке" | "запущен" | "приостановлен";

const projectStatusMeta = {
  черновик: { className: "draft", icon: FilePenLine },
  "в обработке": { className: "processing", icon: Hourglass },
  "в разработке": { className: "development", icon: Wrench },
  запущен: { className: "launched", icon: Rocket },
  приостановлен: { className: "paused", icon: PauseCircle },
} satisfies Record<ProjectStatus, { className: string; icon: typeof FilePenLine }>;

const projects: Array<{
  name: string;
  icon: typeof DatabaseZap;
  status: ProjectStatus;
  availability: string;
  report: string;
  href: string;
}> = [
  {
    name: "Тестовый граф продаж",
    icon: DatabaseZap,
    status: "запущен",
    availability: "99.9%",
    report: "Сегодня, 14:20",
    href: "/create?demo=test",
  },
  {
    name: "Lead Qualification AI",
    icon: Sparkles,
    status: "в обработке",
    availability: "98.4%",
    report: "Сегодня, 11:05",
    href: "/create?demo=test",
  },
  {
    name: "Slack Sales Alerts",
    icon: RadioTower,
    status: "черновик",
    availability: "—",
    report: "Вчера, 18:41",
    href: "/create",
  },
  {
    name: "Data Pipeline Pro",
    icon: DatabaseZap,
    status: "в разработке",
    availability: "—",
    report: "После запуска",
    href: "/create?demo=test",
  },
  {
    name: "E-commerce Sync",
    icon: RadioTower,
    status: "приостановлен",
    availability: "92.1%",
    report: "Недоступен",
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

type DashboardProps = {
  user: AuthUser;
};

export function Dashboard({ user }: DashboardProps) {
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
                <h1>Частота использования системы</h1>
                <p>Анализ активности автоматизаций за последние 30 дней</p>
              </div>
              <div className="range-toggle">
                <button className="active" type="button">
                  30 Дней
                </button>
                <button type="button">7 Дней</button>
              </div>
            </div>

            <div className="analytics-card">
              <svg className="usage-chart" viewBox="0 0 1000 300" role="img" aria-label="График активности">
                <defs>
                  <linearGradient id="dashboard-gradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#00674f" stopOpacity="0.42" />
                    <stop offset="100%" stopColor="#00674f" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${chartPoints} L1000,300 L0,300 Z`} fill="url(#dashboard-gradient)" />
                <path d={chartPoints} fill="none" stroke="#00674f" strokeLinecap="round" strokeWidth="4" />
                <circle cx="800" cy="80" fill="#00674f" r="6" />
              </svg>
              <div className="chart-grid" />
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
