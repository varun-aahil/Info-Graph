import { useState, useEffect } from 'react';
import { Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Logo from '@/components/Logo';
import UploadPanel from '@/components/UploadPanel';
import ScatterPlot from '@/components/ScatterPlot';
import ClusterInfoPanel from '@/components/ClusterInfoPanel';
import ChatPanel from '@/components/ChatPanel';
import { fetchDocuments, fetchGraphData } from '@/lib/api';
import {
  type Document,
  type ScatterPoint,
  type ClusterInfo,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const Index = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [scatterData, setScatterData] = useState<ScatterPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<ScatterPoint | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const refreshWorkspace = async () => {
    const [loadedDocuments, graph] = await Promise.all([fetchDocuments(), fetchGraphData()]);
    setDocuments(loadedDocuments);
    setScatterData(graph.points);
    setClusters(graph.clusters);
  };

  useEffect(() => {
    refreshWorkspace().catch(() => undefined);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Background gradient */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'var(--gradient-bg)' }}
      />

      {/* Nav */}
      <header className="glass-panel-strong relative z-20 flex items-center justify-between border-b border-border/30 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {sidebarOpen ? 'Hide documents' : 'Show documents'}
            </TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--gradient-primary)' }}>
              <Logo className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold font-['Space_Grotesk'] gradient-text">
              InfoGraph
            </h1>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      {/* Main layout */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Left — Upload */}
        <aside
          className={`glass-panel-strong shrink-0 border-r border-border/30 transition-all duration-300 ease-in-out overflow-hidden ${sidebarOpen ? 'w-72 p-4' : 'w-0 p-0'
            }`}
        >
          <div className="w-64">
            <UploadPanel
              documents={documents}
              onDocumentsChange={setDocuments}
              onUploadComplete={refreshWorkspace}
            />
          </div>
        </aside>

        {/* Center — Scatter Plot */}
        <main className="relative flex-1 p-3">
          <div className="glass-panel h-full rounded-2xl p-1.5">
            <ScatterPlot
              data={scatterData}
              clusters={clusters}
              selectedClusterId={selectedClusterId}
              onPointClick={setSelectedPoint}
              onClusterSelect={setSelectedClusterId}
            />
          </div>
          <ClusterInfoPanel
            selectedPoint={selectedPoint}
            clusters={clusters}
            selectedClusterId={selectedClusterId}
            onClear={() => {
              setSelectedPoint(null);
              setSelectedClusterId(null);
            }}
          />
        </main>

        {/* Right — Chat (only visible when selection exists) */}
        <aside
          className={`glass-panel-strong shrink-0 border-l border-border/30 transition-all duration-300 ease-in-out overflow-hidden ${hasSelection ? 'w-80' : 'w-0'
            }`}
        >
          <div className="w-80 h-full">
            <ChatPanel
              clusterContext={clusterContext}
              hasSelection={hasSelection}
              selection={chatSelection}
            />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Index;
