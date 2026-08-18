import { Search } from 'lucide-react';

export default function Topbar({ title, searchValue, onSearchChange, actions }) {
  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>

      {onSearchChange && (
        <div className="search-box">
          <Search />
          <input
            id="topbar-search"
            className="search-input"
            type="search"
            placeholder="Search documents…"
            value={searchValue || ''}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      <div style={{ flex: 1 }} />

      {actions && <div className="flex gap-2">{actions}</div>}
    </header>
  );
}
