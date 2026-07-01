"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowUp,
  Bell,
  Bot,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  CreditCard,
  DatabaseZap,
  History,
  LayoutDashboard,
  MailCheck,
  Menu,
  MessageSquareText,
  Network,
  Rocket,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Webhook,
  Zap,
} from "lucide-react";
import { sendChatMessage, submitAutomationRequest } from "@/lib/api";
import type { AutomationRequestPayload, ChatMessage } from "@/types";

type Mode = "ask" | "create";

type AutomationNodeData = {
  title: string;
  description: string;
  icon: string;
  kind: string;
};

type AutomationNodeType = Node<AutomationNodeData, "automation">;

const iconOptions = [
  { key: "Zap", label: "trigger", icon: Zap },
  { key: "Webhook", label: "webhook", icon: Webhook },
  { key: "BrainCircuit", label: "ai", icon: BrainCircuit },
  { key: "DatabaseZap", label: "data", icon: DatabaseZap },
  { key: "MailCheck", label: "mail", icon: MailCheck },
  { key: "Boxes", label: "ops", icon: Boxes },
  { key: "ShieldCheck", label: "secure", icon: ShieldCheck },
  { key: "Rocket", label: "launch", icon: Rocket },
] as const;

const IconByName = Object.fromEntries(iconOptions.map((item) => [item.key, item.icon]));

const initialNodes: AutomationNodeType[] = [
  {
    id: "trigger",
    type: "automation",
    position: { x: 240, y: 150 },
    data: {
      kind: "trigger",
      title: "Триггер",
      description: "Новая заявка, регистрация или событие в CRM.",
      icon: "Zap",
    },
  },
  {
    id: "ai-brief",
    type: "automation",
    position: { x: 560, y: 250 },
    data: {
      kind: "ai",
      title: "ИИ анализ",
      description: "Классифицирует запрос, извлекает данные и назначает приоритет.",
      icon: "BrainCircuit",
    },
  },
  {
    id: "notify",
    type: "automation",
    position: { x: 880, y: 165 },
    data: {
      kind: "action",
      title: "Уведомление",
      description: "Передает итог в почту, Slack или менеджеру в CRM.",
      icon: "MailCheck",
    },
  },
];

const initialEdges: Edge[] = [
  {
    id: "trigger-ai-brief",
    source: "trigger",
    target: "ai-brief",
    label: "payload",
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
    style: { stroke: "#4edea3", strokeWidth: 2 },
  },
  {
    id: "ai-brief-notify",
    source: "ai-brief",
    target: "notify",
    label: "summary",
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
    style: { stroke: "#4edea3", strokeWidth: 2 },
  },
];

const nodeTypes = {
  automation: AutomationNode,
};

