import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Upload, LogOut, ScanLine, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';


const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FileText,        label: 'Documents'  },
  { to: '/upload',    icon: Upload,           label: 'Upload'     },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <ScanLine size={17} />
        </div>
        <span className="sidebar-logo-text">
          Docu<span>Mind</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Menu</div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: theme toggle + user */}
      <div className="sidebar-bottom">
        {/* Theme toggle */}
        <button
          id="theme-toggle-btn"
          className="theme-toggle"
          onClick={toggle}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDark ? <Moon size={14} /> : <Sun size={14} />}
            {isDark ? 'Dark mode' : 'Light mode'}
          </span>
          <span className="theme-toggle-track">
            <span className="theme-toggle-thumb" />
          </span>
        </button>

        {/* User / logout */}
        <div className="user-pill" onClick={handleLogout} title="Logout">
          <div className="avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.name || 'User'}</div>
            <div className="user-email">{user?.email || ''}</div>
          </div>
          <LogOut size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </div>
    </aside>
  );
}
