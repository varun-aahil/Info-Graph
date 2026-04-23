import type { ChatMessage, ClusterInfo, Document, ScatterPoint } from './mock-data';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
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
    uploadedAt: new Date(doc.uploaded_at),
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
  const formData = new FormData();
  files.forEach((file) => {
    const optimistic: Document = {
      id: `local-${crypto.randomUUID()}`,
      name: file.name,
      size: file.size,
      status: 'uploading',
      progress: 5,
      uploadedAt: new Date(),
    };
    onProgress(optimistic);
    formData.append('files', file);
  });

  const payload = await request<{ documents: BackendDocument[] }>('/documents/upload', {
    method: 'POST',
    body: formData,
  });
  const documents = payload.documents.map(toDocument);
  documents.forEach(onProgress);
  return documents;
}

export async function importDocumentFromUrl(url: string): Promise<Document> {
  const doc = await request<BackendDocument>('/documents/import-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return toDocument(doc);
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

export async function sendChatMessage(
  message: string,
  selection: ChatSelection,
  history: ChatMessage[]
): Promise<ChatMessage> {
  const response = await request<ChatMessage>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      selection,
      history: history
        .filter((item) => item.id !== 'welcome')
        .map(({ role, content }) => ({ role, content })),
    }),
  });
  return { ...response, timestamp: new Date(response.timestamp) };
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
