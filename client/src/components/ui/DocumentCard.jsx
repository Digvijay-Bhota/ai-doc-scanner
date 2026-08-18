import { useEffect, useState } from 'react';
import { FileText, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from '../../utils/date';
import { getDocumentFile } from '../../services/api';

const STATUS_MAP = {
  pending:    { label: 'Pending',     cls: 'badge-muted',   Icon: Clock        },
  processing: { label: 'Processing',  cls: 'badge-warning', Icon: Loader       },
  completed:  { label: 'OCR Done',    cls: 'badge-success', Icon: CheckCircle  },
  failed:     { label: 'Failed',      cls: 'badge-danger',  Icon: AlertCircle  },
};

/**
 * Fetches the uploaded file through the authenticated /api/documents/:id/file
 * endpoint and returns a blob object URL suitable for use as an <img src>.
 * Returns null if the document is not an image or if the fetch fails.
 */
function useDocumentThumbnail(doc) {
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    // Only attempt for image-type documents that have a stored file path
    if (!doc?.file_path || doc.file_type !== 'image') return;

    let url;
    getDocumentFile(doc.id)
      .then((res) => {
        url = URL.createObjectURL(res.data);
        setObjectUrl(url);
      })
      .catch(() => {
        // Silently fall back to the icon — same UX as before
        setObjectUrl(null);
      });

    // Revoke the object URL when the component unmounts or doc changes
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc?.id, doc?.file_path, doc?.file_type]);

  return objectUrl;
}

export default function DocumentCard({ doc }) {
  const navigate = useNavigate();
  const { label, cls, Icon } = STATUS_MAP[doc.status] || STATUS_MAP.pending;
  const isProcessing = doc.status === 'processing';
  const thumbnailUrl = useDocumentThumbnail(doc);

  return (
    <div className="card doc-card" onClick={() => navigate(`/documents/${doc.id}`)}>
      {/* Thumbnail */}
      <div className="doc-thumbnail">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={doc.title}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <FileText className="doc-thumbnail-icon" />
        )}
      </div>

      {/* Body */}
      <div className="doc-card-body">
        <div className="doc-card-title" title={doc.title}>{doc.title}</div>
        <div className="doc-card-meta">
          {formatDistanceToNow(doc.created_at)}
        </div>
        <span className={`badge ${cls}`}>
          {isProcessing && <span className="badge-dot" />}
          <Icon size={10} />
          {label}
        </span>
      </div>
    </div>
  );
}
