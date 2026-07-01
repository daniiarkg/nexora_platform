export type Customer = {
  name: string;
  email: string;
  company: string;
};

export type AutomationGraphNode = {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
  position: {
    x: number;
    y: number;
  };
  metadata?: Record<string, string>;
};

export type AutomationGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type AutomationGraph = {
  nodes: AutomationGraphNode[];
  edges: AutomationGraphEdge[];
};

export type AutomationRequestPayload = {
  title: string;
  description: string;
  icon_kind: "preset" | "upload";
  icon_value: string;
  customer: Customer;
  graph: AutomationGraph;
};

export type AutomationRequest = AutomationRequestPayload & {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EmailTemplateSummary = {
  id: string;
  name: string;
  description: string;
  default_metadata: Record<string, string>;
};

export type AdminEmailOptions = {
  from_options: string[];
  templates: EmailTemplateSummary[];
};

export type EmailTemplateRender = {
  template_id: string;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  metadata: Record<string, string>;
};

export type AdminEmailPreviewPayload = {
  template_id: string;
  request_id?: string;
  metadata?: Record<string, string>;
};

export type AdminClientEmailPayload = {
  to: string;
  from: string;
  template_id: string;
  request_id?: string;
  subject: string;
  preheader?: string;
  html: string;
  text: string;
  metadata?: Record<string, string>;
};

export type AdminClientEmailResponse = {
  sent: boolean;
  template_id: string;
  to: string;
  from: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
