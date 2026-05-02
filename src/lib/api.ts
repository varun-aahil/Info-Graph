import type { ChatMessage, ClusterInfo, Document, ScatterPoint } from './types';

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
export const APP_MODE = import.meta.env.VITE_APP_MODE ?? 'local'; // 'local' or 'web'
const TOKEN_STORAGE_KEY = 'infograph_access_token';

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  provider?: string;
}

export interface AuthResponseDto {
  access_token: string;
  token_type: 'bearer';
  user: AuthUserDto;
}

export interface ChatSelection {
  document_id?: string;
  cluster_id?: number;
}

export interface ChatSessionResponse {
  id: string;
  session_type: string;
  target_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageResponse {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface WorkspaceSettings {
  model_provider: 'cloud' | 'local';
  cloud_api_key: string;
  cloud_base_url: string;
  cloud_chat_model: string;
  cloud_embedding_model: string;
  local_base_url: string;
  clustering_method: 'kmeans' | 'dbscan' | 'hierarchical';
  min_cluster_size: number;
  cloud_api_key_configured: boolean;
  updated_at?: string;
}

interface BackendDocument {
  id: string;
  original_name: string;
  file_size: number;
  status: 'queued' | 'processing' | 'ready' | 'error';
  progress: number;
  error_message: string | null;
  uploaded_at: string;
}

interface BackendGraph {
  points: ScatterPoint[];
  clusters: Array<Omit<ClusterInfo, 'color'>>;
}

const clusterColors = [
  'hsl(250, 75%, 70%)',
  'hsl(200, 55%, 60%)',
  'hsl(170, 50%, 50%)',
  'hsl(35, 80%, 60%)',
  'hsl(330, 60%, 60%)',
];

async function parseApiError(response: Response) {
  try {
    const payload = await response.json();
    if (typeof payload.detail === 'string') return payload.detail;
    if (Array.isArray(payload.detail)) return payload.detail.map((item) => item.msg).join(', ');
    return JSON.stringify(payload);
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponseDto> {
  return request<AuthResponseDto>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyOtp(payload: {
  email: string;
  otp_code: string;
}): Promise<AuthResponseDto> {
  return request<AuthResponseDto>('/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resendOtp(payload: {
  email: string;
}): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/resend-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<AuthResponseDto> {
  return request<AuthResponseDto>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser(): Promise<AuthUserDto> {
  return request<AuthUserDto>('/users/me');
}

function toDocument(doc: BackendDocument): Document {
  return {
    id: doc.id,
    name: doc.original_name,
    size: doc.file_size,
    status: doc.status,
    progress: doc.progress,
    uploadedAt: new Date(
      doc.uploaded_at.includes('Z') || doc.uploaded_at.includes('+') 
        ? doc.uploaded_at 
        : `${doc.uploaded_at}Z`
    ),
    errorMessage: doc.error_message ?? undefined,
  };
}

export async function fetchDocuments(): Promise<Document[]> {
  const docs = await request<BackendDocument[]>('/documents');
  return docs.map(toDocument);
}

export async function uploadDocuments(
  files: File[],
  onProgress: (doc: Document) => void
): Promise<Document[]> {
  const uploadedDocs: Document[] = [];

  for (const file of files) {
    const optimistic: Document = {
      id: `local-${crypto.randomUUID()}`,
      name: file.name,
      size: file.size,
      status: 'processing',
      progress: 10,
      uploadedAt: new Date(),
    };
    onProgress(optimistic);

    const formData = new FormData();
    formData.append('files', file);

    try {
      const payload = await request<{ documents: BackendDocument[] }>('/documents/upload', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(300000),
      });
      const documents = payload.documents.map(toDocument);
      if (documents.length > 0) {
        onProgress(documents[0]);
        uploadedDocs.push(documents[0]);
      }
    } catch (e) {
      onProgress({
        ...optimistic,
        status: 'error',
        errorMessage: e instanceof Error ? e.message : 'Upload failed',
      });
    }
  }

  return uploadedDocs;
}

export async function importDocumentFromUrl(url: string): Promise<Document> {
  const doc = await request<BackendDocument>('/documents/import-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return toDocument(doc);
}

export async function deleteDocument(id: string): Promise<void> {
  await request<void>(`/documents/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchGraphData(): Promise<{ points: ScatterPoint[]; clusters: ClusterInfo[] }> {
  const graph = await request<BackendGraph>('/graph');
  return {
    points: graph.points,
    clusters: graph.clusters.map((cluster, index) => ({
      ...cluster,
      color: cluster.id < 0 ? 'hsl(0, 70%, 60%)' : clusterColors[index % clusterColors.length],
    })),
  };
}

export async function fetchChatSessions(): Promise<ChatSessionResponse[]> {
  return request<ChatSessionResponse[]>('/chat/sessions');
}

export async function fetchChatMessages(sessionId: string): Promise<ChatMessageResponse[]> {
  return request<ChatMessageResponse[]>(`/chat/sessions/${sessionId}/messages`);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await request<void>(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function sendChatMessage(
  message: string,
  selection: ChatSelection,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  sessionId?: string,
  onSessionId?: (id: string) => void
): Promise<ChatMessage> {
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      selection,
      history: history
        .filter((item) => item.id !== 'welcome')
        .map(({ role, content }) => ({ role, content })),
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  // Process a single SSE "data: ..." line. NEVER throws — all content
  // (including errors) is appended to fullContent so it renders in the
  // chat bubble instead of leaving it blank.
  const processLine = (line: string) => {
    if (!line.startsWith('data: ')) return;

    const payload = line.slice(6); // strip "data: "

    try {
      const data = JSON.parse(payload);

      // Error messages from the backend — render them as visible content
      if (data.error) {
        fullContent += data.error;
        onChunk(fullContent);
        return;
      }

      // Normal content chunks
      if (data.content) {
        fullContent += data.content;
        onChunk(fullContent);
      }

      if (data.session_id && onSessionId) {
        onSessionId(data.session_id);
      }

      // data.sources — silently consumed, no action needed
    } catch {
      // JSON parse failed — treat the raw payload as plain text so
      // the user always sees *something* instead of a blank bubble
      fullContent += payload;
      onChunk(fullContent);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      processLine(part.trim());
    }
  }

  // Flush any remaining data in the buffer after stream ends
  if (buffer.trim()) {
    processLine(buffer.trim());
  }

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: fullContent,
    timestamp: new Date(),
  };
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  return request<WorkspaceSettings>('/settings');
}

export async function updateWorkspaceSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
  return request<WorkspaceSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
