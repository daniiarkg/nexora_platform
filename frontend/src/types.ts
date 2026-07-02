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

export type AuthUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  avatar_url: string;
  email_verified: boolean;
};

export type AuthResponse = {
  user: AuthUser;
};

export type RegisterPayload = {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  password: string;
  confirm_password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type AccessKeyLoginPayload = {
  access_key: string;
};

export type UpdateProfilePayload = {
  first_name: string;
  last_name: string;
  company: string;
  phone: string;
  avatar_url: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};