export function AutomationBuilder() {
  const [nodes, setNodes] = useState<AutomationNodeType[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [mode, setMode] = useState<Mode>("ask");
  const [title, setTitle] = useState("AI-воронка продаж");
  const [prompt, setPrompt] = useState(
    "Когда новый лид оставляет заявку, проверь источник, оцени вероятность сделки, создай карточку в CRM и отправь менеджеру краткий план действий.",
  );
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("BrainCircuit");
  const [uploadedIcon, setUploadedIcon] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Готов собрать схему и подсказать, какие интеграции, данные и проверки понадобятся.",
    },
  ]);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const metrics = useMemo(
    () => [
      { label: "Узлы", value: nodes.length },
      { label: "Связи", value: edges.length },
      { label: "Статус", value: "Demo" },
    ],
    [edges.length, nodes.length],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<AutomationNodeType>[]) =>
      setNodes((current) => applyNodeChanges(changes, current)),
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
            style: { stroke: "#4edea3", strokeWidth: 2 },
          },
          current,
        ),
      ),
    [],
  );

  async function handlePromptAction() {
    setStatus(null);
    if (!prompt.trim()) {
      setStatus({ type: "error", text: "Заполните сценарий автоматизации." });
      return;
    }

    if (mode === "create") {
      const generated = buildDemoGraph(prompt);
      setNodes(generated.nodes);
      setEdges(generated.edges);
      setStatus({ type: "ok", text: "Демонстрационный граф обновлен." });
      return;
    }

    setIsChatLoading(true);
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: prompt }];
    setChatMessages(nextMessages);
    try {
      const answer = await sendChatMessage(sessionId, nextMessages);
      setSessionId(answer.session_id);
      setChatMessages([...nextMessages, { role: "assistant", content: answer.message }]);
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "AI недоступен." });
      setChatMessages(chatMessages);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleSubmit() {
    setStatus(null);
    setIsSubmitting(true);
    try {
      const payload: AutomationRequestPayload = {
        title,
        description: prompt,
        icon_kind: uploadedIcon ? "upload" : "preset",
        icon_value: uploadedIcon || selectedIcon,
        customer: {
          name: customerName,
          email: customerEmail,
          company: customerCompany,
        },
        graph: {
          nodes: nodes.map((node) => ({
            id: node.id,
            type: node.data.kind,
            title: node.data.title,
            description: node.data.description,
            icon: node.data.icon,
            position: node.position,
            metadata: {
              source: "nexora-demo-builder",
            },
          })),
          edges: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            label: typeof edge.label === "string" ? edge.label : undefined,
          })),
        },
      };

      const result = await submitAutomationRequest(payload);
      setStatus({
        type: "ok",
        text: `Заявка ${result.request.id.slice(0, 8)} отправлена. Email: ${
          result.email_queued ? "в очереди" : "не настроен"
        }.`,
      });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Заявка не отправлена." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleIconUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (file.size > 180_000) {
      setStatus({ type: "error", text: "Иконка должна быть меньше 180 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedIcon(String(reader.result ?? ""));
      setStatus({ type: "ok", text: "Иконка загружена." });
    };
    reader.readAsDataURL(file);
  }

  return (
    <main className="shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Network size={25} />
          </div>
          <h1 className="brand-name">Nexora</h1>
        </div>

        <div className="header-actions">
          <Link className="ghost-button" href="/admin">
            <LayoutDashboard size={18} />
            <span className="label">Админка</span>
          </Link>
          <button className="ghost-button" type="button">
            <History size={18} />
            <span className="label">История</span>
          </button>
          <button className="ghost-button" type="button">
            <Settings size={18} />
            <span className="label">Настройки</span>
          </button>
          <button className="secondary-button" type="button" onClick={handleSubmit} disabled={isSubmitting}>
            <Save size={18} />
            <span>{isSubmitting ? "Отправка" : "Отправить"}</span>
          </button>
          <button className="icon-button" type="button" aria-label="Меню">
            <Menu size={20} />
          </button>
        </div>
      </header>

      <section className="builder-layout">
        <aside className="panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Sparkles size={18} />
              Проект
            </h2>
            <span className="badge">Draft</span>
          </div>
          <div className="panel-body">
            <label className="field">
              <span>Название</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="field">
              <span>Сценарий</span>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
            <div className="field">
              <span>Иконка</span>
              <div className="icon-grid">
                {iconOptions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className={`icon-choice ${selectedIcon === item.key && !uploadedIcon ? "active" : ""}`}
                      key={item.key}
                      onClick={() => {
                        setUploadedIcon("");
                        setSelectedIcon(item.key);
                      }}
                      title={item.label}
                      type="button"
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="secondary-button">
              <Upload size={17} />
              <span>{uploadedIcon ? "Заменить иконку" : "Загрузить иконку"}</span>
              <input
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                type="file"
                onChange={(event) => handleIconUpload(event.target.files?.[0])}
              />
            </label>
            <div className="metric-grid">
              {metrics.map((metric) => (
                <div className="metric" key={metric.label}>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
            {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
          </div>
        </aside>

        <section className="canvas-shell">
          <ReactFlow
            colorMode="dark"
            edges={edges}
            fitView
            maxZoom={1.6}
            minZoom={0.35}
            nodeTypes={nodeTypes}
            nodes={nodes}
            onConnect={onConnect}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
          >
            <Background color="rgba(220,227,240,0.18)" gap={38} size={1.3} />
            <Controls position="bottom-right" showInteractive={false} />
          </ReactFlow>

          <div className="prompt-dock">
            <div className="segmented">
              <button className={mode === "ask" ? "active" : ""} type="button" onClick={() => setMode("ask")}>
                СПРОСИТЬ
              </button>
              <button className={mode === "create" ? "active" : ""} type="button" onClick={() => setMode("create")}>
                СОЗДАТЬ
              </button>
            </div>
            <textarea className="prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            <button
              className="send-button"
              type="button"
              aria-label={mode === "ask" ? "Спросить AI" : "Создать граф"}
              onClick={handlePromptAction}
              disabled={isChatLoading}
            >
              <ArrowUp size={24} />
            </button>
          </div>
        </section>

        <aside className="panel right-panel">
          <div className="panel-header">
            <h2 className="panel-title">
              <Bot size={18} />
              AI чат
            </h2>
            <Bell size={17} color="#f6c36a" />
          </div>
          <div className="panel-body">
            <div className="chat-list">
              {chatMessages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.content}
                </div>
              ))}
              {isChatLoading ? <div className="chat-message assistant">...</div> : null}
            </div>
            <div className="notice">
              Граф является заявкой на разработку. Исполнение автоматизации подключается после оценки.
            </div>
            <div className="panel-title">
              <CreditCard size={17} />
              Billing
            </div>
            <button className="secondary-button" type="button">
              <CreditCard size={17} />
              <span>Checkout intent</span>
            </button>
            <div className="panel-title">
              <MessageSquareText size={17} />
              Контакты
            </div>
            <label className="field">
              <span>Имя</span>
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Компания</span>
              <input value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={handleSubmit} disabled={isSubmitting}>
              <CheckCircle2 size={18} />
              <span>{isSubmitting ? "Отправка" : "Отправить заявку"}</span>
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

function AutomationNode({ data }: NodeProps<AutomationNodeType>) {
  const Icon = IconByName[data.icon] ?? Zap;
  return (
    <div className="automation-node">
      <Handle type="target" position={Position.Left} />
      <div className="automation-node-header">
        <Icon size={16} />
        <span>{data.kind}</span>
      </div>
      <div className="automation-node-body">
        <p className="automation-node-title">{data.title}</p>
        <p className="automation-node-desc">{data.description}</p>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function buildDemoGraph(prompt: string): { nodes: AutomationNodeType[]; edges: Edge[] } {
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  const shortPrompt = cleanPrompt.length > 96 ? `${cleanPrompt.slice(0, 93)}...` : cleanPrompt;
  const hasEmail = /mail|email|почт|gmail|уведом/i.test(cleanPrompt);
  const hasCRM = /crm|amo|bitrix|hubspot|лид|сделк|ворон/i.test(cleanPrompt);
  const hasData = /таблиц|баз|data|postgres|sheet|отчет|аналит/i.test(cleanPrompt);

  const specs = [
    {
      id: "trigger",
      kind: "trigger",
      title: "Триггер",
      description: `"${shortPrompt}"`,
      icon: "Zap",
      position: { x: 160, y: 150 },
    },
    {
      id: "normalize",
      kind: "process",
      title: "Нормализация",
      description: "Проверка данных, дедупликация и подготовка payload.",
      icon: hasData ? "DatabaseZap" : "Webhook",
      position: { x: 470, y: 250 },
    },
    {
      id: "ai",
      kind: "ai",
      title: "AI решение",
      description: "Оценка намерения, приоритета, следующего действия и риска.",
      icon: "BrainCircuit",
      position: { x: 780, y: 140 },
    },
    {
      id: "system",
      kind: "integration",
      title: hasCRM ? "CRM запись" : "Системное действие",
      description: hasCRM ? "Создание карточки, задачи и комментария в CRM." : "Запись результата во внешнюю систему.",
      icon: hasCRM ? "Boxes" : "Webhook",
      position: { x: 1090, y: 240 },
    },
    {
      id: "notify",
      kind: "notify",
      title: hasEmail ? "Email итог" : "Уведомление",
      description: "Отправка резюме ответственному сотруднику.",
      icon: "MailCheck",
      position: { x: 1400, y: 150 },
    },
  ] satisfies Array<AutomationNodeData & { id: string; position: { x: number; y: number } }>;

  const nextNodes: AutomationNodeType[] = specs.map((spec) => ({
    id: spec.id,
    type: "automation",
    position: spec.position,
    data: {
      title: spec.title,
      description: spec.description,
      icon: spec.icon,
      kind: spec.kind,
    },
  }));

  const nextEdges: Edge[] = [
    ["trigger", "normalize", "event"],
    ["normalize", "ai", "context"],
    ["ai", "system", "decision"],
    ["system", "notify", "summary"],
  ].map(([source, target, label]) => ({
    id: `${source}-${target}`,
    source,
    target,
    label,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
    style: { stroke: "#4edea3", strokeWidth: 2 },
  }));

  return { nodes: nextNodes, edges: nextEdges };
}
