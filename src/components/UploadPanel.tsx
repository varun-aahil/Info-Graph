import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import type { Document } from '@/lib/types';
import { uploadDocuments as uploadApi, deleteDocument as deleteApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface UploadPanelProps {
  documents: Document[];
  onDocumentsChange: Dispatch<SetStateAction<Document[]>>;
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
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const pdfFiles = Array.from(files).filter(
        (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
      );
      if (pdfFiles.length === 0) return;

      const initialDocs: Document[] = pdfFiles.map((f) => ({
        id: `local-${crypto.randomUUID()}`,
        name: f.name,
        size: f.size,
        status: 'queued',
        progress: 0,
        uploadedAt: new Date(),
      }));

      onDocumentsChange((current) =>
        [...initialDocs, ...current].sort(
          (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
        )
      );

      try {
        await uploadApi(pdfFiles, (updatedDoc) => {
          onDocumentsChange((current) => {
            const exists = current.some((d) => d.name === updatedDoc.name);
            if (exists) {
              return current.map((d) => (d.name === updatedDoc.name ? updatedDoc : d));
            }
            return [updatedDoc, ...current].sort(
              (a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()
            );
          });
        });
        toast({ title: 'Upload complete', description: 'All PDFs have been submitted.' });
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

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteApi(documentToDelete);
      onDocumentsChange(documents.filter((d) => d.id !== documentToDelete));
      toast({ title: 'Deleted', description: 'Document was deleted.' });
      onUploadComplete?.();
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete document.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDocumentToDelete(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    setDocumentToDelete(docId);
  };

  return (
    <div className="flex flex-col h-full gap-3">
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

      <div className="flex-1 min-h-0 overflow-y-auto max-h-[calc(100vh-16rem)] flex flex-col gap-1 pr-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
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
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {statusIcon[doc.status]}
                <button
                  onClick={(e) => handleDelete(e, doc.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors flex items-center"
                  title="Delete document"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {documents.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No documents yet
            </p>
          )}
      </div>

      {documentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg border border-border">
            <h3 className="text-lg font-semibold text-foreground">Delete Document</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this document? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDocumentToDelete(null)}
                disabled={isDeleting}
                className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
