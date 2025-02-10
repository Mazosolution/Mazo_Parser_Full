import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

interface FileUploadProps {
  onFileUpload: (files: File[]) => void;
  accept: Record<string, string[]>;
  title: string;
}

const FileUpload = ({ onFileUpload, accept, title }: FileUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsUploading(true);
    setProgress(0);
    
    // Simulate progress for visual feedback
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    try {
      await onFileUpload(acceptedFiles);
    } finally {
      setProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setProgress(0);
        clearInterval(interval);
      }, 500);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple: true
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors relative
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          {isUploading ? (
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          ) : (
            <Upload className="w-12 h-12 text-gray-400" />
          )}
          <p className="text-lg font-medium">{title}</p>
          <p className="text-sm text-gray-500">
            {isUploading ? 'Processing files...' : 'Drag & drop files here, or click to select files'}
          </p>
          <p className="text-xs text-gray-400">
            Supports PDF and DOCX formats
          </p>
        </div>
      </div>
      {isUploading && (
        <div className="space-y-2">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-center text-gray-500">{progress}% complete</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;