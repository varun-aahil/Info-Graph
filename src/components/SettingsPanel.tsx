import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  API_BASE,
  fetchLocalModels,
  pullLocalModel,
  type LocalModelInfo,
  type LocalModelRecommendation,
  type WorkspaceSettings,
} from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface SettingsPanelProps {
  user: any;
  workspaceSettings: WorkspaceSettings;
  setWorkspaceSettings: React.Dispatch<React.SetStateAction<WorkspaceSettings>>;
  onSave: () => void;
  isSaving: boolean;
}

type ProviderConfig = {
  label: string;
  chatModels: string[];
  defaultChatModel: string;
  needsKey: boolean;
};

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  gemini: {
    label: 'Google Gemini',
    chatModels: [
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
    defaultChatModel: 'gemini-2.5-flash',
    needsKey: true,
  },
  openai: {
    label: 'OpenAI',
    chatModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3-mini'],
    defaultChatModel: 'gpt-4.1-mini',
    needsKey: true,
  },
  anthropic: {
    label: 'Anthropic',
    chatModels: [
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20251101',
      'claude-opus-4-1-20250805',
      'claude-haiku-4-5-20251001',
    ],
    defaultChatModel: 'claude-sonnet-4-6',
    needsKey: true,
  },
  xai: {
    label: 'xAI (Grok)',
    chatModels: [
      'grok-4.3',
      'grok-4.20-reasoning',
      'grok-4.20-non-reasoning',
      'grok-4-1-fast-reasoning',
      'grok-4-1-fast-non-reasoning',
      'grok-4',
      'grok-3',
      'grok-3-mini',
    ],
    defaultChatModel: 'grok-4.3',
    needsKey: true,
  },
  cloud: {
    label: 'Cloud (Legacy)',
    chatModels: ['gpt-4.1-mini', 'gpt-4o-mini'],
    defaultChatModel: 'gpt-4.1-mini',
    needsKey: true,
  },
  local: {
    label: 'Custom / Local',
    chatModels: [],
    defaultChatModel: 'llama3.1:8b',
    needsKey: false,
  },
};

type ProviderKey = keyof typeof PROVIDER_CONFIGS;

