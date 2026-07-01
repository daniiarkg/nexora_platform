"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CircleHelp,
  Clock3,
  CreditCard,
  DatabaseZap,
  FolderOpen,
  History,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  RadioTower,
  Sparkles,
  Zap,
} from "lucide-react";
import { logout } from "@/lib/api";
import type { AuthUser } from "@/types";

const chartPoints = "M0,250 Q100,220 200,240 T400,150 T600,180 T800,80 T1000,120";

const automations = [
  {
    name: "Тестовый граф продаж",
    icon: DatabaseZap,
    status: "Активен",
    availability: "99.9%",
    report: "Сегодня, 14:20",
    href: "/create?demo=test",
  },
  {
    name: "Lead Qualification AI",
    icon: Sparkles,
    status: "На проверке",
    availability: "98.4%",
    report: "Сегодня, 11:05",
    href: "/create?demo=test",
  },
  {
    name: "Slack Sales Alerts",
    icon: RadioTower,
    status: "Черновик",
    availability: "—",
    report: "Вчера, 18:41",
    href: "/create",
  },
];

const navItems = [
  { label: "Дашборд", icon: LayoutDashboard, active: true },
  { label: "История", icon: History },
  { label: "Оплата", icon: CreditCard },
  { label: "Помощь", icon: CircleHelp },
];

type DashboardProps = {
  user: AuthUser;
};

export function Dashboard({ user }: DashboardProps) {
  const router = useRouter();

  async function handleLogout() {
    await logout().catch(() => undefined);
    router.replace("/auth/login");
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
            return (
              <a className={`dashboard-nav-item ${item.active ? "active" : ""}`} href={`#${item.label}`} key={item.label}>
                <Icon size={20} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-section-title">Проекты</div>
        <div className="project-list">
          <a className="dashboard-nav-item" href="#projects">
            <FolderOpen size={20} />
            <span>E-commerce Sync</span>
          </a>
          <a className="dashboard-nav-item" href="#projects">
            <FolderOpen size={20} />
            <span>Data Pipeline Pro</span>
          </a>
        </div>

        <div className="sidebar-profile">
          <div className="scenario-icon">
            <img alt="" src="/brand/nexora-icon.png" />
          </div>
          <div>
            <p>
              {user.first_name} {user.last_name}
            </p>
            <span>{user.company || "Workspace Owner"}</span>
          </div>
          <button className="dashboard-logout" type="button" onClick={handleLogout} aria-label="Выйти">
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
          <section className="dashboard-section" id="Дашборд">
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
                <h2>Активные автоматизации</h2>
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
                    <th>Отчетность</th>
                  </tr>
                </thead>
                <tbody>
                  {automations.map((automation) => {
                    const Icon = automation.icon;
                    return (
                      <tr key={automation.name}>
                        <td>
                          <div className="automation-name">
                            <Icon size={20} />
                            <Link href={automation.href}>{automation.name}</Link>
                          </div>
                        </td>
                        <td>
                          <span className="status-chip">
                            <span />
                            {automation.status}
                          </span>
                        </td>
                        <td>
                          <div className="availability">
                            <div>
                              <i style={{ width: automation.availability === "—" ? "18%" : automation.availability }} />
                            </div>
                            <span>{automation.availability}</span>
                          </div>
                        </td>
                        <td>
                          <div className="report-cell">
                            <Clock3 size={16} />
                            <span>{automation.report}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-cards" id="Оплата">
            <article className="dashboard-card">
              <div className="scenario-icon">
                <img alt="" src="/brand/nexora-icon.png" />
              </div>
              <h3>Оплата</h3>
              <p>Платежный слой подготовлен под будущий MoR. Провайдер подключается отдельно.</p>
            </article>
            <article className="dashboard-card" id="История">
              <Activity size={24} />
              <h3>История</h3>
              <p>События заявок, правок графов и AI-сессий будут отображаться здесь.</p>
            </article>
            <article className="dashboard-card" id="Помощь">
              <CircleHelp size={24} />
              <h3>Помощь</h3>
              <p>Справка по созданию демонстрационных автоматизаций и подготовке к внедрению.</p>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}
