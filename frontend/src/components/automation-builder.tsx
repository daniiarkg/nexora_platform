"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
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
  ArrowLeft,
  ArrowUp,
  AtSign,
  Bot,
  Boxes,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Download,
  HelpCircle,
  History,
  Info,
  MailCheck,
  Maximize2,
  MessageCircle,
  MousePointer2,
  Network,
  PlusSquare,
  RotateCcw,
  Route,
  Rocket,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Webhook,
  Zap,
  ZoomIn,
  ZoomOut,
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
    position: { x: 380, y: 80 },
    data: {
      kind: "Триггер",
      title: "Триггер",
      description: '"Когда новый пользователь регистрируется на сайте..."',
      icon: "Zap",
    },
  },
  {
    id: "ai-brief",
    type: "automation",
    position: { x: 740, y: 240 },
    data: {
      kind: "ИИ Анализ",
      title: "ИИ Анализ",
      description: "Классифицировать лид по размеру компании и отрасли. Приоритет для Fintech и SaaS секторов.",
      icon: "BrainCircuit",
    },
  },
  {
    id: "branch",
    type: "automation",
    position: { x: 1140, y: 110 },
    data: {
      kind: "Ветвление",
      title: "Ветвление",
      description: '"Если приоритет высокий..."',
      icon: "Boxes",
    },
  },
  {
    id: "notify",
    type: "automation",
    position: { x: 1140, y: 410 },
    data: {
      kind: "Уведомление",
      title: "Уведомление",
      description: '"Отправить уведомление отделу продаж в Slack."',
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
    style: { stroke: "#00674F", strokeWidth: 2 },
  },
  {
    id: "ai-brief-branch",
    source: "ai-brief",
    target: "branch",
    label: "priority",
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
    style: { stroke: "#00674F", strokeWidth: 2 },
  },
  {
    id: "ai-brief-notify",
    source: "ai-brief",
    target: "notify",
    label: "notify",
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
    style: { stroke: "#00674F", strokeWidth: 2 },
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
  const [showSettings, setShowSettings] = useState(false);
  const [zoomValue, setZoomValue] = useState(85);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Готов собрать схему и подсказать, какие интеграции, данные и проверки понадобятся.",
    },
  ]);
  const [status, setStatus] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            style: { stroke: "#00674F", strokeWidth: 2 },
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
    if (!customerName.trim() || !customerEmail.trim()) {
      setShowSettings(true);
      setStatus({ type: "error", text: "Заполните имя и email в настройках заявки." });
      return;
    }
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
    <main className="flow-shell">
      <header className="flow-header">
        <div className="nexora-logo">
          <Network size={42} />
          <span>Nexora</span>
        </div>

        <div className="flow-header-actions">
          <button className="header-action" type="button">
            <History size={20} />
            <span>История</span>
          </button>
          <button className="header-action" type="button" onClick={() => setShowSettings((current) => !current)}>
            <Settings size={20} />
            <span>Настройки</span>
          </button>
          <button className="save-button" type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Отправка" : "Сохранить"}
          </button>
        </div>
      </header>

      <section className="workflow-canvas">
        <div className="sidebar-dropdown neu-raised">
          <Link className="dropdown-item" href="/admin">
            <ArrowLeft size={18} />
            <span>Вернуться ко всем проектам</span>
          </Link>
          <div className="dropdown-divider" />
          <button className="dropdown-item" type="button">
            <Download size={18} />
            <span>Экспорт</span>
          </button>
          <button className="dropdown-item" type="button">
            <HelpCircle size={18} />
            <span>Справка</span>
          </button>
          <button className="dropdown-item" type="button">
            <MessageCircle size={18} />
            <span>Отправить отзыв</span>
          </button>
        </div>

        <aside className="floating-ai neu-raised">
          <div className="floating-ai-header">
            <div className="panel-title">
              <Bot size={18} fill="currentColor" />
              <span>ИИ Ассистент</span>
            </div>
            <div className="live-dot" />
          </div>

          <div className="floating-ai-body">
            <div className="system-meta">
              <span>Система</span>
              <em>10:42</em>
            </div>
            <div className="assistant-bubble neu-inset">
              Привет! Я готов помочь вам в создании автоматизации. Что мы построим сегодня?
            </div>

            <div className="ai-info neu-inset">
              <Info size={18} />
              <p>Граф является демонстрацией. После отправки заявка попадет в админку и на почту.</p>
            </div>

            <div className="chat-list compact-chat">
              {chatMessages.slice(-4).map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.content}
                </div>
              ))}
              {isChatLoading ? <div className="chat-message assistant">...</div> : null}
            </div>

            {status ? <div className={`notice ${status.type === "error" ? "error" : ""}`}>{status.text}</div> : null}
          </div>

          <div className="floating-ai-footer">
            <Clock3 size={13} />
            <span>Последнее изменение: 2 мин. назад</span>
          </div>
        </aside>

        <div className="right-toolbar neu-raised">
          <button className="tool-button active" type="button" title="Выбрать">
            <MousePointer2 size={20} />
          </button>
          <button className="tool-button" type="button" title="Добавить узел" onClick={() => setMode("create")}>
            <PlusSquare size={20} />
          </button>
          <button className="tool-button" type="button" title="Связать">
            <Route size={20} />
          </button>
          <div className="toolbar-divider" />
          <button className="tool-button danger" type="button" title="Удалить">
            <Trash2 size={20} />
          </button>
        </div>

        {showSettings ? (
          <aside className="settings-popover neu-raised">
            <div className="floating-ai-header">
              <div className="panel-title">
                <Settings size={18} />
                <span>Настройки заявки</span>
              </div>
              <button className="mini-close" type="button" onClick={() => setShowSettings(false)}>
                ×
              </button>
            </div>
            <div className="settings-body">
              <label className="field">
                <span>Название</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="field">
                <span>Имя</span>
                <div className="input-with-icon">
                  <User size={16} />
                  <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Email</span>
                <div className="input-with-icon">
                  <AtSign size={16} />
                  <input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
                </div>
              </label>
              <label className="field">
                <span>Компания</span>
                <div className="input-with-icon">
                  <Building2 size={16} />
                  <input value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} />
                </div>
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
                        <Icon size={18} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="upload-button">
                <Upload size={16} />
                <span>{uploadedIcon ? "Заменить иконку" : "Загрузить иконку"}</span>
                <input
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  hidden
                  type="file"
                  onChange={(event) => handleIconUpload(event.target.files?.[0])}
                />
              </label>
              <button className="primary-button full-width" type="button" onClick={handleSubmit} disabled={isSubmitting}>
                <CheckCircle2 size={18} />
                <span>{isSubmitting ? "Отправка" : "Отправить заявку"}</span>
              </button>
            </div>
          </aside>
        ) : null}

        <ReactFlow
          className="workflow-flow"
          colorMode="dark"
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          maxZoom={1.6}
          minZoom={0.35}
          nodeTypes={nodeTypes}
          nodes={nodes}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          onNodesChange={onNodesChange}
        >
          <Background color="#2a2a2a" gap={40} size={1.2} />
        </ReactFlow>

        <div className="agent-input neu-raised">
          <div className="input-mode-row">
            <div className="segmented neu-inset">
              <button className={mode === "ask" ? "active" : ""} type="button" onClick={() => setMode("ask")}>
                Спросить
              </button>
              <button className={mode === "create" ? "active" : ""} type="button" onClick={() => setMode("create")}>
                Создать
              </button>
            </div>
          </div>
          <div className="agent-input-control">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Опишите задачу или задайте вопрос..."
            />
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
        </div>

        <div className="autosave-status neu-raised">
          <div className="live-dot" />
          <span>Автосохранение активно</span>
          <div className="vertical-divider" />
          <button type="button">История правок</button>
        </div>

        <footer className="canvas-controls">
          <div className="zoom-controls">
            <button type="button" onClick={() => setZoomValue((value) => Math.min(value + 5, 150))}>
              <ZoomIn size={20} />
            </button>
            <button type="button" onClick={() => setZoomValue((value) => Math.max(value - 5, 20))}>
              <ZoomOut size={20} />
            </button>
            <span>{zoomValue}%</span>
          </div>
          <div className="footer-actions">
            <button type="button">
              <RotateCcw size={15} />
              <span>Сброс вида</span>
            </button>
            <button type="button">
              <Maximize2 size={15} />
              <span>По размеру экрана</span>
            </button>
            <div className="vertical-divider" />
            <span className="copyright">© 2024</span>
          </div>
        </footer>
      </section>
    </main>
  );
}

function AutomationNode({ data }: NodeProps<AutomationNodeType>) {
  const Icon = IconByName[data.icon] ?? Zap;
  const isActive = data.kind.toLowerCase().includes("ai") || data.kind.toLowerCase().includes("ии");
  return (
    <div className={`automation-node ${isActive ? "node-active" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="automation-node-header">
        <div className="automation-node-kind">
          <Icon size={15} fill="currentColor" />
          <span>{data.kind}</span>
        </div>
        <span className="node-menu">•••</span>
      </div>
      <div className="automation-node-body">
        <p className="automation-node-title">{data.title}</p>
        <p className="automation-node-desc">{data.description}</p>
      </div>
      <div className="automation-node-ports">
        <span className="node-port" />
        <span className={`node-port ${isActive ? "active" : ""}`} />
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
    style: { stroke: "#00674F", strokeWidth: 2 },
  }));

  return { nodes: nextNodes, edges: nextEdges };
}
