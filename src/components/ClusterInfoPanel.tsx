import type { ScatterPoint, ClusterInfo } from '@/lib/mock-data';
import { AlertTriangle, Layers, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ClusterInfoPanelProps {
  selectedPoint: ScatterPoint | null;
  clusters: ClusterInfo[];
  selectedClusterId: number | null;
  onClear: () => void;
}

export default function ClusterInfoPanel({
  selectedPoint,
  clusters,
  selectedClusterId,
  onClear,
}: ClusterInfoPanelProps) {
  if (selectedClusterId === null && !selectedPoint) return null;

  const cluster = selectedClusterId !== null && selectedClusterId >= 0
    ? clusters.find((c) => c.id === selectedClusterId)
    : null;

  const isAnomaly = selectedPoint?.isAnomaly || selectedClusterId === -1;

  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 animate-in slide-in-from-bottom-4 rounded-xl border border-border bg-card p-4 shadow-lg duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 rounded-lg p-2 ${
              isAnomaly ? 'bg-red-50 text-destructive' : 'bg-muted'
            }`}
          >
            {isAnomaly ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Layers className="h-4 w-4 text-foreground" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {isAnomaly ? 'Anomaly Detected' : cluster?.label ?? 'Unknown Cluster'}
            </h4>
            {cluster && (
              <p className="text-xs text-muted-foreground">
                {cluster.documentCount} documents in this cluster
              </p>
            )}
            {selectedPoint && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span className="truncate">{selectedPoint.documentName}</span>
              </div>
            )}
            {selectedPoint && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {selectedPoint.snippet}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
