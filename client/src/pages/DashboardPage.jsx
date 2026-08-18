import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, Clock, Upload } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Topbar from '../components/layout/Topbar';
import DocumentCard from '../components/ui/DocumentCard';
import { getDocuments } from '../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [docs, setDocs]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocuments(1, 6)
      .then((res) => setDocs(res.data.documents || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total     = docs.length;
  const completed = docs.filter((d) => d.status === 'completed').length;
  const pending   = docs.filter((d) => ['pending','processing'].includes(d.status)).length;

  return (
    <AppShell>
      <Topbar title="Dashboard" />
      <div className="page">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total Documents</div>
            <div className="stat-value accent">{total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">OCR Complete</div>
            <div className="stat-value">{completed}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Processing</div>
            <div className="stat-value">{pending}</div>
          </div>
        </div>

        {/* Recent Docs */}
        <div className="section-header">
          <span className="section-title">Recent Documents</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/documents')}>
            View all →
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="spinner spinner-lg" />
          </div>
        ) : docs.length === 0 ? (
          <div className="empty-state">
            <FileText />
            <h3>No documents yet</h3>
            <p>Upload your first document to get started.</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => navigate('/upload')}
            >
              <Upload size={15} /> Upload Document
            </button>
          </div>
        ) : (
          <div className="doc-grid">
            {docs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
          </div>
        )}

        {/* Quick Actions */}
        {docs.length > 0 && (
          <div className="flex gap-3 mt-4" style={{ marginTop: 28 }}>
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>
              <Upload size={15} /> Upload Document
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/documents')}>
              <FileText size={15} /> All Documents
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
