import { useMemo } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import type { ScatterPoint, ClusterInfo } from '@/lib/mock-data';

const Plot = createPlotlyComponent(Plotly);

interface ScatterPlotProps {
  data: ScatterPoint[];
  clusters: ClusterInfo[];
  onPointClick: (point: ScatterPoint) => void;
  onClusterSelect: (clusterId: number) => void;
  selectedClusterId: number | null;
}

const CLUSTER_COLORS = [
  'hsl(250, 75%, 70%)',
  'hsl(200, 55%, 60%)',
  'hsl(170, 50%, 50%)',
  'hsl(35, 80%, 60%)',
  'hsl(330, 60%, 60%)',
];

const ANOMALY_COLOR = 'hsl(0, 70%, 60%)';

export default function ScatterPlot({
  data,
  clusters,
  onPointClick,
  onClusterSelect,
  selectedClusterId,
}: ScatterPlotProps) {
  const traces = useMemo(() => {
    const grouped: Record<string, ScatterPoint[]> = {};
    data.forEach((p) => {
      const key = p.isAnomaly ? 'Anomaly' : p.clusterLabel;
      (grouped[key] ??= []).push(p);
    });

    return Object.entries(grouped).map(([label, points]) => {
      const isAnomaly = label === 'Anomaly';
      const clusterId = isAnomaly ? -1 : points[0].cluster;
      const color = isAnomaly
        ? ANOMALY_COLOR
        : CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
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
          size: isAnomaly ? 14 : isSelected ? 13 : 10,
          color,
          opacity: selectedClusterId !== null && !isSelected ? 0.25 : 0.8,
          line: {
            width: isAnomaly ? 2 : isSelected ? 2 : 0.5,
            color: isAnomaly
              ? 'rgba(220,80,80,0.5)'
              : isSelected
                ? 'rgba(0,0,0,0.2)'
                : 'rgba(0,0,0,0.05)',
          },
          symbol: isAnomaly ? 'diamond' : 'circle',
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

  const layout: Partial<Plotly.Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { l: 50, r: 20, t: 20, b: 50 },
    xaxis: {
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.06)',
      zerolinecolor: 'rgba(0,0,0,0.1)',
      tickfont: { color: '#999', size: 10 },
      title: { text: 'Data Info Flow', font: { color: '#999', size: 11 } },
    },
    yaxis: {
      showgrid: true,
      gridcolor: 'rgba(0,0,0,0.06)',
      zerolinecolor: 'rgba(0,0,0,0.1)',
      tickfont: { color: '#999', size: 10 },
      title: { text: 'Cosine Similarity', font: { color: '#999', size: 11 } },
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
    dragmode: 'lasso',
    autosize: true,
    hovermode: 'closest',
  };

  return (
    <div className="h-full w-full">
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
              onClusterSelect(point.isAnomaly ? -1 : point.cluster);
            }
          }
        }}
      />
    </div>
  );
}
