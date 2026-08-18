import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

// Redirect to login on 401
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────
export const register = (data) => API.post('/auth/register', data);
export const login    = (data) => API.post('/auth/login', data);
export const logout   = ()     => API.post('/auth/logout');
export const getMe    = ()     => API.get('/auth/me');

// ── Documents ────────────────────────────────────────────────
export const uploadDocument = (formData, onProgress) =>
  API.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
  });

export const getDocuments   = (page = 1, limit = 12) =>
  API.get(`/documents?page=${page}&limit=${limit}`);

export const getDocument    = (id) => API.get(`/documents/${id}`);
export const getDocumentFile = (id) => API.get(`/documents/${id}/file`, { responseType: 'blob' });
export const updateDocument = (id, data) => API.put(`/documents/${id}`, data);
export const deleteDocument = (id) => API.delete(`/documents/${id}`);
export const searchDocuments = (q) => API.get(`/documents/search?q=${encodeURIComponent(q)}`);

// ── Summaries ────────────────────────────────────────────────
export const generateSummary = (docId) => API.post(`/summaries/${docId}`);
export const getSummary      = (docId) => API.get(`/summaries/${docId}`);
export const downloadSummary = (docId, format = 'txt') =>
  API.get(`/summaries/${docId}/download?format=${format}`, { responseType: 'blob' });

export default API;
