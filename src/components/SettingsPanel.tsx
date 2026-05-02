import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WorkspaceSettings } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface SettingsPanelProps {
  user: any;
  workspaceSettings: WorkspaceSettings;
  setWorkspaceSettings: React.Dispatch<React.SetStateAction<WorkspaceSettings>>;
  onSave: () => void;
  isSaving: boolean;
}

// -------------------------------------------------------------------
// Provider configs — model strings MUST match what LiteLLM expects.
// LiteLLM handles routing natively via the model prefix so no base_url
// is needed for standard cloud providers.
// -------------------------------------------------------------------
const PROVIDER_CONFIGS: Record<
  string,
  { label: string; chatModels: string[]; needsKey: boolean }
> = {
  gemini: {
    label: 'Google Gemini',
    chatModels: [
      // --- Gemini 3.x (Preview — current generation) ---
      'gemini-3.1-pro-preview',        // flagship reasoning
      'gemini-3-flash-preview',        // frontier-class fast
      'gemini-3.1-flash-lite-preview', // cheapest/fastest
      // --- Gemini 2.5 (Stable GA — still active) ---
      'gemini-2.5-pro',                // advanced reasoning (stable)
      'gemini-2.5-flash',              // best price-performance (stable)
      'gemini-2.5-flash-lite',         // budget-friendly (stable)
    ],
    needsKey: true,
  },
  openai: {
    label: 'OpenAI',
    chatModels: [
      // --- GPT-4.1 series (1M context, current) ---
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      // --- GPT-4o series (established multimodal) ---
      'gpt-4o',
      'gpt-4o-mini',
      // --- Reasoning models ---
      'o4-mini',
      'o3-mini',
    ],
    needsKey: true,
  },
  anthropic: {
    label: 'Anthropic',
    chatModels: [
      // --- Active models (from official deprecations page) ---
      'claude-opus-4-7',               // latest flagship (Apr 2026)
      'claude-opus-4-6',               // Opus 4.6
      'claude-sonnet-4-6',             // Sonnet 4.6
      'claude-sonnet-4-5-20250929',    // Sonnet 4.5
      'claude-opus-4-5-20251101',      // Opus 4.5
      'claude-opus-4-1-20250805',      // Opus 4.1
      'claude-haiku-4-5-20251001',     // Haiku 4.5 (fast/cheap)
    ],
    needsKey: true,
  },
  xai: {
    label: 'xAI (Grok)',
    chatModels: [
      // --- Grok 4.x series (current generation) ---
      'grok-4.3',                      // latest flagship (Apr 2026)
      'grok-4.20-reasoning',           // deep reasoning variant
      'grok-4.20-non-reasoning',       // fast non-reasoning variant
      'grok-4-1-fast-reasoning',       // low-latency reasoning
      'grok-4-1-fast-non-reasoning',   // low-latency fast
      'grok-4',                        // Grok 4 base
      // --- Grok 3 (established) ---
      'grok-3',
      'grok-3-mini',
    ],
    needsKey: true,
  },
  local: {
    label: 'Custom / Local',
    chatModels: ['llama3', 'mistral', 'gemma', 'phi3'],
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
  // ── Per-provider dictionaries ─────────────────────────────────────
  // API keys and verified flags are stored PER PROVIDER so switching
  // the dropdown never erases a previously entered/verified key.
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    gemini: '',
    openai: '',
    anthropic: '',
    xai: '',
    local: '',
  });
  const [verifiedProviders, setVerifiedProviders] = useState<Record<string, boolean>>({});
  const [isVerifying, setIsVerifying] = useState(false);

  const provider = (workspaceSettings.model_provider || 'gemini') as ProviderKey;
  const config = PROVIDER_CONFIGS[provider] ?? PROVIDER_CONFIGS.gemini;

  // Current provider's key & verified state derived from the dictionaries
  const currentKey = apiKeys[provider] || '';
  const isKeySaved = verifiedProviders[provider] ?? false;

  // ── Hydrate on mount ───────────────────────────────────────────────
  // If the backend already has a configured key for the active provider,
  // mark it verified so model dropdowns are unlocked immediately.
  useEffect(() => {
    if (workspaceSettings.cloud_api_key_configured) {
      setVerifiedProviders((prev) => ({ ...prev, [provider]: true }));
    }
    // Seed the current key from workspaceSettings if present
    if (workspaceSettings.cloud_api_key) {
      setApiKeys((prev) => ({ ...prev, [provider]: workspaceSettings.cloud_api_key }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Smart auto-detect: inspect the pasted key prefix to set the provider
  // ------------------------------------------------------------------
  const handleApiKeyChange = (value: string) => {
    // Always store the key for the CURRENT provider first
    setApiKeys((prev) => ({ ...prev, [provider]: value }));
    // Invalidate verification — user changed the key
    setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));

    // Auto-detect provider from key prefix
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
      // Store the key under the DETECTED provider, not the old one
      setApiKeys((prev) => ({
        ...prev,
        [provider]: '',                   // clear from old provider
        [detectedProvider!]: value,       // set on detected provider
      }));
      setVerifiedProviders((prev) => ({ ...prev, [detectedProvider!]: false }));
      setWorkspaceSettings((c) => ({
        ...c,
        model_provider: detectedProvider!,
        cloud_api_key: value,
        cloud_base_url: '',
        cloud_chat_model: next.chatModels[0],
      }));
    } else {
      // Same provider — just sync the key to workspace
      setWorkspaceSettings((c) => ({ ...c, cloud_api_key: value }));
    }
  };

  // ------------------------------------------------------------------
  // Provider change: switch to the new provider, RESTORE its saved key,
  // and reflect its verified state. Nothing is erased.
  // ------------------------------------------------------------------
  const handleProviderChange = (nextProvider: string) => {
    const next = PROVIDER_CONFIGS[nextProvider as ProviderKey] ?? PROVIDER_CONFIGS.gemini;
    setIsVerifying(false);

    // Restore the key we have in memory for this provider (may be empty)
    const restoredKey = apiKeys[nextProvider] || '';

    setWorkspaceSettings((c) => ({
      ...c,
      model_provider: nextProvider,
      cloud_api_key: restoredKey,
      cloud_base_url: '',
      local_base_url: nextProvider === 'local' ? 'http://localhost:11434' : c.local_base_url,
      cloud_chat_model: next.chatModels[0],
    }));
  };

  // ------------------------------------------------------------------
  // Verify & Save: direct fetch to PUT /settings. The payload is built
  // strictly from the ACTIVE provider + its key + its selected model.
  // ------------------------------------------------------------------
  const handleVerifyAndSave = async () => {
    setIsVerifying(true);
    setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));

    // Build a strict payload — never mix providers/models
    const strictPayload: WorkspaceSettings = {
      ...workspaceSettings,
      model_provider: provider,
      cloud_api_key: currentKey,
      cloud_base_url: '',
    };

    try {
      const token = localStorage.getItem('infograph_access_token');
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

      const response = await fetch(`${apiBase}/settings`, {
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

      // 402 = key is valid but account has billing/credit issues
      // Show a warning (not destructive) — the key itself is fine
      if (/402|lacks credits|add credits|payment required/i.test(raw)) {
        setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));
        toast({
          title: 'Account Issue',
          description: raw || 'Your API key is valid, but your account needs credits. Please check your provider console.',
        });
      } else {
        setVerifiedProviders((prev) => ({ ...prev, [provider]: false }));

        // Use the backend's message directly — it's already scrubbed and human-readable
        const errorMessage = raw || 'Verification failed. Please try again.';
        toast({
          title: 'Verification Failed',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Model dropdowns are ALWAYS unlocked — the user must be able to
  // select a model BEFORE verifying their key to avoid the chicken-
  // and-egg deadlock where verification uses the selected model.

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        <p className="mb-8 text-sm text-muted-foreground">Configure your InfoGraph workspace</p>

        <div className="space-y-6">
          {/* ── Profile ─────────────────────────────────────────── */}
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

          {/* ── Model Configuration ─────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Model Configuration</h3>
            <p className="mb-4 text-xs text-muted-foreground">Choose how to connect your LLM</p>

            <div className="space-y-5">
              {/* Step 1 — Provider */}
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
                    {Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2 — API Key (cloud providers only) */}
              {config.needsKey && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={
                        isKeySaved
                          ? 'Stored securely in database'
                          : 'Paste your API key here'
                      }
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
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…</>
                      ) : isKeySaved ? (
                        <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Verified</>
                      ) : (
                        'Verify & Save'
                      )}
                    </Button>
                  </div>
                  {!isKeySaved && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-500">
                      <AlertCircle className="h-3 w-3" /> Verify your key to unlock model selection
                    </p>
                  )}
                </div>
              )}

              {/* Step 2b — Base URL (local/custom provider ONLY) */}
              {!config.needsKey && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                    Base URL
                  </label>
                  <Input
                    value={workspaceSettings.local_base_url}
                    onChange={(e) =>
                      setWorkspaceSettings((c) => ({ ...c, local_base_url: e.target.value }))
                    }
                    className="h-9 text-sm"
                  />
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    Ensure Ollama or LocalAI is reachable from the Docker container.
                  </p>
                </div>
              )}

              {/* Step 3 — Model Dropdowns (always enabled) */}
              <div>
                <label className="mb-2.5 block text-xs font-medium text-foreground">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                  Models
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Chat Model</label>
                    <Select
                      value={workspaceSettings.cloud_chat_model}
                      onValueChange={(val) => setWorkspaceSettings((c) => ({ ...c, cloud_chat_model: val }))}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {config.chatModels.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Embedding Model</label>
                    <Input
                      value={workspaceSettings.cloud_embedding_model}
                      onChange={(e) =>
                        setWorkspaceSettings((c) => ({ ...c, cloud_embedding_model: e.target.value }))
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Clustering Preferences ──────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Preferences</h3>
            <p className="mb-4 text-xs text-muted-foreground">Fine-tune how documents are grouped</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">Clustering Method</label>
                <Select
                  value={workspaceSettings.clustering_method}
                  onValueChange={(value) =>
                    setWorkspaceSettings((c) => ({ ...c, clustering_method: value }))
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
                    setWorkspaceSettings((c) => ({
                      ...c,
                      min_cluster_size: Number(e.target.value) || 1,
                    }))
                  }
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Save button */}
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
