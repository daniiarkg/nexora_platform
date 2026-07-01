"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowUp,
  AtSign,
  Boxes,
  BrainCircuit,
  Building2,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Download,
  FileJson,
  HelpCircle,
  History,
  Info,
  LifeBuoy,
  MailCheck,
  Maximize2,
  Menu,
  MessageCircle,
  MousePointer2,
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
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { sendChatMessage, submitAutomationRequest } from "@/lib/api";
import {
  appendProjectHistory,
  BUILDER_DRAFT_KEY,
  readWorkspaceSettings,
} from "@/lib/project-storage";
import type { AutomationRequestPayload, ChatMessage } from "@/types";

type Mode = "ask" | "create";
type ToolMode = "select" | "connect";
type NoticeState = { type: "ok" | "error"; text: string } | null;

type AutomationNodeData = {
  title: string;
  description: string;
  icon: string;
  kind: string;
};

type AutomationNodeType = Node<AutomationNodeData, "automation">;

type DraftPayload = {
  title: string;
  prompt: string;
  selectedIcon: string;
  uploadedIcon: string;
  customerName: string;
  customerEmail: string;
  customerCompany: string;
  nodes: AutomationNodeType[];
  edges: Edge[];
  updatedAt: string;
};

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

const nodeTypes = {
  automation: AutomationNode,
};

const defaultEdgeStyle = { stroke: "#00674F", strokeWidth: 2 };

const testNodes: AutomationNodeType[] = [
  {
    id: "trigger",
    type: "automation",
    position: { x: 240, y: 120 },
    data: {
      kind: "Триггер",
      title: "Новый лид",
      description: "Клиент оставил заявку на сайте или в рекламной форме.",
      icon: "Zap",
    },
  },
  {
    id: "enrich",
    type: "automation",
    position: { x: 570, y: 260 },
    data: {
      kind: "Данные",
      title: "Обогащение",
      description: "Проверить источник, компанию, нишу и контактные данные.",
      icon: "DatabaseZap",
    },
  },
  {
    id: "ai-score",
    type: "automation",
    position: { x: 910, y: 130 },
    data: {
      kind: "ИИ Анализ",
      title: "Оценка сделки",
      description: "Определить вероятность сделки, приоритет и следующий шаг.",
      icon: "BrainCircuit",
    },
  },
  {
    id: "crm",
    type: "automation",
    position: { x: 1240, y: 260 },
    data: {
      kind: "CRM",
      title: "Карточка в CRM",
      description: "Создать сделку, задачу менеджеру и краткий комментарий.",
      icon: "Boxes",
    },
  },
  {
    id: "notify",
    type: "automation",
    position: { x: 1570, y: 130 },
    data: {
      kind: "Уведомление",
      title: "Sales alert",
      description: "Отправить резюме и ссылку на сделку ответственному.",
      icon: "MailCheck",
    },
  },
];

const testEdges: Edge[] = [
  createStyledEdge("trigger", "enrich", "lead"),
  createStyledEdge("enrich", "ai-score", "context"),
  createStyledEdge("ai-score", "crm", "score"),
  createStyledEdge("crm", "notify", "summary"),
];