export default function SettingsPanel({
  user,
  workspaceSettings,
  setWorkspaceSettings,
  onSave,
  isSaving,
}: SettingsPanelProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    gemini: '',
    openai: '',
    anthropic: '',
    xai: '',
    cloud: '',
    local: '',
  });
  const [verifiedProviders, setVerifiedProviders] = useState<Record<string, boolean>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [recommendedEmbeddingModels, setRecommendedEmbeddingModels] = useState<LocalModelRecommendation[]>([]);
  const [ollamaLibraryUrl, setOllamaLibraryUrl] = useState('https://ollama.com/library');
  const [ollamaDownloadUrl, setOllamaDownloadUrl] = useState('https://ollama.com/download');
  const [isLoadingLocalModels, setIsLoadingLocalModels] = useState(false);
  const [pullingModelName, setPullingModelName] = useState<string | null>(null);

  const provider = (workspaceSettings.model_provider || 'gemini') as ProviderKey;
  const config = PROVIDER_CONFIGS[provider] ?? PROVIDER_CONFIGS.gemini;
  const currentKey = apiKeys[provider] || '';
  const isKeySaved = verifiedProviders[provider] ?? false;

  const localChatModels = useMemo(
    () => localModels.filter((model) => model.is_chat).map((model) => model.name),
    [localModels]
  );
  const localEmbeddingModels = useMemo(
    () => localModels.filter((model) => model.is_embedding).map((model) => model.name),
    [localModels]
  );

  useEffect(() => {
    if (workspaceSettings.cloud_api_key_configured) {
      setVerifiedProviders((prev) => ({ ...prev, [provider]: true }));
    }
    if (workspaceSettings.cloud_api_key) {
      setApiKeys((prev) => ({ ...prev, [provider]: workspaceSettings.cloud_api_key }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocalModels = async (baseUrl: string) => {
    setIsLoadingLocalModels(true);
    try {
      const response = await fetchLocalModels(baseUrl);
      setLocalModels(response.installed_models);
      setRecommendedEmbeddingModels(response.recommended_embedding_models);
      setOllamaLibraryUrl(response.ollama_library_url);
      setOllamaDownloadUrl(response.ollama_download_url);
    } catch (error) {
      setLocalModels([]);
      toast({
        title: 'Could not load local models',
        description: error instanceof Error ? error.message : 'Make sure Ollama is running.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingLocalModels(false);
    }
  };

  useEffect(() => {
    loadLocalModels(workspaceSettings.local_base_url).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSettings.local_base_url]);

  useEffect(() => {
    const nextChatModel =
      provider === 'local'
        ? localChatModels.find((model) => model === workspaceSettings.cloud_chat_model) ||
          localChatModels.find((model) => model.startsWith('llama3')) ||
          localChatModels[0] ||
          config.defaultChatModel
        : workspaceSettings.cloud_chat_model;

    const nextEmbeddingModel =
      localEmbeddingModels.find((model) => model === workspaceSettings.cloud_embedding_model) ||
      localEmbeddingModels.find((model) => model.startsWith('nomic-embed-text')) ||
      localEmbeddingModels[0] ||
      'nomic-embed-text';

    if (
      (provider === 'local' && workspaceSettings.cloud_chat_model !== nextChatModel) ||
      workspaceSettings.cloud_embedding_model !== nextEmbeddingModel
    ) {
      setWorkspaceSettings((current) => ({
        ...current,
        cloud_chat_model: nextChatModel,
        cloud_embedding_model: nextEmbeddingModel,
      }));
    }
  }, [
    config.defaultChatModel,
    localChatModels,
    localEmbeddingModels,
    provider,
    setWorkspaceSettings,
    workspaceSettings.cloud_chat_model,
    workspaceSettings.cloud_embedding_model,
  ]);

  const handleApiKeyChange = (value: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
    setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));

    let detectedProvider: string | null = null;
    if (value.startsWith('sk-ant-')) {
      detectedProvider = 'anthropic';
    } else if (value.startsWith('sk-proj-') || (value.startsWith('sk-') && !value.startsWith('sk-ant-'))) {
      detectedProvider = 'openai';
    } else if (value.startsWith('xai-')) {
      detectedProvider = 'xai';
    }

    if (detectedProvider && detectedProvider !== provider) {
      const next = PROVIDER_CONFIGS[detectedProvider as ProviderKey];
      setApiKeys((prev) => ({
        ...prev,
        [provider]: '',
        [detectedProvider!]: value,
      }));
      setVerifiedProviders((prev) => ({ ...prev, [detectedProvider!]: false }));
      setWorkspaceSettings((current) => ({
        ...current,
        model_provider: detectedProvider!,
        cloud_api_key: value,
        cloud_base_url: '',
        cloud_chat_model: next.defaultChatModel,
      }));
      return;
    }

    setWorkspaceSettings((current) => ({ ...current, cloud_api_key: value }));
  };

  const handleProviderChange = (nextProvider: string) => {
    const next = PROVIDER_CONFIGS[nextProvider as ProviderKey] ?? PROVIDER_CONFIGS.gemini;
    setIsVerifying(false);

    setWorkspaceSettings((current) => ({
      ...current,
      model_provider: nextProvider,
      cloud_api_key: apiKeys[nextProvider] || '',
      cloud_base_url: '',
      local_base_url: nextProvider === 'local' ? 'http://localhost:11434' : current.local_base_url,
      cloud_chat_model: next.defaultChatModel,
    }));
  };

  const handleVerifyAndSave = async () => {
    setIsVerifying(true);
    setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));

    const strictPayload: WorkspaceSettings = {
      ...workspaceSettings,
      model_provider: provider,
      cloud_api_key: currentKey,
      cloud_base_url: '',
    };

    try {
      const token = localStorage.getItem('infograph_access_token');
      const response = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(strictPayload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Verification failed' }));
        const detail = typeof err.detail === 'string' ? err.detail : 'Verification failed.';
        throw new Error(detail);
      }

      const saved = await response.json();
      setWorkspaceSettings(saved);
      setVerifiedProviders((prev) => ({ ...prev, [provider]: true }));
      toast({
        title: 'API Key Verified',
        description: 'Your key has been verified and stored securely.',
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      if (/402|lacks credits|add credits|payment required/i.test(raw)) {
        setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));
        toast({
          title: 'Account Issue',
          description: raw || 'Your API key is valid, but your account needs credits.',
        });
      } else {
        setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));
        toast({
          title: 'Verification Failed',
          description: raw || 'Verification failed. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePullEmbeddingModel = async (modelName: string) => {
    setPullingModelName(modelName);
    try {
      await pullLocalModel(modelName, workspaceSettings.local_base_url);
      toast({
        title: 'Model downloaded',
        description: `${modelName} is now available locally.`,
      });
      await loadLocalModels(workspaceSettings.local_base_url);
      setWorkspaceSettings((current) => ({
        ...current,
        cloud_embedding_model: modelName,
      }));
    } catch (error) {
      toast({
        title: 'Model download failed',
        description: error instanceof Error ? error.message : `Could not download ${modelName}.`,
        variant: 'destructive',
      });
    } finally {
      setPullingModelName(null);
    }
  };

  const chatModelOptions = provider === 'local' ? localChatModels : config.chatModels;
  const embeddingModelOptions = localEmbeddingModels;

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        <p className="mb-8 text-sm text-muted-foreground">Configure your InfoGraph workspace</p>

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
            <p className="mb-4 text-xs text-muted-foreground">Cloud providers are used only for chat. Embeddings are always generated locally with Ollama.</p>

            <div className="space-y-5">
              <div>
                <label className="mb-2.5 block text-xs font-medium text-foreground">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                  Model Provider
                </label>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_CONFIGS).map(([key, providerConfig]) => (
                      <SelectItem key={key} value={key}>{providerConfig.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {config.needsKey ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={isKeySaved ? 'Stored securely in database' : 'Paste your API key here'}
                      value={currentKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      className="h-9 flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      variant={isKeySaved ? 'outline' : 'default'}
                      className="h-9 gap-1.5 whitespace-nowrap"
                      disabled={isVerifying || (!currentKey && !isKeySaved)}
                      onClick={handleVerifyAndSave}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying...
                        </>
                      ) : isKeySaved ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Verified
                        </>
                      ) : (
                        'Verify & Save'
                      )}
                    </Button>
                  </div>
                  {!isKeySaved && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-500">
                      <AlertCircle className="h-3 w-3" /> Verify your key to save cloud settings.
                    </p>
                  )}
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{config.needsKey ? '3' : '2'}</span>
                  Ollama Base URL
                </label>
                <Input
                  value={workspaceSettings.local_base_url}
                  onChange={(e) =>
                    setWorkspaceSettings((current) => ({ ...current, local_base_url: e.target.value }))
                  }
                  className="h-9 text-sm"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => loadLocalModels(workspaceSettings.local_base_url)}
                    disabled={isLoadingLocalModels}
                  >
                    {isLoadingLocalModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refresh Models'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => window.open(ollamaDownloadUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Install Ollama
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => window.open(ollamaLibraryUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Browse Models
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Embeddings always come from your local Ollama instance, even when chat uses a cloud provider.
                </p>
              </div>

              <div>
                <label className="mb-2.5 block text-xs font-medium text-foreground">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{config.needsKey ? '4' : '3'}</span>
                  Models
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Chat Model</label>
                    <Select
                      value={workspaceSettings.cloud_chat_model}
                      onValueChange={(value) =>
                        setWorkspaceSettings((current) => ({ ...current, cloud_chat_model: value }))
                      }
                      disabled={provider === 'local' && chatModelOptions.length === 0}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue
                          placeholder={
                            provider === 'local'
                              ? isLoadingLocalModels
                                ? 'Loading local models...'
                                : 'No local chat models found'
                              : undefined
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {chatModelOptions.map((model) => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Embedding Model</label>
                    <Select
                      value={workspaceSettings.cloud_embedding_model}
                      onValueChange={(value) =>
                        setWorkspaceSettings((current) => ({ ...current, cloud_embedding_model: value }))
                      }
                      disabled={embeddingModelOptions.length === 0}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue
                          placeholder={
                            provider === 'local'
                              ? isLoadingLocalModels
                                ? 'Loading embedding models...'
                                : 'No local embedding models found'
                              : undefined
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {embeddingModelOptions.map((model) => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Recommended Embedding Models
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    These local embeddings are shared across all providers. The vector database schema is fixed to 768 dimensions right now.
                  </p>
                  {recommendedEmbeddingModels.map((model) => {
                    const isInstalled = localEmbeddingModels.includes(model.name);
                    return (
                      <div key={model.name} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground">{model.name}</div>
                          <div className="text-[10px] text-muted-foreground">{model.description}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={isInstalled ? 'outline' : 'default'}
                          className="h-7 text-[10px]"
                          disabled={isInstalled || pullingModelName === model.name}
                          onClick={() => handlePullEmbeddingModel(model.name)}
                        >
                          {pullingModelName === model.name ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isInstalled ? (
                            'Installed'
                          ) : (
                            'Download'
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Preferences</h3>
            <p className="mb-4 text-xs text-muted-foreground">Fine-tune how documents are grouped</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Clustering Method</label>
                <Select
                  value={workspaceSettings.clustering_method}
                  onValueChange={(value) =>
                    setWorkspaceSettings((current) => ({ ...current, clustering_method: value }))
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
                <label className="mb-1.5 block text-xs font-medium text-foreground">Min Cluster Size</label>
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
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
