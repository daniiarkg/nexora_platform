export const BUILDER_DRAFT_KEY = "nexora.builder.draft";
export const BUILDER_HISTORY_KEY = "nexora.builder.history";
export const WORKSPACE_SETTINGS_KEY = "nexora.workspace.settings";

export type ProjectHistoryEvent = {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
};

export type WorkspaceSettings = {
  workspaceName: string;
  autosave: boolean;
  snapToGrid: boolean;
  notes: string;
};

export const defaultWorkspaceSettings: WorkspaceSettings = {
  workspaceName: "Nexora Workspace",
  autosave: true,
  snapToGrid: true,
  notes: "",
};

export function readProjectHistory(): ProjectHistoryEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(BUILDER_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeProjectHistory(events: ProjectHistoryEvent[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BUILDER_HISTORY_KEY, JSON.stringify(events.slice(0, 50)));
}

export function appendProjectHistory(action: string, detail: string) {
  if (typeof window === "undefined") {
    return;
  }

  const event: ProjectHistoryEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    detail,
    createdAt: new Date().toISOString(),
  };
  writeProjectHistory([event, ...readProjectHistory()]);
}

export function readWorkspaceSettings(): WorkspaceSettings {
  if (typeof window === "undefined") {
    return defaultWorkspaceSettings;
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_SETTINGS_KEY);
    if (!raw) {
      return defaultWorkspaceSettings;
    }
    return { ...defaultWorkspaceSettings, ...JSON.parse(raw) };
  } catch {
    return defaultWorkspaceSettings;
  }
}

export function writeWorkspaceSettings(settings: WorkspaceSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(WORKSPACE_SETTINGS_KEY, JSON.stringify(settings));
}
