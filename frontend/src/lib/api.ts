import type { AutomationRequest, AutomationRequestPayload, ChatMessage } from "@/types";

const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

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
  const response = await fetch(`${apiURL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "request failed";
    throw new Error(message);
  }
  return payload as T;
}

function getApiURLs(): string[] {
  const urls = [CONFIGURED_API_URL];

  if (typeof window !== "undefined") {
    const currentHostAPI = `${window.location.protocol}//${window.location.hostname}:8080`;
    if (!urls.includes(currentHostAPI)) {
      urls.push(currentHostAPI);
    }
  }

  return urls;
}

function isNetworkFetchError(error: unknown) {
  return error instanceof TypeError && /fetch|network|failed/i.test(error.message);
}
