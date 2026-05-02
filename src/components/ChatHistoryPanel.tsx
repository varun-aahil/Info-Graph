import { MessageSquare, Clock, FileText, FolderClosed, Loader2, Trash2 } from 'lucide-react';
import type { ChatSessionResponse } from '@/lib/api';

interface ChatHistoryPanelProps {
  sessions: ChatSessionResponse[];
  isLoading: boolean;
  onSessionSelect: (session: ChatSessionResponse) => void;
  onDelete: (session: ChatSessionResponse, e: React.MouseEvent) => void;
  currentSessionId: string | null;
}

export default function ChatHistoryPanel({ sessions, isLoading, onSessionSelect, onDelete, currentSessionId }: ChatHistoryPanelProps) {

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No Chat History</p>
        <p className="text-xs text-muted-foreground">
          Start a conversation by clicking on a document or cluster in the dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Recent Chats</h3>
        <span className="text-[10px] text-muted-foreground">{sessions.length}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSessionSelect(session)}
            className={`group relative flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
              currentSessionId === session.id
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:border-muted-foreground hover:bg-accent'
            }`}
          >
            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground min-w-0">
                {session.session_type === 'document' ? (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <FolderClosed className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span className="truncate">{session.title || 'New Chat'}</span>
              </div>
            </div>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{new Date(session.updated_at).toLocaleDateString()}</span>
              </div>
              <button
                onClick={(e) => onDelete(session, e)}
                className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                title="Delete Chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
