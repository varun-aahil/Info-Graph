export interface Document {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'ready' | 'error';
  progress: number;
  uploadedAt: Date;
  errorMessage?: string;
}

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  clusterId: number;
  documentName: string;
}

export interface ClusterInfo {
  id: number;
  label: string;
  size: number;
  color: string;
  x: number;
  y: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
