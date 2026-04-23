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
import UploadPanel from '@/components/UploadPanel';
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
} from '@/lib/mock-data';
import { toast } from '@/hooks/use-toast';

type SidebarView = 'collapsed' | 'files' | 'settings';
type MainView = 'dashboard' | 'settings';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' as const },
  { icon: FileText, label: 'Files', id: 'files' as const },
  { icon: Settings, label: 'Settings', id: 'settings' as const },
];

const defaultSettings: WorkspaceSettings = {
  model_provider: 'cloud',
  cloud_api_key: '',
  cloud_base_url: 'https://api.openai.com/v1',
  cloud_chat_model: 'gpt-4.1-mini',
  cloud_embedding_model: 'text-embedding-3-small',
  local_base_url: 'http://localhost:11434',
  clustering_method: 'kmeans',
  min_cluster_size: 5,
  cloud_api_key_configured: false,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!user) navigate('/', { replace: true });
  }, [user, navigate]);

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
  const [sidebarView, setSidebarView] = useState<SidebarView>('collapsed');
  const [mainView, setMainView] = useState<MainView>('dashboard');
  const [chatOpen, setChatOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(defaultSettings);

  const hasSelection = selectedClusterId !== null || selectedPoint !== null;

  const clusterContext =
    selectedPoint
      ? selectedPoint.documentName
      : selectedClusterId !== null
        ? selectedClusterId === -1
          ? 'Anomaly'
          : clusters.find((c) => c.id === selectedClusterId)?.label ?? null
        : null;

  const chatSelection =
    selectedPoint
      ? { document_id: selectedPoint.id }
      : selectedClusterId !== null
        ? { cluster_id: selectedClusterId }
        : null;

  const refreshWorkspace = useCallback(async () => {
    const [loadedDocuments, graph, settings] = await Promise.all([
      fetchDocuments(),
      fetchGraphData(),
      getWorkspaceSettings(),
    ]);
    setDocuments(loadedDocuments);
    setScatterData(graph.points);
    setClusters(graph.clusters);
    setWorkspaceSettings(settings);
  }, []);

  useEffect(() => {
    refreshWorkspace().catch((error) => {
      toast({
        title: 'Backend load failed',
        description: error instanceof Error ? error.message : 'Could not load workspace data.',
        variant: 'destructive',
      });
    });
    const intervalId = window.setInterval(() => {
      refreshWorkspace().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [refreshWorkspace]);

  const handleImportUrl = async () => {
    const url = urlInput.trim();
    if (!url || isImportingUrl) return;

    setIsImportingUrl(true);
    try {
      const document = await importDocumentFromUrl(url);
      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setUrlInput('');
      toast({ title: 'Import started', description: `${document.name} is being processed.` });
      await refreshWorkspace();
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
      await refreshWorkspace();
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
  };

  const handleNavClick = (id: string) => {
    if (id === 'dashboard') {
      setMainView('dashboard');
      setSidebarView('collapsed');
    } else if (id === 'files') {
      setMainView('dashboard');
      setSidebarView(sidebarView === 'files' ? 'collapsed' : 'files');
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
        className={`shrink-0 border-r border-border bg-card transition-all duration-200 overflow-hidden ${
          sidebarView === 'files' ? 'w-64' : 'w-0'
        }`}
      >
        <div className="flex h-14 w-64 items-center justify-between border-b border-border px-4">
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
        <div className="w-64 p-3">
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="upload" className="flex-1 gap-1.5 text-xs">
                <Upload className="h-3.5 w-3.5" />
                Upload PDF
              </TabsTrigger>
              <TabsTrigger value="url" className="flex-1 gap-1.5 text-xs">
                <LinkIcon className="h-3.5 w-3.5" />
                External URL
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              <UploadPanel
                documents={documents}
                onDocumentsChange={setDocuments}
                onUploadComplete={refreshWorkspace}
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
                  <div className="flex-1 min-h-0">
                    <ScatterPlot
                      key={chatOpen ? 'chat-open' : 'chat-closed'}
                      data={scatterData}
                      clusters={clusters}
                      selectedClusterId={selectedClusterId}
                      onPointClick={setSelectedPoint}
                      onClusterSelect={setSelectedClusterId}
                    />
                  </div>
                </div>
              </main>

              {/* Chat panel */}
              <aside
                className={`shrink-0 border-l border-border bg-card transition-all duration-300 ease-in-out overflow-hidden ${
                  chatOpen ? 'w-80' : 'w-0'
                }`}
              >
                <div className="flex h-full w-80 flex-col">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-foreground">Cluster Analysis</h3>
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
                    />
                  </div>
                </div>
              </aside>
            </>
          ) : (
            /* Settings View */
            <main className="flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-2xl">
                <h2 className="text-xl font-semibold text-foreground">Settings</h2>
                <p className="mb-8 text-sm text-muted-foreground">
                  Configure your InfoGraph workspace
                </p>

                <div className="space-y-6">
                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-1 text-sm font-semibold text-foreground">Profile</h3>
                    <p className="mb-4 text-xs text-muted-foreground">Your account information</p>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">Name</label>
                        <Input value={user?.name ?? ''} readOnly className="h-9 text-sm bg-muted/50" />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">Email</label>
                        <Input value={user?.email ?? ''} readOnly className="h-9 text-sm bg-muted/50" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-1 text-sm font-semibold text-foreground">Model Configuration</h3>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Choose how to connect your embedding model
                    </p>
                    <div className="space-y-5">
                      <div>
                        <label className="mb-2.5 block text-xs font-medium text-foreground">
                          Model Provider
                        </label>
                        <RadioGroup
                          value={workspaceSettings.model_provider}
                          onValueChange={(v) =>
                            setWorkspaceSettings((current) => ({
                              ...current,
                              model_provider: v as 'cloud' | 'local',
                            }))
                          }
                          className="grid grid-cols-2 gap-3"
                        >
                          <Label
                            htmlFor="provider-cloud"
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                              workspaceSettings.model_provider === 'cloud'
                                ? 'border-primary bg-accent'
                                : 'border-border hover:border-muted-foreground/30'
                            }`}
                          >
                            <RadioGroupItem value="cloud" id="provider-cloud" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium">Cloud API</span>
                              </div>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">OpenAI / Gemini</p>
                            </div>
                          </Label>
                          <Label
                            htmlFor="provider-local"
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                              workspaceSettings.model_provider === 'local'
                                ? 'border-primary bg-accent'
                                : 'border-border hover:border-muted-foreground/30'
                            }`}
                          >
                            <RadioGroupItem value="local" id="provider-local" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-medium">Local LLM</span>
                              </div>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">Ollama / LocalAI</p>
                            </div>
                          </Label>
                        </RadioGroup>
                      </div>

                      {workspaceSettings.model_provider === 'cloud' ? (
                        <>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-foreground">
                              API Key
                            </label>
                            <Input
                              type="password"
                              placeholder={
                                workspaceSettings.cloud_api_key_configured
                                  ? 'Stored in database'
                                  : 'Paste API key'
                              }
                              value={workspaceSettings.cloud_api_key}
                              onChange={(e) =>
                                setWorkspaceSettings((current) => ({
                                  ...current,
                                  cloud_api_key: e.target.value,
                                }))
                              }
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-foreground">
                              Cloud Base URL
                            </label>
                            <Input
                              value={workspaceSettings.cloud_base_url}
                              onChange={(e) =>
                                setWorkspaceSettings((current) => ({
                                  ...current,
                                  cloud_base_url: e.target.value,
                                }))
                              }
                              placeholder="https://api.openai.com/v1"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-foreground">
                              Chat Model
                            </label>
                            <Input
                              value={workspaceSettings.cloud_chat_model}
                              onChange={(e) =>
                                setWorkspaceSettings((current) => ({
                                  ...current,
                                  cloud_chat_model: e.target.value,
                                }))
                              }
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-foreground">
                              Embedding Model
                            </label>
                            <Input
                              value={workspaceSettings.cloud_embedding_model}
                              onChange={(e) =>
                                setWorkspaceSettings((current) => ({
                                  ...current,
                                  cloud_embedding_model: e.target.value,
                                }))
                              }
                              className="h-9 text-sm"
                            />
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-foreground">
                            Base URL
                          </label>
                          <Input
                            value={workspaceSettings.local_base_url}
                            onChange={(e) =>
                              setWorkspaceSettings((current) => ({
                                ...current,
                                local_base_url: e.target.value,
                              }))
                            }
                            className="h-9 text-sm"
                          />
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            Default Ollama endpoint. Change if using a custom LocalAI setup.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-6">
                    <h3 className="mb-1 text-sm font-semibold text-foreground">Preferences</h3>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Fine-tune how documents are grouped
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">
                          Clustering Method
                        </label>
                        <Select
                          value={workspaceSettings.clustering_method}
                          onValueChange={(value) =>
                            setWorkspaceSettings((current) => ({
                              ...current,
                              clustering_method: value as WorkspaceSettings['clustering_method'],
                            }))
                          }
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kmeans">K-Means</SelectItem>
                            <SelectItem value="dbscan">DBSCAN</SelectItem>
                            <SelectItem value="hierarchical">Hierarchical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-foreground">
                          Min Cluster Size
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={workspaceSettings.min_cluster_size}
                          onChange={(e) =>
                            setWorkspaceSettings((current) => ({
                              ...current,
                              min_cluster_size: Number(e.target.value) || 1,
                            }))
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveSettings} disabled={isSavingSettings}>
                      {isSavingSettings ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </div>
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
