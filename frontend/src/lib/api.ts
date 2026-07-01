import type {
  AdminClientEmailPayload,
  AdminClientEmailResponse,
  AccessKeyLoginPayload,
  AdminEmailOptions,
  AdminEmailPreviewPayload,
  AuthResponse,
  AutomationRequest,
  AutomationRequestPayload,
  ChatMessage,
  EmailTemplateRender,
  LoginPayload,
  RegisterPayload,
} from "@/types";

const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

type SubmitResponse = {
  request: AutomationRequest;
  email_queued: boolean;
};

type ChatResponse = {
  session_id: string;
  message: string;
  model: string;
};

type AdminListResponse = {
  requests: AutomationRequest[];
  limit: number;
  offset: number;
};

export async function submitAutomationRequest(payload: AutomationRequestPayload): Promise<SubmitResponse> {
  return apiFetch<SubmitResponse>("/api/v1/automation-requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendChatMessage(sessionId: string, messages: ChatMessage[]): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/v1/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      messages,
    }),
  });
}

export async function fetchAutomationRequests(token: string): Promise<AdminListResponse> {
  return apiFetch<AdminListResponse>("/api/v1/admin/automation-requests", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchAdminEmailOptions(token: string): Promise<AdminEmailOptions> {
  return apiFetch<AdminEmailOptions>("/api/v1/admin/email-options", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function renderAdminEmailTemplate(
  token: string,
  payload: AdminEmailPreviewPayload,
): Promise<EmailTemplateRender> {
  return apiFetch<EmailTemplateRender>("/api/v1/admin/email-preview", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function sendAdminClientEmail(
  token: string,
  payload: AdminClientEmailPayload,
): Promise<AdminClientEmailResponse> {
  return apiFetch<AdminClientEmailResponse>("/api/v1/admin/client-emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function register(payload: RegisterPayload): Promise<AuthResponse & { email_sent: boolean; message: string }> {
  return apiFetch<AuthResponse & { email_sent: boolean; message: string }>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginWithAccessKey(payload: AccessKeyLoginPayload): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/v1/auth/access-key", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", {
    method: "POST",
  });
}

export async function fetchCurrentUser(): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/v1/auth/me");
}

export async function confirmEmail(token: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/v1/auth/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendConfirmation(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/v1/auth/resend-confirmation", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({
      token,
      password,
      confirm_password: confirmPassword,
    }),
  });
}

export function googleOAuthURL(): string {
  return `${getApiURLs()[0]}/api/v1/auth/google/start`;
}

export async function createCheckoutIntent(planId: string, customerEmail: string) {
  return apiFetch("/api/v1/payments/checkout-intents", {
    method: "POST",
    body: JSON.stringify({
      plan_id: planId,
      customer_email: customerEmail,
      success_url: `${window.location.origin}/payment/success`,
      cancel_url: `${window.location.origin}/payment/cancel`,
    }),
  });
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let networkError: unknown = null;

  for (const apiURL of getApiURLs()) {
    try {
      return await fetchFromApi<T>(apiURL, path, init);
    } catch (error) {
      if (isNetworkFetchError(error)) {
        networkError = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    "Не удалось подключиться к API. Проверьте, что backend запущен и доступен на порту 8080.",
    { cause: networkError },
  );
}

async function fetchFromApi<T>(apiURL: string, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${apiURL}${path}`, {
      ...init,
      credentials: "include",
      signal: init.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } finally {
    window.clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "request failed";
    throw new Error(message);
  }
  return payload as T;
}

function getApiURLs(): string[] {
  const urls = CONFIGURED_API_URL ? [CONFIGURED_API_URL] : [""];

  if (typeof window !== "undefined") {
    const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const currentHostAPI = `${window.location.protocol}//${window.location.hostname}:8080`;
    if (isLocalHost && !urls.includes(currentHostAPI)) {
      urls.push(currentHostAPI);
    }
  }

  return urls;
}

function isNetworkFetchError(error: unknown) {
  return error instanceof Error && /abort|fetch|network|failed/i.test(`${error.name} ${error.message}`);
}
