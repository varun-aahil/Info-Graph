import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AvatarImage } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  FileText,
  Settings,
  Search,
  X,
  LogOut,
  Upload,
  Link as LinkIcon,
  Cloud,
  HardDrive,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ScatterPlot from '@/components/ScatterPlot';
import ChatPanel from '@/components/ChatPanel';
import ClusterInfoPanel from '@/components/ClusterInfoPanel';
import UploadPanel from '@/components/UploadPanel';
import SettingsPanel from '@/components/SettingsPanel';
import ChatHistoryPanel from '@/components/ChatHistoryPanel';
import {
  fetchDocuments,
  fetchGraphData,
  getWorkspaceSettings,
  importDocumentFromUrl,
  updateWorkspaceSettings,
  type WorkspaceSettings,
} from '@/lib/api';
import {
  type Document,
  type ScatterPoint,
  type ClusterInfo,
} from '@/lib/types';
import { toast } from '@/hooks/use-toast';

type SidebarView = 'collapsed' | 'files' | 'chats' | 'settings';
type MainView = 'dashboard' | 'settings';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' as const },
  { icon: FileText, label: 'Files', id: 'files' as const },
  { icon: MessageSquare, label: 'Chats', id: 'chats' as const },
  { icon: Settings, label: 'Settings', id: 'settings' as const },
];

