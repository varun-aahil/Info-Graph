import { useCallback, useState } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import type { Document } from '@/lib/mock-data';
import { uploadDocuments as uploadApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface UploadPanelProps {
  documents: Document[];
  onDocumentsChange: (docs: Document[]) => void;
  onUploadComplete?: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const statusIcon = {
  queued: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  uploading: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  processing: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  ready: <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
};

export default function UploadPanel({ documents, onDocumentsChange, onUploadComplete }: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const pdfFiles = Array.from(files).filter(
        (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
      );
      if (pdfFiles.length === 0) return;

      try {
        await uploadApi(pdfFiles, (doc) => {
          onDocumentsChange(
            [...documents.filter((d) => d.id !== doc.id && d.name !== doc.name), doc].sort(
              (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
            )
          );
        });
        toast({ title: 'Upload started', description: 'Your PDFs are being processed.' });
        onUploadComplete?.();
      } catch (error) {
        toast({
          title: 'Upload failed',
          description: error instanceof Error ? error.message : 'Could not upload PDFs.',
          variant: 'destructive',
        });
      }
    },
    [documents, onDocumentsChange, onUploadComplete]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = '.pdf';
          input.onchange = () => handleFiles(input.files);
          input.click();
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-4 transition-all ${
          isDragging
            ? 'border-foreground bg-accent'
            : 'border-border hover:border-muted-foreground hover:bg-accent'
        }`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <div className="text-center">
          <p className="text-xs font-medium text-foreground">Drop PDFs here</p>
          <p className="text-[10px] text-muted-foreground">or click to browse</p>
        </div>
      </div>

      {/* Document List */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-foreground">Files</h3>
        <span className="text-[10px] text-muted-foreground">{documents.length}</span>
      </div>

      <ScrollArea className="max-h-64">
        <div className="flex flex-col gap-1">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent min-w-0"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{doc.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatSize(doc.size)}</p>
                {doc.status !== 'ready' && doc.status !== 'error' && (
                  <Progress value={doc.progress} className="mt-1 h-0.5" />
                )}
                {doc.status === 'error' && doc.errorMessage && (
                  <p className="mt-1 line-clamp-2 text-[10px] text-destructive">{doc.errorMessage}</p>
                )}
              </div>
              <div className="shrink-0">{statusIcon[doc.status]}</div>
            </div>
          ))}
          {documents.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No documents yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
