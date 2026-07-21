// ── Types ─────────────────────────────────────────────────────────────────────

export type EntryType =
  | "Issue" | "Workflow" | "Knowledge" | "Troubleshooting"
  | "HowTo" | "Decision" | "KnownLimitation";
export type Status   = "Draft" | "Active" | "NeedsReview" | "Archived";
export type Severity = "Low" | "Medium" | "High" | "Critical";
export type Audience = "All" | "Specific";

export interface KnowledgeEntry {
  id: string; entryType: EntryType; title: string; summary: string;
  originalInput: string; problem?: string; rootCause?: string;
  solution?: string; prevention?: string; detailedContent?: string;
  category?: string; severity: Severity; project?: string; module?: string;
  affectedService?: string; confidenceScore: number; status: Status;
  tags: string[]; technologies: string[]; createdAt: string; updatedAt: string;
  capturedBy?: string;
}

export interface SearchResult {
  knowledgeEntryId: string; chunkId: string; chunkType: string; title: string;
  summary: string; problem?: string; rootCause?: string; solution?: string;
  prevention?: string; detailedContent?: string; project?: string;
  module?: string; snippet: string; similarity: number;
}

export interface AnalysisResult {
  entry: KnowledgeEntry; suggestedEntries: KnowledgeEntry[];
  missingInformation: string[]; suggestedQuestions: string[];
  potentialDuplicates: SearchResult[];
}

export interface Citation {
  knowledgeEntryId: string; chunkId: string; title: string;
  chunkType: string; snippet: string; similarity: number;
}

export interface AskResult {
  answer: string; grounded: boolean; confidence: number;
  sources: Citation[]; suggestedFollowUps: string[]; sessionId?: string;
}

export interface ChatTurn   { role: "user" | "assistant"; content: string; }
export interface PagedResult<T> { items: T[]; page: number; pageSize: number; totalCount: number; totalPages: number; }
export interface Revision   { id: string; knowledgeEntryId: string; revisionNumber: number; snapshotJson: string; createdAt: string; }
export interface FeedbackStats { total: number; helpful: number; comments: { username?: string; comment?: string; createdAt: string }[]; }

export interface ListQuery {
  query?: string; entryType?: EntryType | ""; project?: string; module?: string;
  severity?: Severity | ""; status?: Status | ""; technology?: string; tag?: string;
  sort?: string; page?: number; pageSize?: number; includeArchived?: boolean;
}

// Auth
export interface AuthUser { username: string; displayName: string; email: string; }
export interface LoginResponse { token: string; user: AuthUser; }

// Questions
export interface QuestionAnswerDto {
  id: string; answer: string; answeredBy: string;
  knowledgeEntryId?: string; knowledgeEntryTitle?: string; answeredAt: string;
}
export interface OpenQuestionDto {
  id: string; text: string; raisedBy: string; audience: Audience;
  targetUsernames: string[]; project?: string; raisedAt: string;
  isResolved: boolean; answers: QuestionAnswerDto[];
}

// Chat history
export interface ChatSession {
  sessionId: string; firstQuestion: string;
  startedAt: string; lastActivityAt: string; turnCount: number;
}
export interface ChatSessionDetail {
  id: string; startedAt: string;
  turns: { role: string; content: string }[];
}

// Enrich feature
export interface FieldChange {
  field: string;
  oldValue?: string;
  newValue?: string;
  isNew: boolean;
}
export interface EnrichResult {
  summary: string;
  changes: FieldChange[];
  proposedEntry: KnowledgeEntry;
  enrichedBy?: string;
}

// Capture completeness
export interface CaptureSession {
  sessionId: string; entryType: EntryType; project?: string; module?: string;
  currentInput: string; missingFields: string[];
  followUpQuestions: string[]; readyToCommit: boolean;
  round: number;
}

// Structured per-field answer from the selective follow-up UI
export interface FieldAnswer { field: string; answer: string; }

// Document upload
export interface DocumentUploadResult {
  fileName: string;
  chunksExtracted: number;
  chunksAnalysed: number;
  result: AnalysisResult;
}

// ── Token store (in-memory, survives page navigation but not hard refresh) ─────
// Falls back to sessionStorage for hard refresh survival (token is not sensitive
// enough to warrant localStorage avoidance here — it's already in an HttpOnly
// cookie for same-origin use; this is only used for cross-origin dev).
let _token: string | null = sessionStorage.getItem("kd_token_bearer");

export function setAuthToken(token: string | null) {
  _token = token;
  if (token) sessionStorage.setItem("kd_token_bearer", token);
  else sessionStorage.removeItem("kd_token_bearer");
}

export function getAuthToken() { return _token; }

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Don't set Content-Type for FormData — browser sets it with the correct boundary
  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = isFormData
    ? {}
    : { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) };

  // Always send Bearer token if we have one — handles cross-origin scenarios
  // where the HttpOnly cookie can't be forwarded by the browser.
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    setAuthToken(null);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? body?.title ?? body?.detail ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const qs = (values: Record<string, unknown>) => {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  return p.toString();
};

