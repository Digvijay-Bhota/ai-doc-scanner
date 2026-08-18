import { useEffect, useState, useCallback } from 'react';
import { FileText, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import Topbar from '../components/layout/Topbar';
import DocumentCard from '../components/ui/DocumentCard';
import { getDocuments, searchDocuments } from '../services/api';

const LIMIT = 12;

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [docs, setDocs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [query, setQuery]   = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const req = query.trim()
      ? searchDocuments(query.trim())
      : getDocuments(page, LIMIT);
    req
      .then((res) => {
        setDocs(res.data.documents || []);
        setTotal(res.data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query, page]);

  useEffect(() => {
    const t = setTimeout(load, query ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Reset page when query changes
  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <AppShell>
      <Topbar
        title="Documents"
        searchValue={query}
        onSearchChange={setQuery}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/upload')}>
            <Upload size={13} /> Upload
          </button>
        }
      />
      <div className="page">
        {/* Count */}
        {!loading && (
          <p className="text-muted" style={{ marginBottom: 16 }}>
            {query ? `${docs.length} result${docs.length !== 1 ? 's' : ''} for "${query}"` : `${total} document${total !== 1 ? 's' : ''}`}
          </p>
        )}

        {/* Grid */}
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : docs.length === 0 ? (
          <div className="empty-state">
            <FileText />
            <h3>{query ? 'No results found' : 'No documents yet'}</h3>
            <p>{query ? 'Try a different search term.' : 'Upload your first document to get started.'}</p>
            {!query && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/upload')}>
                <Upload size={15} /> Upload Document
              </button>
            )}
          </div>
        ) : (
          <div className="doc-grid">
            {docs.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
          </div>
        )}

        {/* Pagination */}
        {!query && totalPages > 1 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                className={`page-btn${page === i + 1 ? ' active' : ''}`}
                onClick={() => setPage(i + 1)}
              >{i + 1}</button>
            ))}
            <button
              className="page-btn"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >›</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
