"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCode2, Mail, RefreshCw, Send, ShieldCheck, Wand2 } from "lucide-react";
import {
  fetchAdminEmailOptions,
  fetchAutomationRequests,
  renderAdminEmailTemplate,
  sendAdminClientEmail,
} from "@/lib/api";
import type { AdminEmailOptions, AutomationRequest, EmailTemplateSummary } from "@/types";

type Notice = { type: "ok" | "error"; text: string };

type EmailForm = {
  requestId: string;
  to: string;
  from: string;
  templateId: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  metadataText: string;
};

const emptyEmailForm: EmailForm = {
  requestId: "",
  to: "",
  from: "",
  templateId: "",
  subject: "",
  preheader: "",
  html: "",
  text: "",
  metadataText: "{}",
};

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [requests, setRequests] = useState<AutomationRequest[]>([]);
  const [emailOptions, setEmailOptions] = useState<AdminEmailOptions>({ from_options: [], templates: [] });
  const [status, setStatus] = useState<Notice | null>(null);
  const [emailStatus, setEmailStatus] = useState<Notice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [emailForm, setEmailForm] = useState<EmailForm>(emptyEmailForm);

  useEffect(() => {
    const saved = window.localStorage.getItem("nexora_admin_token");
    if (saved) {
      setToken(saved);
    }
  }, []);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === emailForm.requestId) ?? null,
    [requests, emailForm.requestId],
  );
  const selectedTemplate = useMemo(
    () => emailOptions.templates.find((template) => template.id === emailForm.templateId) ?? null,
    [emailOptions.templates, emailForm.templateId],
  );

  async function loadRequests(nextToken = token) {
    if (!nextToken.trim()) {
      setStatus({ type: "error", text: "Введите admin token." });
      return;
    }
    setIsLoading(true);
    setStatus(null);
    setEmailStatus(null);
    try {
      window.localStorage.setItem("nexora_admin_token", nextToken);
      const [requestPayload, optionPayload] = await Promise.all([
        fetchAutomationRequests(nextToken),
        fetchAdminEmailOptions(nextToken),
      ]);
      setRequests(requestPayload.requests);
      setEmailOptions(optionPayload);
      setStatus({ type: "ok", text: `Загружено: ${requestPayload.requests.length}` });

      const request = requestPayload.requests[0] ?? null;
      const template =
        optionPayload.templates.find((item) => item.id === "custom_client") ?? optionPayload.templates[0] ?? null;
      if (template) {
        await prepareTemplate({
          nextToken,
          nextRequests: requestPayload.requests,
          nextOptions: optionPayload,
          requestId: request?.id ?? "",
          templateId: template.id,
          from: optionPayload.from_options[0] ?? "",
          to: request?.customer.email ?? "",
        });
      }
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось загрузить админку." });
    } finally {
      setIsLoading(false);
    }
  }

  async function prepareTemplate(input: {
    nextToken?: string;
    nextRequests?: AutomationRequest[];
    nextOptions?: AdminEmailOptions;
    requestId?: string;
    templateId?: string;
    from?: string;
    to?: string;
    metadata?: Record<string, string>;
  } = {}) {
    const nextToken = input.nextToken ?? token;
    const nextRequests = input.nextRequests ?? requests;
    const nextOptions = input.nextOptions ?? emailOptions;
    const requestId = input.requestId ?? emailForm.requestId;
    const templateId = input.templateId ?? emailForm.templateId;
    const template = nextOptions.templates.find((item) => item.id === templateId);
    const request = nextRequests.find((item) => item.id === requestId) ?? null;

    if (!nextToken.trim() || !template) {
      return;
    }

    setIsRendering(true);
    setEmailStatus(null);
    try {
      const metadata = input.metadata ?? buildMetadata(template, request);
      const rendered = await renderAdminEmailTemplate(nextToken, {
        template_id: template.id,
        request_id: request?.id,
        metadata,
      });
      setEmailForm((current) => ({
        ...current,
        requestId,
        templateId: template.id,
        from: input.from ?? current.from ?? nextOptions.from_options[0] ?? "",
        to: input.to ?? request?.customer.email ?? current.to,
        subject: rendered.subject,
        preheader: rendered.preheader,
        html: rendered.html,
        text: rendered.text,
        metadataText: JSON.stringify(rendered.metadata, null, 2),
      }));
      setEmailStatus({ type: "ok", text: "Шаблон подготовлен." });
    } catch (error) {
      setEmailStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось собрать шаблон." });
    } finally {
      setIsRendering(false);
    }
  }

  async function refreshFromMetadata() {
    const metadata = parseMetadata(emailForm.metadataText);
    if (!metadata.ok) {
      setEmailStatus({ type: "error", text: metadata.error });
      return;
    }
    await prepareTemplate({ metadata: metadata.value });
  }

  async function sendEmail() {
    const metadata = parseMetadata(emailForm.metadataText);
    if (!metadata.ok) {
      setEmailStatus({ type: "error", text: metadata.error });
      return;
    }
    setIsSending(true);
    setEmailStatus(null);
    try {
      const result = await sendAdminClientEmail(token, {
        to: emailForm.to,
        from: emailForm.from,
        template_id: emailForm.templateId,
        request_id: emailForm.requestId || undefined,
        subject: emailForm.subject,
        preheader: emailForm.preheader,
        html: emailForm.html,
        text: emailForm.text,
        metadata: metadata.value,
      });
      setEmailStatus({
        type: "ok",
        text: result.sent ? `Письмо отправлено на ${result.to}.` : "Письмо не было отправлено.",
      });
    } catch (error) {
      setEmailStatus({ type: "error", text: error instanceof Error ? error.message : "Не удалось отправить письмо." });
    } finally {
      setIsSending(false);
    }
  }

  function selectRequest(request: AutomationRequest) {
    void prepareTemplate({ requestId: request.id, to: request.customer.email });
  }

  function selectTemplate(templateId: string) {
    const template = emailOptions.templates.find((item) => item.id === templateId);
    void prepareTemplate({ templateId, metadata: buildMetadata(template, selectedRequest) });
  }

  return (
    <main className="admin-page">
      <section className="admin-wrap">
        <div className="admin-toolbar">
          <div className="brand">
            <img className="admin-brand-logo" alt="Nexora" src="/brand/nexora-logo-white.svg" />
            <span className="admin-label">
              <ShieldCheck size={16} />
              Admin
            </span>
          </div>
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

        <div className="admin-grid">
          <section className="admin-card admin-list-card">
            <div className="admin-section-heading">
              <div>
                <span>Клиенты</span>
                <h2>Заявки</h2>
              </div>
              <Mail size={18} />
            </div>
            <div className="admin-list">
              {requests.map((request) => (
                <button
                  className={`request-row request-row-button ${
                    request.id === emailForm.requestId ? "selected" : ""
                  }`}
                  key={request.id}
                  type="button"
                  onClick={() => selectRequest(request)}
                >
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
                </button>
              ))}
              {!requests.length ? (
                <p className="admin-empty">Заявок пока нет. После отправки графа клиенты появятся здесь.</p>
              ) : null}
            </div>
          </section>

          <section className="admin-card admin-email-card">
            <div className="admin-section-heading">
              <div>
                <span>Отправка</span>
                <h2>Письмо клиенту</h2>
              </div>
              <FileCode2 size={18} />
            </div>

            <div className="admin-email-form">
              <label className="field">
                <span>Клиент</span>
                <select
                  value={emailForm.requestId}
                  onChange={(event) => {
                    const request = requests.find((item) => item.id === event.target.value);
                    if (request) {
                      selectRequest(request);
                    }
                  }}
                >
                  <option value="">Без заявки</option>
                  {requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.customer.name} - {request.customer.email}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>From</span>
                <select
                  value={emailForm.from}
                  onChange={(event) => setEmailForm((current) => ({ ...current, from: event.target.value }))}
                >
                  {emailOptions.from_options.map((from) => (
                    <option key={from} value={from}>
                      {from}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Получатель</span>
                <input
                  type="email"
                  value={emailForm.to}
                  onChange={(event) => setEmailForm((current) => ({ ...current, to: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Шаблон</span>
                <select value={emailForm.templateId} onChange={(event) => selectTemplate(event.target.value)}>
                  {emailOptions.templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedTemplate ? <p className="template-description">{selectedTemplate.description}</p> : null}

              <label className="field full">
                <span>Тема</span>
                <input
                  value={emailForm.subject}
                  onChange={(event) => setEmailForm((current) => ({ ...current, subject: event.target.value }))}
                />
              </label>

              <label className="field full">
                <span>Preheader</span>
                <input
                  value={emailForm.preheader}
                  onChange={(event) => setEmailForm((current) => ({ ...current, preheader: event.target.value }))}
                />
              </label>

              <label className="field full">
                <span>Metadata JSON</span>
                <textarea
                  className="metadata-editor"
                  value={emailForm.metadataText}
                  onChange={(event) => setEmailForm((current) => ({ ...current, metadataText: event.target.value }))}
                />
              </label>

              <div className="admin-email-actions">
                <button className="secondary-save-button" type="button" onClick={refreshFromMetadata} disabled={isRendering}>
                  <Wand2 size={17} />
                  <span>{isRendering ? "Сборка" : "Обновить HTML"}</span>
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={sendEmail}
                  disabled={isSending || !emailForm.to || !emailForm.from || !emailForm.templateId}
                >
                  <Send size={17} />
                  <span>{isSending ? "Отправка" : "Отправить"}</span>
                </button>
              </div>

              {emailStatus ? (
                <div className={`notice ${emailStatus.type === "error" ? "error" : ""}`}>{emailStatus.text}</div>
              ) : null}

              <label className="field full">
                <span>HTML</span>
                <textarea
                  className="html-editor"
                  value={emailForm.html}
                  onChange={(event) => setEmailForm((current) => ({ ...current, html: event.target.value }))}
                />
              </label>

              <label className="field full">
                <span>Plain text</span>
                <textarea
                  className="text-editor"
                  value={emailForm.text}
                  onChange={(event) => setEmailForm((current) => ({ ...current, text: event.target.value }))}
                />
              </label>

              <div className="email-preview">
                <span>Preview</span>
                <iframe title="Email preview" sandbox="" srcDoc={emailForm.html} />
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function buildMetadata(template: EmailTemplateSummary | null | undefined, request: AutomationRequest | null) {
  const metadata: Record<string, string> = { ...(template?.default_metadata ?? {}) };
  if (request) {
    metadata.customer_name = request.customer.name;
    metadata.customer_email = request.customer.email;
    metadata.customer_company = request.customer.company || "Без компании";
    metadata.request_title = request.title;
    metadata.request_description = request.description;
    metadata.request_id = request.id;
  }
  if (template?.id === "custom_client" && request) {
    metadata.headline = `По заявке "${request.title}"`;
    metadata.body_text = "Мы посмотрели ваш сценарий и готовы обсудить следующие шаги по запуску автоматизации.";
    metadata.footer_note = "Ответьте на это письмо, если хотите уточнить детали проекта.";
  }
  return metadata;
}

function parseMetadata(input: string): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(input || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Metadata должен быть JSON-объектом." };
    }
    const normalized = Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === "string" ? value : String(value)]),
    );
    return { ok: true, value: normalized };
  } catch {
    return { ok: false, error: "Metadata JSON содержит ошибку синтаксиса." };
  }
}
