import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Download, Trash2,
  RefreshCw, FileText, Copy, CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Topbar from '../components/layout/Topbar';
import {
  getDocument, deleteDocument,
  generateSummary, getSummary, downloadSummary,
} from '../services/api';
import { formatDistanceToNow } from '../utils/date';

const STATUS_CONFIG = {
  pending:    { cls: 'badge-muted',   label: 'Pending'    },
  processing: { cls: 'badge-warning', label: 'Processing' },
  completed:  { cls: 'badge-success', label: 'OCR Done'   },
  failed:     { cls: 'badge-danger',  label: 'Failed'     },
};

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc]             = useState(null);
  const [summary, setSummary]     = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [copied, setCopied]       = useState(false);
  const [polling, setPolling]     = useState(false);

  // Load document
  const loadDoc = useCallback(() => {
    return getDocument(id)
      .then((res) => { setDoc(res.data.document); return res.data.document; })
      .catch(() => toast.error('Document not found.'));
  }, [id]);

  // Load summary (if it exists)
  const loadSummary = useCallback(() => {
    getSummary(id)
      .then((res) => setSummary(res.data.summary))
      .catch(() => {}); // 404 = no summary yet, that's fine
  }, [id]);

  useEffect(() => {
    setLoadingDoc(true);
    Promise.all([loadDoc(), loadSummary()]).finally(() => setLoadingDoc(false));
  }, [loadDoc, loadSummary]);

  // Poll while OCR is running
  useEffect(() => {
    if (!doc || doc.status === 'completed' || doc.status === 'failed') {
      setPolling(false); return;
    }
    setPolling(true);
    const interval = setInterval(async () => {
      const updated = await loadDoc();
      if (updated?.status === 'completed' || updated?.status === 'failed') {
        setPolling(false);
        clearInterval(interval);
        if (updated.status === 'completed') toast.success('OCR complete!');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [doc?.status, loadDoc]);

  const handleGenerateSummary = async () => {
    if (doc?.status !== 'completed') {
      toast.error('OCR must complete before generating a summary.'); return;
    }
    setSummaryLoading(true);
    try {
      const res = await generateSummary(id);
      setSummary(res.data.summary);
      toast.success('Summary generated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate summary.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleDownload = async (format) => {
    try {
      const res = await downloadSummary(id, format);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.title || 'summary'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed.');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc?.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteDocument(id);
      toast.success('Document deleted.');
      navigate('/documents');
    } catch {
      toast.error('Failed to delete document.');
      setDeleting(false);
    }
  };

  const copyText = () => {
    if (!doc?.raw_text) return;
    navigator.clipboard.writeText(doc.raw_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loadingDoc) {
    return (
      <AppShell>
        <Topbar title="Document" />
        <div className="page empty-state"><div className="spinner spinner-lg" /></div>
      </AppShell>
    );
  }

  if (!doc) {
    return (
      <AppShell>
        <Topbar title="Document" />
        <div className="page empty-state">
          <FileText />
          <h3>Document not found</h3>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/documents')}>
            Back to Documents
          </button>
        </div>
      </AppShell>
    );
  }

  const { cls, label } = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;

  return (
    <AppShell>
      <Topbar
        title={doc.title}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/documents')}>
              <ArrowLeft size={14} /> Back
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={deleting}
              id="delete-doc-btn"
            >
              <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      />
      <div className="page">
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: summary ? '1fr 1fr' : '1fr' }}>
          {/* ── Left: Document Info + OCR Text ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Meta card */}
            <div className="card card-body">
              <div className="flex items-center justify-between mb-4">
                <span className={`badge ${cls}`}>
                  {polling && <span className="badge-dot" />}
                  {label}
                </span>
                {polling && (
                  <span className="text-muted flex items-center gap-2" style={{ fontSize: 12 }}>
                    <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    OCR running…
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <Row label="Uploaded" value={formatDistanceToNow(doc.created_at)} />
                {doc.file_type && <Row label="Type" value={doc.file_type} />}
                {doc.file_size && <Row label="Size" value={`${(doc.file_size / 1024).toFixed(1)} KB`} />}
              </div>
            </div>

            {/* OCR Text */}
            {doc.raw_text && (
              <div className="card card-body">
                <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                  <span className="summary-label" style={{ margin: 0 }}>Extracted Text</span>
                  <button className="btn btn-ghost btn-sm" onClick={copyText} id="copy-text-btn">
                    {copied ? <CheckCircle size={13} color="var(--success)" /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="ocr-text">{doc.raw_text}</pre>
              </div>
            )}

            {/* Generate button */}
            {!summary && (
              <button
                id="generate-summary-btn"
                className="btn btn-primary"
                onClick={handleGenerateSummary}
                disabled={summaryLoading || doc.status !== 'completed'}
              >
                {summaryLoading ? (
                  <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Generating with Gemini…</>
                ) : (
                  <><Sparkles size={15} /> Generate AI Summary</>
                )}
              </button>
            )}
          </div>

          {/* ── Right: Summary Panel ── */}
          {summary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="summary-panel">
                <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Sparkles size={15} color="var(--accent)" /> AI Summary
                  </span>
                  <span className={`badge ${
                    summary.sentiment === 'positive' ? 'badge-success' :
                    summary.sentiment === 'negative' ? 'badge-danger' : 'badge-accent'
                  }`}>
                    {summary.sentiment}
                  </span>
                </div>

                <div className="summary-section">
                  <div className="summary-label">Summary</div>
                  <p className="summary-text">{summary.summary_text}</p>
                </div>

                {summary.key_points?.length > 0 && (
                  <div className="summary-section">
                    <div className="summary-label">Key Points</div>
                    <ul className="key-points-list">
                      {summary.key_points.map((pt, i) => (
                        <li key={i}>
                          <span className="key-point-bullet" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="badge badge-muted">{summary.word_count} words</span>
                </div>
              </div>

              {/* Downloads */}
              <div className="download-row">
                <button className="btn btn-secondary btn-sm" onClick={() => handleDownload('txt')} id="download-txt-btn">
                  <Download size={13} /> Download .txt
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleDownload('json')} id="download-json-btn">
                  <Download size={13} /> Download .json
                </button>
              </div>

              {/* Regenerate */}
              <button
                id="regenerate-summary-btn"
                className="btn btn-ghost btn-sm"
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
              >
                <RefreshCw size={13} /> Regenerate Summary
              </button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between" style={{ gap: 12 }}>
      <span className="text-muted" style={{ fontSize: 12, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
