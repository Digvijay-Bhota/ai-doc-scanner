import Sidebar from './Sidebar';

export default function AppShell({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  );
}
