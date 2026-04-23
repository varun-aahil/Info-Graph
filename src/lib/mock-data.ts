export interface Document {
  id: string;
  name: string;
  size: number;
  status: 'queued' | 'uploading' | 'processing' | 'ready' | 'error';
  progress: number;
  uploadedAt: Date;
  errorMessage?: string;
}

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  documentName: string;
  snippet: string;
  cluster: number;
  clusterLabel: string;
  isAnomaly: boolean;
}

export interface ClusterInfo {
  id: number;
  label: string;
  color: string;
  documentCount: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const clusterLabels = [
  'Machine Learning',
  'Data Engineering',
  'Natural Language Processing',
  'Computer Vision',
  'Distributed Systems',
];

const clusterColors = [
  'hsl(250, 80%, 65%)',
  'hsl(200, 60%, 50%)',
  'hsl(170, 60%, 45%)',
  'hsl(35, 85%, 55%)',
  'hsl(330, 70%, 55%)',
];

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateClusterPoints(
  clusterId: number,
  centerX: number,
  centerY: number,
  count: number,
  spread: number
): ScatterPoint[] {
  const docs = [
    'transformer_architectures.pdf',
    'attention_mechanisms.pdf',
    'bert_analysis.pdf',
    'data_pipeline_design.pdf',
    'etl_best_practices.pdf',
    'spark_optimization.pdf',
    'sentiment_analysis.pdf',
    'text_classification.pdf',
    'named_entity_recognition.pdf',
    'image_segmentation.pdf',
    'object_detection.pdf',
    'gan_survey.pdf',
    'microservices_patterns.pdf',
    'consensus_algorithms.pdf',
    'load_balancing.pdf',
  ];

  const snippets = [
    'The self-attention mechanism computes a weighted sum of values…',
    'Batch normalization reduces internal covariate shift by normalizing…',
    'The ETL pipeline processes approximately 2TB of data daily…',
    'Named entities are classified into predefined categories such as…',
    'Convolutional layers extract hierarchical features from input images…',
    'Consensus is achieved through a series of voting rounds among nodes…',
    'Transfer learning leverages pre-trained models to reduce training time…',
    'The distributed hash table provides O(log n) lookup complexity…',
    'Tokenization splits text into subword units using BPE encoding…',
    'Feature pyramids enable multi-scale object detection across…',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `point-${clusterId}-${i}`,
    x: centerX + randomInRange(-spread, spread),
    y: centerY + randomInRange(-spread, spread),
    documentName: docs[(clusterId * 3 + i) % docs.length],
    snippet: snippets[(clusterId * 2 + i) % snippets.length],
    cluster: clusterId,
    clusterLabel: clusterLabels[clusterId],
    isAnomaly: false,
  }));
}

export function generateMockScatterData(): ScatterPoint[] {
  const centers = [
    { x: -3, y: 2 },
    { x: 3, y: 3 },
    { x: -2, y: -3 },
    { x: 4, y: -2 },
    { x: 0, y: 0 },
  ];

  const points: ScatterPoint[] = [];
  centers.forEach((center, i) => {
    points.push(...generateClusterPoints(i, center.x, center.y, 10, 1.2));
  });

  // Add anomalies
  const anomalies: ScatterPoint[] = [
    {
      id: 'anomaly-1',
      x: -5,
      y: -5,
      documentName: 'unknown_format_doc.pdf',
      snippet: 'This document contains unusual formatting and mixed content…',
      cluster: -1,
      clusterLabel: 'Anomaly',
      isAnomaly: true,
    },
    {
      id: 'anomaly-2',
      x: 6,
      y: 5,
      documentName: 'corrupted_research.pdf',
      snippet: 'Partially recovered content suggests quantum computing overlap…',
      cluster: -1,
      clusterLabel: 'Anomaly',
      isAnomaly: true,
    },
    {
      id: 'anomaly-3',
      x: 5,
      y: -5,
      documentName: 'outlier_paper.pdf',
      snippet: 'Cross-domain study bridging biology and computation…',
      cluster: -1,
      clusterLabel: 'Anomaly',
      isAnomaly: true,
    },
  ];

  return [...points, ...anomalies];
}