const defaultSettings: WorkspaceSettings = {
  model_provider: 'cloud',
  cloud_api_key: '',
  cloud_base_url: 'https://api.openai.com/v1',
  cloud_chat_model: 'gpt-4.1-mini',
  cloud_embedding_model: 'nomic-embed-text',
  local_base_url: 'http://localhost:11434',
  clustering_method: 'kmeans',
  min_cluster_size: 5,
  cloud_api_key_configured: false,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, isInitialized, signOut } = useAuth();

  useEffect(() => {
    if (isInitialized && !user) navigate('/', { replace: true });
  }, [user, isInitialized, navigate]);

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const initials = useMemo(() => {
    if (!user) return '';
    return (
      user.name
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || user.email[0].toUpperCase()
    );
  }, [user]);

  const handleSignOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  const [documents, setDocuments] = useState<Document[]>([]);
  const [scatterData, setScatterData] = useState<ScatterPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<ScatterPoint | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  // Fix #4: Explicit chat mode — 'document' scopes RAG to one doc, 'cluster' to all
  const [chatMode, setChatMode] = useState<'document' | 'cluster'>('document');
  const [sidebarView, setSidebarView] = useState<SidebarView>('collapsed');
  const [mainView, setMainView] = useState<MainView>('dashboard');
  const [chatOpen, setChatOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(defaultSettings);
  
  const [chatSessions, setChatSessions] = useState<import('@/lib/api').ChatSessionResponse[]>([]);
  const [isChatSessionsLoading, setIsChatSessionsLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<import('@/lib/api').ChatSessionResponse | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const hasSelection = selectedClusterId !== null || selectedPoint !== null;

  // Fix #4: Context label reflects document vs cluster chat mode
  const clusterContext =
    chatMode === 'document' && selectedPoint
      ? `📄 ${selectedPoint.documentName}`
      : selectedClusterId !== null
        ? selectedClusterId === -1
          ? '🔍 Outlier'
          : `📁 ${clusters.find((c) => c.id === selectedClusterId)?.label ?? 'Cluster'}`
        : null;

  // Fix #4: Selection payload controls backend RAG scoping
  const chatSelection =
    chatMode === 'document' && selectedPoint
      ? { document_id: selectedPoint.id }
      : selectedClusterId !== null
        ? { cluster_id: selectedClusterId }
        : null;

  // Fix #4: Explicit handlers for document vs cluster chat
  const handleChatWithDocument = (point: ScatterPoint) => {
    setSelectedPoint(point);
    setChatMode('document');
    
    const existing = chatSessions.find(s => s.target_id === point.id && s.session_type === 'document');
    setCurrentSessionId(existing ? existing.id : null);
    
    setChatOpen(true);
  };

  const handleChatWithCluster = (clusterId: number) => {
    setChatMode('cluster');
    setSelectedClusterId(clusterId);
    
    const existing = chatSessions.find(s => s.target_id === String(clusterId) && s.session_type === 'cluster');
    setCurrentSessionId(existing ? existing.id : null);
    
    setChatOpen(true);
  };
  
  const loadSessions = useCallback(async () => {
    try {
      const { fetchChatSessions } = await import('@/lib/api');
      const sessions = await fetchChatSessions();
      setChatSessions(sessions);
    } catch (e) {
      // ignore
    } finally {
      setIsChatSessionsLoading(false);
    }
  }, []);

  const handleDeleteSession = async (session: import('@/lib/api').ChatSessionResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessionToDelete(session);
  };

  const confirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    setIsDeletingSession(true);
    try {
      const { deleteChatSession } = await import('@/lib/api');
      await deleteChatSession(sessionToDelete.id);
      
      if (currentSessionId === sessionToDelete.id) {
        setCurrentSessionId(null);
        setSelectedPoint(null);
        setSelectedClusterId(null);
      }
      
      loadSessions();
    } catch (error) {
      console.error('Failed to delete session', error);
    } finally {
      setIsDeletingSession(false);
      setSessionToDelete(null);
    }
  };

  const loadData = useCallback(async () => {
    const [loadedDocuments, graph] = await Promise.all([
      fetchDocuments(),
      fetchGraphData(),
    ]);
    setDocuments(loadedDocuments);
    
    setScatterData((prev) => {
      const isSame = prev.length === graph.points.length && JSON.stringify(prev) === JSON.stringify(graph.points);
      return isSame ? prev : graph.points;
    });
    
    setClusters((prev) => {
      const isSame = prev.length === graph.clusters.length && JSON.stringify(prev) === JSON.stringify(graph.clusters);
      return isSame ? prev : graph.clusters;
    });
  }, []);

  const loadSettings = useCallback(async () => {
    const settings = await getWorkspaceSettings();
    setWorkspaceSettings(settings);
  }, []);

  useEffect(() => {
    loadSettings().catch(() => undefined);
    loadSessions();
    loadData().catch((error) => {
      toast({
        title: 'Backend load failed',
        description: error instanceof Error ? error.message : 'Could not load workspace data.',
        variant: 'destructive',
      });
    });
  }, [loadData, loadSettings, loadSessions]);

  useEffect(() => {
    const readyDocsCount = documents.filter(d => d.status === 'ready').length;
    const hasProcessing = documents.some(d => d.status === 'queued' || d.status === 'processing');
    const isGraphOutOfSync = readyDocsCount !== scatterData.length;
    
    if (!hasProcessing && !isGraphOutOfSync) return;

    const intervalId = window.setInterval(() => {
      loadData().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [documents, loadData]);

  const handleImportUrl = async () => {
    const url = urlInput.trim();
    if (!url || isImportingUrl) return;

    setIsImportingUrl(true);
    try {
      const document = await importDocumentFromUrl(url);
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setUrlInput('');
      toast({ title: 'Import started', description: `${document.name} is being processed.` });
      await loadData();
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Could not import that PDF URL.',
        variant: 'destructive',
      });
    } finally {
      setIsImportingUrl(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const saved = await updateWorkspaceSettings(workspaceSettings);
      setWorkspaceSettings(saved);
      toast({ title: 'Settings saved', description: 'Backend settings were updated.' });
      await loadData();
    } catch (error) {
      toast({
        title: 'Settings save failed',
        description: error instanceof Error ? error.message : 'Could not save settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  useEffect(() => {
    if (hasSelection) setChatOpen(true);
  }, [hasSelection]);

  const handleCloseChat = () => {
    setChatOpen(false);
    setSelectedPoint(null);
    setSelectedClusterId(null);
    setCurrentSessionId(null);
  };

  const handleNavClick = (id: string) => {
    if (id === 'dashboard') {
      setMainView('dashboard');
      setSidebarView('collapsed');
    } else if (id === 'files') {
      setMainView('dashboard');
      setSidebarView(sidebarView === 'files' ? 'collapsed' : 'files');
    } else if (id === 'chats') {
      setMainView('dashboard');
      setSidebarView(sidebarView === 'chats' ? 'collapsed' : 'chats');
    } else if (id === 'settings') {
      setMainView('settings');
      setSidebarView('collapsed');
    }
  };

  const handleGraphUpload = () => {
    setSidebarView('files');
  };

  const handleGraphUrl = () => {
    setSidebarView('files');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Icon Rail */}
      <aside className="flex w-14 flex-col border-r border-border bg-card">
        <div className="flex h-14 items-center justify-center border-b border-border">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-foreground">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="19" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="5" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="19" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
            <line x1="7" y1="6" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="17" y1="6" x2="14" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="7" y1="18" x2="10" y2="14" stroke="currentColor" strokeWidth="1" />
            <line x1="17" y1="18" x2="14" y2="14" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1 py-3">
          {navItems.map((item) => {
            const isActive =
              (item.id === 'dashboard' && mainView === 'dashboard' && sidebarView === 'collapsed') ||
              (item.id === 'files' && sidebarView === 'files') ||
              (item.id === 'chats' && sidebarView === 'chats') ||
              (item.id === 'settings' && mainView === 'settings');
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={item.label}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4" />
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Expandable Files Panel */}
      <aside
        className={`shrink-0 flex flex-col h-screen border-r border-border bg-card transition-all duration-200 overflow-hidden ${
          sidebarView === 'files' ? 'w-80' : 'w-0'
        }`}
      >
        <div className="flex shrink-0 h-14 w-80 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground">Files</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarView('collapsed')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-80 p-3 flex flex-col flex-1 min-h-0">
          <Tabs defaultValue="upload" className="flex flex-col flex-1 min-h-0 w-full">
            <TabsList className="w-full shrink-0">
              <TabsTrigger value="upload" className="flex-1 gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" />
                Upload PDF
              </TabsTrigger>
              <TabsTrigger value="url" className="flex-1 gap-1.5 text-xs">
                <LinkIcon className="h-3.5 w-3.5" />
                External URL
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="flex-1 min-h-0 mt-3">
                <UploadPanel
                  documents={documents}
                  onDocumentsChange={setDocuments}
                  onUploadComplete={() => { loadData(); loadSessions(); }}
                />
            </TabsContent>
            <TabsContent value="url">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="https://example.com/paper.pdf"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    disabled={!urlInput.trim() || isImportingUrl}
                    onClick={handleImportUrl}
                  >
                    <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                    {isImportingUrl ? 'Importing...' : 'Import'}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Paste a direct link to a PDF document to import it for analysis.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </aside>

      {/* Expandable Chats Panel */}
      <aside
        className={`shrink-0 flex flex-col h-screen border-r border-border bg-card transition-all duration-200 overflow-hidden ${
          sidebarView === 'chats' ? 'w-80' : 'w-0'
        }`}
      >
        <div className="flex shrink-0 h-14 w-80 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground">Chat History</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarView('collapsed')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-80 p-3 flex flex-col flex-1 min-h-0">
          <ChatHistoryPanel 
            sessions={chatSessions}
            isLoading={isChatSessionsLoading}
            currentSessionId={currentSessionId}
            onDelete={handleDeleteSession}
            onSessionSelect={(session) => {
              setCurrentSessionId(session.id);
              if (session.session_type === 'document') {
                const pt = scatterData.find(p => p.id === session.target_id);
                if (pt) {
                  setSelectedPoint(pt);
                  setChatMode('document');
                  setChatOpen(true);
                  setSelectedClusterId(null);
                }
              } else if (session.session_type === 'cluster') {
                setSelectedClusterId(Number(session.target_id));
                setChatMode('cluster');
                setChatOpen(true);
                setSelectedPoint(null);
              }
            }}
          />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search documents..."
                className="h-9 w-64 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <Avatar className="h-8 w-8">
                    {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                    <AvatarFallback className="text-xs font-medium">{initials || '?'}</AvatarFallback>
                  </Avatar>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="border-b border-border px-3 py-2 mb-1">
                  <p className="truncate text-sm font-semibold text-foreground">{user?.name ?? 'Guest'}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</p>
                </div>
                <button
                  onClick={() => { setMainView('settings'); setSidebarView('collapsed'); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <Settings className="h-4 w-4" /> Settings
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Log Out
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {mainView === 'dashboard' ? (
            <>
              {/* Scatter Plot area */}
              <main className="flex flex-1 flex-col overflow-hidden p-6 animate-fade-in">
                <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
                  {/* Header row above graph */}
                  <div className="flex items-center justify-between border-b border-border px-5 py-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Document Clusters</h2>
                      <p className="text-xs text-muted-foreground">
                        Click on any data point to start a contextual chat session
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs hover-scale"
                        onClick={handleGraphUrl}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Import via URL
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs hover-scale"
                        onClick={handleGraphUpload}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload PDF
                      </Button>
                    </div>
                  </div>
              {/* Graph area */}
                  <div className="relative flex-1 min-h-0">
                    <ScatterPlot
                      key={chatOpen ? 'chat-open' : 'chat-closed'}
                      data={scatterData}
                      clusters={clusters}
                      selectedClusterId={selectedClusterId}
                      selectedPointId={selectedPoint?.id ?? null}
                      onPointClick={setSelectedPoint}
                      onClusterSelect={setSelectedClusterId}
                    />
                    {/* Fix #4: Info panel with document/cluster chat buttons */}
                    <ClusterInfoPanel
                      selectedPoint={selectedPoint}
                      clusters={clusters}
                      selectedClusterId={selectedClusterId}
                      onClear={() => {
                        setSelectedPoint(null);
                        setSelectedClusterId(null);
                      }}
                      onChatWithDocument={handleChatWithDocument}
                      onChatWithCluster={handleChatWithCluster}
                    />
                  </div>
                </div>
              </main>

              {/* Chat panel */}
              <aside
                className={`shrink-0 border-l border-border bg-card transition-all duration-300 ease-in-out overflow-hidden ${
                  chatOpen ? 'w-[400px]' : 'w-0'
                }`}
              >
                <div className="flex h-full w-[400px] flex-col">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {chatMode === 'document' && selectedPoint ? 'Document Chat' : 'Cluster Analysis'}
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleCloseChat}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <ChatPanel
                      clusterContext={clusterContext}
                      hasSelection={hasSelection}
                      selection={chatSelection}
                      sessionId={currentSessionId}
                      onSessionIdChange={(id) => {
                        setCurrentSessionId(id);
                        loadSessions(); // refresh history panel
                      }}
                    />
                  </div>
                </div>
              </aside>
            </>
          ) : (
            <SettingsPanel
              user={user}
              workspaceSettings={workspaceSettings}
              setWorkspaceSettings={setWorkspaceSettings}
              onSave={handleSaveSettings}
              isSaving={isSavingSettings}
            />
          )}
        </div>
      </div>
      {/* Chat Delete Confirmation Modal */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg border border-border">
            <h3 className="text-lg font-semibold text-foreground">Delete Chat</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this chat? This action cannot be undone.
            </p>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {sessionToDelete.title || 'Untitled Chat'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setSessionToDelete(null)}
                disabled={isDeletingSession}
                className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSession}
                disabled={isDeletingSession}
                className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {isDeletingSession && <Loader2 className="h-4 w-4 animate-spin" />}
                {isDeletingSession ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