export function AutomationBuilder() {
  const [nodes, setNodes] = useState<AutomationNodeType[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [mode, setMode] = useState<Mode>("ask");
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [title, setTitle] = useState("Новый проект");
  const [prompt, setPrompt] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("BrainCircuit");
  const [uploadedIcon, setUploadedIcon] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [zoomValue, setZoomValue] = useState(85);
  const [lastSavedAt, setLastSavedAt] = useState("только что");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<AutomationNodeType, Edge> | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Готов собрать схему и подсказать, какие интеграции, данные и проверки понадобятся.",
    },
  ]);
  const [agentStatus, setAgentStatus] = useState<NoticeState>(null);
  const [formStatus, setFormStatus] = useState<NoticeState>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialProjectLoaded = useRef(false);
  const initialFitDone = useRef(false);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<AutomationNodeType>[]) => setNodes((current) => applyNodeChanges(changes, current)),
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
            id: `${connection.source}-${connection.target}-${Date.now().toString(36)}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            animated: true,
            style: defaultEdgeStyle,
          },
          current,
        ),
      ),
    [],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams<AutomationNodeType, Edge>) => {
      setSelectedNodeIds(selectedNodes.map((node) => node.id));
      setSelectedEdgeIds(selectedEdges.map((edge) => edge.id));
      setSelectedNodeId((current) => selectedNodes[0]?.id ?? current);
    },
    [],
  );

  useEffect(() => {
    if (initialProjectLoaded.current) {
      return;
    }
    initialProjectLoaded.current = true;

    const workspaceSettings = readWorkspaceSettings();
    setAutosaveEnabled(workspaceSettings.autosave);
    setSnapToGrid(workspaceSettings.snapToGrid);

    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "test") {
      setTitle("Тестовый граф продаж");
      setPrompt(
        "Квалифицировать входящие лиды: обогатить данные, оценить вероятность сделки, создать карточку в CRM и отправить alert менеджеру.",
      );
      setNodes(testNodes);
      setEdges(testEdges);
      appendProjectHistory("Открыт тестовый граф", "Загружен демонстрационный сценарий продаж.");
      window.setTimeout(() => {
        void flowInstance?.fitView({ padding: 0.28, duration: 240 });
      }, 120);
    }
  }, [flowInstance]);

  useEffect(() => {
    if (!autosaveEnabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      writeDraft();
      setLastSavedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, nodes, edges, title, prompt, selectedIcon, uploadedIcon, customerName, customerEmail, customerCompany]);

  useEffect(() => {
    if (!flowInstance || nodes.length === 0 || initialFitDone.current) {
      return;
    }
    initialFitDone.current = true;
    window.setTimeout(() => {
      void flowInstance.fitView({ padding: 0.28, duration: 240 });
    }, 120);
  }, [flowInstance, nodes.length]);

  async function handlePromptAction() {
    setAgentStatus(null);
    const submittedPrompt = prompt.trim();
    if (!submittedPrompt) {
      setAgentStatus({ type: "error", text: "Заполните сценарий автоматизации." });
      return;
    }

    if (mode === "create") {
      const generated = buildDemoGraph(submittedPrompt);
      setNodes(generated.nodes);
      setEdges(generated.edges);
      setSelectedNodeId(generated.nodes[0]?.id ?? null);
      setSelectedNodeIds([]);
      setSelectedEdgeIds([]);
      setPrompt("");
      setAgentStatus({ type: "ok", text: "Демонстрационный граф обновлен." });
      appendProjectHistory("Граф создан из промпта", submittedPrompt.slice(0, 140));
      window.setTimeout(() => {
        void flowInstance?.fitView({ padding: 0.28, duration: 240 });
      }, 120);
      return;
    }

    setIsChatLoading(true);
    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: submittedPrompt }];
    setChatMessages(nextMessages);
    setPrompt("");
    try {
      const answer = await sendChatMessage(sessionId, nextMessages);
      setSessionId(answer.session_id);
      setChatMessages([...nextMessages, { role: "assistant", content: answer.message.trim() || "Ответ пустой." }]);
      appendProjectHistory("AI ответил в чате", submittedPrompt.slice(0, 140));
    } catch (error) {
      setPrompt(submittedPrompt);
      setAgentStatus({ type: "error", text: error instanceof Error ? error.message : "AI недоступен." });
      setChatMessages(chatMessages);
    } finally {
      setIsChatLoading(false);
    }
  }

  function openSaveModal() {
    setFormStatus(null);
    setShowSaveModal(true);
  }

  function saveDraft() {
    writeDraft();
    appendProjectHistory("Черновик сохранен", title);
    setFormStatus({ type: "ok", text: "Черновик сохранен локально." });
    setLastSavedAt(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
  }

  async function handleSubmit() {
    setFormStatus(null);
    if (!customerName.trim() || !customerEmail.trim()) {
      setFormStatus({ type: "error", text: "Заполните имя и email перед отправкой." });
      setShowSaveModal(true);
      return;
    }
    if (nodes.length === 0) {
      setFormStatus({ type: "error", text: "Добавьте хотя бы один узел в граф." });
      setShowSaveModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: AutomationRequestPayload = {
        title,
        description: prompt || "Демонстрационный граф Nexora",
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
      setFormStatus({
        type: "ok",
        text: `Заявка ${result.request.id.slice(0, 8)} отправлена. Email: ${
          result.email_queued ? "в очереди" : "не настроен"
        }.`,
      });
      appendProjectHistory("Заявка отправлена", `${title} -> ${customerEmail}`);
    } catch (error) {
      setFormStatus({ type: "error", text: error instanceof Error ? error.message : "Заявка не отправлена." });
    } finally {
      setIsSubmitting(false);
    }
  }

  function writeDraft() {
    if (typeof window === "undefined") {
      return;
    }

    const draft: DraftPayload = {
      title,
      prompt,
      selectedIcon,
      uploadedIcon,
      customerName,
      customerEmail,
      customerCompany,
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(draft));
  }

  function handleIconUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (file.size > 180_000) {
      setFormStatus({ type: "error", text: "Иконка должна быть меньше 180 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedIcon(String(reader.result ?? ""));
      setFormStatus({ type: "ok", text: "Иконка загружена." });
      appendProjectHistory("Иконка проекта обновлена", file.name);
    };
    reader.readAsDataURL(file);
  }

  function handleAddNode() {
    const id = `node-${Date.now().toString(36)}`;
    const center = flowInstance?.screenToFlowPosition({
      x: Math.floor(window.innerWidth / 2),
      y: Math.floor(window.innerHeight / 2),
    }) ?? { x: 480, y: 220 };

    const nextNode: AutomationNodeType = {
      id,
      type: "automation",
      position: { x: center.x - 128, y: center.y - 80 },
      selected: true,
      data: {
        kind: "Действие",
        title: "Новый узел",
        description: "Опишите задачу этого шага.",
        icon: selectedIcon,
      },
    };
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), nextNode]);
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setSelectedEdgeIds([]);
    setToolMode("select");
    appendProjectHistory("Узел добавлен", nextNode.data.title);
  }

  function handleDeleteSelection() {
    const nodeIds = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    const edgeIds = selectedEdgeIds;
    if (nodeIds.length === 0 && edgeIds.length === 0) {
      setAgentStatus({ type: "error", text: "Выберите узел или связь для удаления." });
      return;
    }

    setNodes((current) => current.filter((node) => !nodeIds.includes(node.id)));
    setEdges((current) =>
      current.filter(
        (edge) => !edgeIds.includes(edge.id) && !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target),
      ),
    );
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    appendProjectHistory("Элемент удален", `${nodeIds.length} узл., ${edgeIds.length} связ.`);
  }

  function handleNodeClick(node: AutomationNodeType) {
    if (toolMode !== "connect") {
      setSelectedNodeId(node.id);
      return;
    }

    if (!connectSourceId) {
      setConnectSourceId(node.id);
      setAgentStatus({ type: "ok", text: "Выберите второй узел для связи." });
      return;
    }

    if (connectSourceId === node.id) {
      setConnectSourceId(null);
      setAgentStatus({ type: "error", text: "Связь должна вести в другой узел." });
      return;
    }

    const edge = createStyledEdge(connectSourceId, node.id, "link");
    setEdges((current) => addEdge(edge, current));
    setConnectSourceId(null);
    setToolMode("select");
    setAgentStatus({ type: "ok", text: "Связь добавлена." });
    appendProjectHistory("Связь добавлена", `${connectSourceId} -> ${node.id}`);
  }

  function updateSelectedNodeData(patch: Partial<AutomationNodeData>) {
    if (!selectedNodeId) {
      return;
    }
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    );
  }

  function exportGraph() {
    const graph = {
      title,
      prompt,
      nodes,
      edges,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "nexora-graph"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    appendProjectHistory("Граф экспортирован", title);
    setMenuOpen(false);
  }

  async function handleZoomIn() {
    await flowInstance?.zoomIn({ duration: 180 });
    setZoomValue(Math.round((flowInstance?.getZoom() ?? 0.85) * 100));
  }

  async function handleZoomOut() {
    await flowInstance?.zoomOut({ duration: 180 });
    setZoomValue(Math.round((flowInstance?.getZoom() ?? 0.85) * 100));
  }

  async function resetView() {
    await flowInstance?.setViewport({ x: 0, y: 0, zoom: 0.85 }, { duration: 220 });
    setZoomValue(85);
    appendProjectHistory("Вид сброшен", title);
  }

  async function fitCanvas() {
    await flowInstance?.fitView({ padding: 0.28, duration: 240 });
    setZoomValue(Math.round((flowInstance?.getZoom() ?? 0.85) * 100));
    appendProjectHistory("Граф подогнан", title);
  }

  return (
    <main className="flow-shell">
      <header className="flow-header">
        <div className="flow-header-brand">
          <button
            className={`burger-button ${menuOpen ? "active" : ""}`}
            type="button"
            aria-expanded={menuOpen}
            aria-label="Открыть меню проекта"
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link className="nexora-logo" href="/">
            <img alt="Nexora" src="/brand/nexora-logo-white.svg" />
          </Link>

          {menuOpen ? (
            <div className="builder-menu-popover neu-raised">
              <Link className="dropdown-item" href="/">
                <ArrowLeft size={18} />
                <span>Вернуться ко всем проектам</span>
              </Link>
              <div className="dropdown-divider" />
              <button className="dropdown-item" type="button" onClick={exportGraph}>
                <Download size={18} />
                <span>Экспорт</span>
              </button>
              <button
                className="dropdown-item"
                type="button"
                onClick={() => {
                  setShowHelpModal(true);
                  setMenuOpen(false);
                }}
              >
                <HelpCircle size={18} />
                <span>Справка</span>
              </button>
              <button
                className="dropdown-item"
                type="button"
                onClick={() => {
                  window.location.href = "mailto:hello@nexora.ai?subject=Nexora%20builder%20feedback";
                  setMenuOpen(false);
                }}
              >
                <MessageCircle size={18} />
                <span>Отправить отзыв</span>
              </button>
            </div>
          ) : null}
        </div>

        <div className="flow-header-actions">
          <Link className="header-action" href="/create/history">
            <History size={20} />
            <span>История</span>
          </Link>
          <Link className="header-action" href="/create/settings">
            <Settings size={20} />
            <span>Настройки</span>
          </Link>
          <button className="save-button" type="button" onClick={openSaveModal}>
            <Save size={17} />
            <span>Сохранить</span>
          </button>
        </div>
      </header>

      <section className="workflow-canvas">
        <aside className="floating-ai neu-raised">
          <div className="floating-ai-header">
            <div className="panel-title">
              <img className="panel-icon-image" alt="" src="/brand/nexora-icon.png" />
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
              {chatMessages.map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.content}
                </div>
              ))}
              {isChatLoading ? <div className="chat-message assistant loading-message">Nexora печатает...</div> : null}
            </div>

            {agentStatus ? (
              <div className={`notice ${agentStatus.type === "error" ? "error" : ""}`}>{agentStatus.text}</div>
            ) : null}
          </div>

          <div className="floating-ai-footer">
            <Clock3 size={13} />
            <span>Последнее изменение: {lastSavedAt}</span>
          </div>
        </aside>

        <div className="right-toolbar neu-raised">
          <button
            className={`tool-button ${toolMode === "select" ? "active" : ""}`}
            type="button"
            aria-label="Выбрать и редактировать узлы"
            data-tooltip="Выбор: кликните узел, чтобы открыть редактор"
            onClick={() => {
              setToolMode("select");
              setConnectSourceId(null);
            }}
          >
            <MousePointer2 size={20} />
          </button>
          <button
            className="tool-button"
            type="button"
            aria-label="Добавить узел"
            data-tooltip="Добавить новый узел в центр текущего вида"
            onClick={handleAddNode}
          >
            <PlusSquare size={20} />
          </button>
          <button
            className={`tool-button ${toolMode === "connect" ? "active" : ""}`}
            type="button"
            aria-label="Связать узлы"
            data-tooltip="Связь: выберите первый узел, затем второй"
            onClick={() => {
              setToolMode("connect");
              setConnectSourceId(null);
              setAgentStatus({ type: "ok", text: "Выберите первый узел для связи." });
            }}
          >
            <Route size={20} />
          </button>
          <div className="toolbar-divider" />
          <button
            className="tool-button danger"
            type="button"
            aria-label="Удалить выбранное"
            data-tooltip="Удалить выбранные узлы или связи"
            onClick={handleDeleteSelection}
          >
            <Trash2 size={20} />
          </button>
        </div>

        {selectedNode ? (
          <aside className="node-editor-popover neu-raised">
            <div className="floating-ai-header">
              <div className="panel-title">
                <FileJson size={18} />
                <span>Редактор узла</span>
              </div>
              <button className="mini-close" type="button" onClick={() => setSelectedNodeId(null)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <div className="settings-body">
              <label className="field">
                <span>Тип</span>
                <input value={selectedNode.data.kind} onChange={(event) => updateSelectedNodeData({ kind: event.target.value })} />
              </label>
              <label className="field">
                <span>Название</span>
                <input
                  value={selectedNode.data.title}
                  onChange={(event) => updateSelectedNodeData({ title: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Описание</span>
                <textarea
                  value={selectedNode.data.description}
                  onChange={(event) => updateSelectedNodeData({ description: event.target.value })}
                  rows={4}
                />
              </label>
              <div className="field">
                <span>Иконка</span>
                <div className="icon-grid">
                  {iconOptions.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        className={`icon-choice ${selectedNode.data.icon === item.key ? "active" : ""}`}
                        key={item.key}
                        onClick={() => updateSelectedNodeData({ icon: item.key })}
                        aria-label={item.label}
                        type="button"
                      >
                        <Icon size={18} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <ReactFlow
          className="workflow-flow"
          colorMode="dark"
          edges={edges}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, animated: true, style: defaultEdgeStyle }}
          fitView={nodes.length > 0}
          fitViewOptions={{ padding: 0.28 }}
          maxZoom={1.6}
          minZoom={0.35}
          nodeTypes={nodeTypes}
          nodes={nodes}
          onConnect={onConnect}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => {
            setFlowInstance(instance);
            setZoomValue(Math.round(instance.getZoom() * 100));
          }}
          onMoveEnd={(_event, viewport: Viewport) => setZoomValue(Math.round(viewport.zoom * 100))}
          onNodeClick={(_event, node) => handleNodeClick(node)}
          onNodesChange={onNodesChange}
          onPaneClick={() => {
            if (toolMode === "connect") {
              setConnectSourceId(null);
            }
          }}
          onSelectionChange={onSelectionChange}
          snapGrid={[20, 20]}
          snapToGrid={snapToGrid}
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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handlePromptAction();
                }
              }}
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
          <span>{autosaveEnabled ? "Автосохранение активно" : "Автосохранение выключено"}</span>
          <div className="vertical-divider" />
          <Link href="/create/history" data-tooltip="Открыть историю сохранений и действий">
            История правок
          </Link>
        </div>

        <footer className="canvas-controls">
          <div className="zoom-controls">
            <button type="button" onClick={handleZoomIn} aria-label="Увеличить масштаб" data-tooltip="Увеличить масштаб графа">
              <ZoomIn size={20} />
            </button>
            <button type="button" onClick={handleZoomOut} aria-label="Уменьшить масштаб" data-tooltip="Уменьшить масштаб графа">
              <ZoomOut size={20} />
            </button>
            <span>{zoomValue}%</span>
          </div>
          <div className="footer-actions">
            <button type="button" onClick={resetView} data-tooltip="Вернуть canvas к стартовому масштабу">
              <RotateCcw size={15} />
              <span>Сброс вида</span>
            </button>
            <button type="button" onClick={fitCanvas} data-tooltip="Подогнать граф под размер экрана">
              <Maximize2 size={15} />
              <span>По размеру экрана</span>
            </button>
          </div>
        </footer>

        {showSaveModal ? (
          <div className="modal-backdrop" role="presentation">
            <section className="save-modal neu-raised" role="dialog" aria-modal="true" aria-label="Сохранение проекта">
              <div className="floating-ai-header">
                <div className="panel-title">
                  <Save size={18} />
                  <span>Сохранение проекта</span>
                </div>
                <button className="mini-close" type="button" onClick={() => setShowSaveModal(false)} aria-label="Закрыть">
                  ×
                </button>
              </div>
              <div className="settings-body">
                <label className="field">
                  <span>Название проекта</span>
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
                  <span>Иконка проекта</span>
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
                          aria-label={item.label}
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
                <div className="save-modal-actions">
                  <button className="secondary-save-button" type="button" onClick={saveDraft}>
                    Сохранить черновик
                  </button>
                  <button className="primary-button" type="button" onClick={handleSubmit} disabled={isSubmitting}>
                    <CheckCircle2 size={18} />
                    <span>{isSubmitting ? "Отправка" : "Отправить заявку"}</span>
                  </button>
                </div>
                {formStatus ? (
                  <div className={`notice ${formStatus.type === "error" ? "error" : ""}`}>{formStatus.text}</div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {showHelpModal ? (
          <div className="modal-backdrop" role="presentation">
            <section className="save-modal help-modal neu-raised" role="dialog" aria-modal="true" aria-label="Справка">
              <div className="floating-ai-header">
                <div className="panel-title">
                  <LifeBuoy size={18} />
                  <span>Справка</span>
                </div>
                <button className="mini-close" type="button" onClick={() => setShowHelpModal(false)} aria-label="Закрыть">
                  ×
                </button>
              </div>
              <div className="help-modal-body">
                <p>Правая панель управляет графом: выбор, добавление, связывание и удаление.</p>
                <p>Нижняя панель управляет масштабом и видом canvas.</p>
                <p>Для отправки заявки откройте сохранение и заполните контактные данные.</p>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AutomationNode({ data, selected }: NodeProps<AutomationNodeType>) {
  const Icon = IconByName[data.icon] ?? Zap;
  const isActive = data.kind.toLowerCase().includes("ai") || data.kind.toLowerCase().includes("ии");
  return (
    <div className={`automation-node ${isActive ? "node-active" : ""} ${selected ? "selected" : ""}`}>
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

function createStyledEdge(source: string, target: string, label: string): Edge {
  return {
    id: `${source}-${target}-${label}`,
    source,
    target,
    label,
    markerEnd: { type: MarkerType.ArrowClosed },
    animated: true,
    style: defaultEdgeStyle,
  };
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
      kind: "Триггер",
      title: "Старт",
      description: `"${shortPrompt}"`,
      icon: "Zap",
      position: { x: 180, y: 150 },
    },
    {
      id: "normalize",
      kind: "Обработка",
      title: "Нормализация",
      description: "Проверка данных, дедупликация и подготовка payload.",
      icon: hasData ? "DatabaseZap" : "Webhook",
      position: { x: 510, y: 260 },
    },
    {
      id: "ai",
      kind: "ИИ Анализ",
      title: "AI решение",
      description: "Оценка намерения, приоритета, следующего действия и риска.",
      icon: "BrainCircuit",
      position: { x: 840, y: 140 },
    },
    {
      id: "system",
      kind: "Интеграция",
      title: hasCRM ? "CRM запись" : "Системное действие",
      description: hasCRM ? "Создание карточки, задачи и комментария в CRM." : "Запись результата во внешнюю систему.",
      icon: hasCRM ? "Boxes" : "Webhook",
      position: { x: 1170, y: 260 },
    },
    {
      id: "notify",
      kind: "Уведомление",
      title: hasEmail ? "Email итог" : "Уведомление",
      description: "Отправка резюме ответственному сотруднику.",
      icon: "MailCheck",
      position: { x: 1500, y: 150 },
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
  ].map(([source, target, label]) => createStyledEdge(source, target, label));

  return { nodes: nextNodes, edges: nextEdges };
}