export function getMockClusters(): ClusterInfo[] {
  return clusterLabels.map((label, i) => ({
    id: i,
    label,
    color: clusterColors[i],
    documentCount: 10,
  }));
}

export function getMockChatResponse(
  message: string,
  selectedCluster: string | null
): string {
  const responses: Record<string, string[]> = {
    'Machine Learning': [
      'Based on the Machine Learning cluster, the documents primarily discuss transformer architectures and attention mechanisms. The key finding is that self-attention allows models to capture long-range dependencies more effectively than RNNs.',
      'The ML cluster contains 10 documents focused on deep learning fundamentals. Notable themes include transfer learning efficiency and batch normalization techniques.',
    ],
    'Data Engineering': [
      'The Data Engineering cluster reveals documents about ETL pipelines and Spark optimization. These papers emphasize the importance of data quality in production ML systems.',
      'Documents in this cluster discuss scalable data pipeline architectures. Key recommendations include implementing data validation checkpoints at each processing stage.',
    ],
    'Natural Language Processing': [
      'The NLP cluster contains research on sentiment analysis, text classification, and named entity recognition. Recent trends show a shift toward few-shot learning approaches.',
      'These documents highlight advances in tokenization strategies, particularly BPE and SentencePiece, which significantly improve multilingual model performance.',
    ],
    'Computer Vision': [
      'The Computer Vision cluster focuses on image segmentation and object detection. GANs are prominently discussed for data augmentation and synthetic data generation.',
      'Key insights from this cluster: feature pyramid networks have become the standard backbone for multi-scale detection tasks.',
    ],
    'Distributed Systems': [
      'Documents in the Distributed Systems cluster cover consensus algorithms and microservice patterns. The CAP theorem implications are thoroughly analyzed across multiple papers.',
      'This cluster reveals important patterns around load balancing and fault tolerance in distributed architectures.',
    ],
    Anomaly: [
      'The selected anomaly document doesn\'t fit neatly into any cluster. This could indicate a cross-domain study or a document with unusual content structure worth investigating manually.',
    ],
  };

  if (selectedCluster && responses[selectedCluster]) {
    const options = responses[selectedCluster];
    return options[Math.floor(Math.random() * options.length)];
  }

  const general = [
    'I can provide more specific insights if you select a cluster or document from the scatter plot. Try clicking on a group of points to set the context for our conversation.',
    'The scatter plot shows 5 distinct topic clusters across your uploaded documents, with 3 anomalous documents that don\'t fit standard categories. Would you like me to analyze a specific cluster?',
    'Your document collection spans Machine Learning, Data Engineering, NLP, Computer Vision, and Distributed Systems. Select a cluster to dive deeper into the themes.',
  ];
  return general[Math.floor(Math.random() * general.length)];
}

export const mockDocuments: Document[] = [
  { id: '1', name: 'transformer_architectures.pdf', size: 2456000, status: 'ready', progress: 100, uploadedAt: new Date('2025-01-15') },
  { id: '2', name: 'data_pipeline_design.pdf', size: 1823000, status: 'ready', progress: 100, uploadedAt: new Date('2025-01-16') },
  { id: '3', name: 'sentiment_analysis.pdf', size: 3102000, status: 'ready', progress: 100, uploadedAt: new Date('2025-01-17') },
  { id: '4', name: 'image_segmentation.pdf', size: 4521000, status: 'ready', progress: 100, uploadedAt: new Date('2025-01-18') },
  { id: '5', name: 'consensus_algorithms.pdf', size: 1956000, status: 'ready', progress: 100, uploadedAt: new Date('2025-01-19') },
];