const json = (body: unknown) => JSON.stringify(body);

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  login:  (username: string, password: string) =>
    request<LoginResponse>("/api/auth/login", { method: "POST", body: json({ username, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me:     () => request<AuthUser>("/api/auth/me"),
};

// ── Users API ─────────────────────────────────────────────────────────────────

export const usersApi = {
  list:   () => request<{ username: string; displayName?: string; email?: string; isActive: boolean; createdAt: string }[]>("/api/users"),
  create: (u: { username: string; displayName?: string; email?: string; isActive: boolean }) =>
    request<void>("/api/users", { method: "POST", body: json({ ...u, createdAt: new Date().toISOString() }) }),
  update: (username: string, u: { displayName?: string; email?: string; isActive: boolean }) =>
    request<void>(`/api/users/${username}`, { method: "PUT", body: json({ username, ...u, createdAt: "" }) }),
};

// ── Knowledge API ─────────────────────────────────────────────────────────────

export const knowledgeApi = {
  list:    (q: ListQuery = {}) => request<PagedResult<KnowledgeEntry>>(`/api/knowledge?${qs({ page: 1, pageSize: 20, ...q })}`),
  get:     (id: string)        => request<KnowledgeEntry>(`/api/knowledge/${id}`),
  analyze: (input: { rawInput: string; entryType: EntryType; project?: string; module?: string }) =>
    request<AnalysisResult>("/api/knowledge/analyze", { method: "POST", body: json(input) }),
  create:  (entry: KnowledgeEntry, allowDuplicate = false) =>
    request<KnowledgeEntry>(`/api/knowledge?allowDuplicate=${allowDuplicate}`, { method: "POST", body: json(entry) }),
  update:  (entry: KnowledgeEntry) =>
    request<KnowledgeEntry>(`/api/knowledge/${entry.id}`, { method: "PUT", body: json(entry) }),
  archive: (id: string) => request<KnowledgeEntry>(`/api/knowledge/${id}/archive`, { method: "POST" }),
  restore: (id: string) => request<KnowledgeEntry>(`/api/knowledge/${id}/restore`, { method: "POST" }),
  revisions: (id: string) => request<Revision[]>(`/api/knowledge/${id}/revisions`),
  similar:   (id: string) => request<SearchResult[]>(`/api/knowledge/${id}/similar`),
  reindex:   (id: string) => request<void>(`/api/knowledge/${id}/reindex`, { method: "POST" }),
  feedback:  (id: string, helpful: boolean, comment?: string) =>
    request<void>(`/api/knowledge/${id}/feedback`, { method: "POST", body: json({ helpful, comment }) }),
  feedbackStats: (id: string) => request<FeedbackStats>(`/api/knowledge/${id}/feedback`),
  enrich: (id: string, additionalNote: string) =>
    request<EnrichResult>(`/api/knowledge/${id}/enrich`, { method: "POST", body: json({ additionalNote }) }),
};

// ── Assistant API ─────────────────────────────────────────────────────────────

export const assistantApi = {
  ask: (question: string, history: ChatTurn[] = [], project?: string, module?: string, sessionId?: string) =>
    request<AskResult>("/api/assistant/ask", {
      method: "POST",
      body: json({ question, project, module, history, sessionId }),
    }),
};

// ── Chat history API ──────────────────────────────────────────────────────────

export const chatHistoryApi = {
  list:      ()             => request<ChatSession[]>("/api/chat/history"),
  getDetail: (id: string)   => request<ChatSessionDetail>(`/api/chat/history/${id}`),
};

// ── Questions API ─────────────────────────────────────────────────────────────

export const questionsApi = {
  list:    (resolved?: boolean, project?: string) =>
    request<OpenQuestionDto[]>(`/api/questions?${qs({ resolved, project })}`),
  get:     (id: string) => request<OpenQuestionDto>(`/api/questions/${id}`),
  raise:   (text: string, audience: Audience, targetUsernames?: string[], project?: string) =>
    request<OpenQuestionDto>("/api/questions", {
      method: "POST", body: json({ text, audience, targetUsernames, project }),
    }),
  answer:  (id: string, answer: string, knowledgeEntryId?: string) =>
    request<OpenQuestionDto>(`/api/questions/${id}/answer`, {
      method: "POST", body: json({ answer, knowledgeEntryId }),
    }),
  resolve: (id: string) => request<void>(`/api/questions/${id}/resolve`, { method: "POST" }),
};

// ── Capture completeness API ──────────────────────────────────────────────────

export const captureApi = {
  /**
   * Evaluate completeness of the current note.
   * @param fieldAnswers  Structured answers from the selective follow-up UI.
   *                      Pass only the questions the user chose to answer.
   */
  evaluate: (
    entryType: EntryType,
    currentInput: string,
    sessionId?: string,
    project?: string,
    module?: string,
    fieldAnswers?: FieldAnswer[],
  ) =>
    request<CaptureSession>("/api/capture/evaluate", {
      method: "POST",
      body: json({ entryType, currentInput, sessionId, project, module,
        fieldAnswers: fieldAnswers?.length ? fieldAnswers : undefined }),
    }),

  uploadDocument: (
    file: File,
    entryType: EntryType,
    project?: string,
    module?: string,
  ): Promise<DocumentUploadResult> => {
    const form = new FormData();
    form.append("file",      file);
    form.append("entryType", entryType);
    if (project) form.append("project", project);
    if (module)  form.append("module",  module);

    // Don't set Content-Type — browser sets it with boundary automatically
    return request<DocumentUploadResult>("/api/capture/document", {
      method: "POST",
      body:   form,
      headers: {},   // override the default application/json header
    });
  },
};

// ── Search API ────────────────────────────────────────────────────────────────

export const searchApi = {
  semantic: (query: string, limit = 8, project?: string, module?: string) =>
    request<SearchResult[]>("/api/search/semantic", {
      method: "POST", body: json({ query, limit, project, module }),
    }),
};

// ── Admin API ─────────────────────────────────────────────────────────────────

export const adminApi = {
  reindex: () => request<{ queued: number }>("/api/admin/reindex", { method: "POST" }),
  metrics: () => request<unknown>("/api/admin/metrics"),
};
