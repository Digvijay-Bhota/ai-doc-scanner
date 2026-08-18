import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { CloudUpload, File, X, CheckCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Topbar from '../components/layout/Topbar';
import { uploadDocument } from '../services/api';

const ACCEPTED = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export default function UploadPage() {
  const navigate  = useNavigate();
  const [files, setFiles]       = useState([]);
  const [title, setTitle]       = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [done, setDone]           = useState(false);

  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFiles([f]);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    onDropRejected: ([rej]) => {
      const code = rej.errors[0]?.code;
      if (code === 'file-too-large') toast.error('File too large. Max 10 MB.');
      else if (code === 'file-invalid-type') toast.error('Unsupported file type.');
      else toast.error('Invalid file.');
    },
  });

  const clearFile = (e) => {
    e.stopPropagation();
    setFiles([]);
    setTitle('');
    setDone(false);
    setProgress(0);
  };

  const handleUpload = async () => {
    if (!files.length) { toast.error('Please select a file.'); return; }
    if (!title.trim()) { toast.error('Please enter a document title.'); return; }

    setUploading(true);
    setProgress(0);

    const fd = new FormData();
    fd.append('document', files[0]);
    fd.append('title', title.trim());

    try {
      const res = await uploadDocument(fd, setProgress);
      setDone(true);
      toast.success('Document uploaded! OCR is running in the background.');
      setTimeout(() => navigate(`/documents/${res.data.document.id}`), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell>
      <Topbar title="Upload Document" />
      <div className="page" style={{ maxWidth: 600 }}>
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`dropzone${isDragActive ? ' active' : ''}`}
          style={{ marginBottom: 20 }}
        >
          <input {...getInputProps()} id="file-input" />
          {files.length ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <File size={28} color="var(--accent)" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{files[0].name}</span>
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={clearFile}
                  style={{ padding: 4 }}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                {(files[0].size / 1024 / 1024).toFixed(2)} MB · {files[0].type}
              </p>
            </div>
          ) : (
            <>
              <CloudUpload className="dropzone-icon" />
              <div className="dropzone-title">
                {isDragActive ? 'Drop to upload' : 'Drag & drop or click to browse'}
              </div>
              <p className="dropzone-sub">PNG, JPG, WEBP or PDF · Max 10 MB</p>
            </>
          )}
        </div>

        {/* Title input */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label" htmlFor="doc-title">Document Title</label>
          <input
            id="doc-title"
            className="form-input"
            type="text"
            placeholder="e.g. Invoice Q3-2026"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
        </div>

        {/* Progress */}
        {uploading && (
          <div style={{ marginBottom: 16 }}>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>{progress}% uploaded</p>
          </div>
        )}

        {/* CTA */}
        <button
          id="upload-submit"
          className="btn btn-primary btn-full"
          onClick={handleUpload}
          disabled={uploading || done || !files.length}
        >
          {done ? (
            <><CheckCircle size={15} /> Uploaded — redirecting…</>
          ) : uploading ? (
            <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Uploading…</>
          ) : (
            <><CloudUpload size={15} /> Upload &amp; Run OCR</>
          )}
        </button>

        <p className="text-muted" style={{ marginTop: 14, fontSize: 12 }}>
          OCR extraction runs automatically after upload. For large documents, this may take 10–30 seconds.
        </p>
      </div>
    </AppShell>
  );
}
