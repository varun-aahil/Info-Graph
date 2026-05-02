import { useMemo, useState, useCallback, useEffect } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import type { ScatterPoint, ClusterInfo } from '@/lib/types';

const Plot = createPlotlyComponent(Plotly);

interface ScatterPlotProps {
  data: ScatterPoint[];
  clusters: ClusterInfo[];
  onPointClick: (point: ScatterPoint) => void;
  onClusterSelect: (clusterId: number) => void;
  selectedClusterId: number | null;
  selectedPointId: string | null;
}

const CLUSTER_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

// Fix #3: Noise/anomaly nodes get a subtle neutral gray, not aggressive red
const NOISE_COLOR = '#94a3b8'; // slate-400 — visible but non-alarming

export default function ScatterPlot({
  data,
  clusters,
  onPointClick,
  onClusterSelect,
  selectedClusterId,
  selectedPointId,
}: ScatterPlotProps) {
  // Fix #2: Track zoom domain state for cluster-level zooming
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const [yDomain, setYDomain] = useState<[number, number] | null>(null);

  // Fix #2: Compute full data extent with 10% padding
  const fullExtent = useMemo(() => {
    if (data.length === 0) return { x: [-5, 5] as [number, number], y: [-5, 5] as [number, number] };
    const xs = data.map((p) => p.x);
    const ys = data.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xMargin = (xMax - xMin) * 0.1 || 1;
    const yMargin = (yMax - yMin) * 0.1 || 1;
    return {
      x: [xMin - xMargin, xMax + xMargin] as [number, number],
      y: [yMin - yMargin, yMax + yMargin] as [number, number],
    };
  }, [data]);

  // Fix #2: Zoom to cluster with 15% breathing room
  const zoomToCluster = useCallback(
    (clusterId: number) => {
      const clusterPoints = data.filter((p) =>
        clusterId < 0 ? p.isAnomaly : p.cluster === clusterId
      );
      if (clusterPoints.length === 0) return;

      const xs = clusterPoints.map((p) => p.x);
      const ys = clusterPoints.map((p) => p.y);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      // 45% margin on each side so edge nodes aren't clipped when zoomed
      const xMargin = Math.max((xMax - xMin) * 0.45, 0.5);
      const yMargin = Math.max((yMax - yMin) * 0.45, 0.5);

      setXDomain([xMin - xMargin, xMax + xMargin]);
      setYDomain([yMin - yMargin, yMax + yMargin]);
    },
    [data]
  );

  const zoomToPoint = useCallback(
    (pointId: string) => {
      const point = data.find((p) => p.id === pointId);
      if (!point) return;

      const margin = 1.0;
      setXDomain([point.x - margin, point.x + margin]);
      setYDomain([point.y - margin, point.y + margin]);
    },
    [data]
  );

  useEffect(() => {
    if (selectedClusterId !== null) {
      zoomToCluster(selectedClusterId);
    } else if (selectedPointId !== null) {
      zoomToPoint(selectedPointId);
    } else {
      setXDomain(null);
      setYDomain(null);
    }
  }, [selectedClusterId, selectedPointId, zoomToCluster, zoomToPoint]);

  const resetZoom = useCallback(() => {
    setXDomain(null);
    setYDomain(null);
  }, []);

  const traces = useMemo(() => {
    const grouped: Record<string, ScatterPoint[]> = {};
    data.forEach((p) => {
      const key = p.isAnomaly ? 'Noise / Outliers' : p.clusterLabel;
      (grouped[key] ??= []).push(p);
    });

    return Object.entries(grouped).map(([label, points]) => {
      const isNoise = label === 'Noise / Outliers';
      const clusterId = isNoise ? -1 : points[0].cluster;
      const colorIndex = clusterId < 0 ? 0 : clusterId % CLUSTER_COLORS.length;
      // Fix #3: Noise uses neutral gray, regular clusters use vibrant colors
      const color = isNoise ? NOISE_COLOR : CLUSTER_COLORS[colorIndex];
      const isSelected = selectedClusterId === clusterId;

      return {
        x: points.map((p) => p.x),
        y: points.map((p) => p.y),
        text: points.map(
          (p) => `<b>${p.documentName}</b><br><i>${p.snippet.slice(0, 80)}…</i>`
        ),
        customdata: points,
        name: label,
        type: 'scatter' as const,
        mode: 'markers' as const,
        marker: {
          // Fix #3: Noise nodes are circles (not diamonds), slightly smaller
          size: isNoise ? 10 : isSelected ? 16 : 14,
          color,
          opacity: selectedClusterId !== null && !isSelected ? 0.4 : isNoise ? 0.8 : 1,
          line: {
            width: isNoise ? 1 : isSelected ? 2.5 : 1.5,
            color: selectedClusterId !== null && !isSelected ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)',
          },
          // Fix #3: ALL nodes are circles — no red diamonds for noise
          symbol: 'circle',
        },
        hoverinfo: 'text' as const,
        hoverlabel: {
          bgcolor: '#ffffff',
          bordercolor: color,
          font: { color: '#1a1a1a', size: 12, family: 'Inter' },
        },
      };
    });
  }, [data, selectedClusterId]);

  // Fix #1 & #2: Professional gridlines + padding + zoom domain
  const activeXDomain = xDomain ?? fullExtent.x;
  const activeYDomain = yDomain ?? fullExtent.y;

  const layout: Partial<Plotly.Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    // Fix #1: Extra margin for axis labels
    margin: { l: 55, r: 30, t: 25, b: 55 },
    xaxis: {
      // Fix #1: Professional gridlines
      showgrid: true,
      gridcolor: 'rgba(128,128,128,0.3)',
      griddash: 'dot',
      zerolinecolor: 'rgba(128,128,128,0.4)',
      zerolinewidth: 1,
      tickfont: { color: '#999', size: 10, family: 'Inter' },
      title: { text: 'Embedding Dimension 1', font: { color: '#888', size: 11, family: 'Inter' } },
      // Fix #2: Dynamic zoom domain with padding
      range: activeXDomain,
    },
    yaxis: {
      showgrid: true,
      gridcolor: 'rgba(128,128,128,0.3)',
      griddash: 'dot',
      zerolinecolor: 'rgba(128,128,128,0.4)',
      zerolinewidth: 1,
      tickfont: { color: '#999', size: 10, family: 'Inter' },
      title: { text: 'Embedding Dimension 2', font: { color: '#888', size: 11, family: 'Inter' } },
      range: activeYDomain,
    },
    legend: {
      font: { color: '#666', size: 11, family: 'Inter' },
      bgcolor: 'rgba(255,255,255,0.85)',
      bordercolor: 'rgba(0,0,0,0.08)',
      borderwidth: 1,
      x: 0,
      xanchor: 'left',
      y: 1,
      yanchor: 'top',
      orientation: 'h' as const,
    },
    dragmode: 'pan',
    autosize: true,
    hovermode: 'closest',
  };

  return (
    <div className="relative h-full w-full">
      <Plot
        data={traces as any}
        layout={layout}
        config={{
          displayModeBar: true,
          modeBarButtonsToRemove: ['toImage', 'sendDataToCloud'],
          displaylogo: false,
          responsive: true,
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
        onClick={(e: any) => {
          if (e.points?.[0]) {
            const point = e.points[0].customdata as ScatterPoint;
            if (point) {
              onPointClick(point);
              const clusterId = point.isAnomaly ? -1 : point.cluster;
              onClusterSelect(clusterId);
              zoomToCluster(clusterId);
            }
          }
        }}
      />
    </div>
  );
}
