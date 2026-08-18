import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanLine, Eye, EyeOff, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]     = useState({ email: '', password: '' });
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon"><ScanLine size={20} /></div>
          <span className="auth-logo-text">Docu<span>Mind</span></span>
        </div>

        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-sub">Sign in to your account to continue.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                className="form-input"
                type={show ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading ? <><Loader size={15} className="spinner" style={{ border: 'none', width: 15, height: 15 }} /> Signing in…</> : 'Sign in'}
          </button>
        </form>

        <p className="auth-divider">
          Don&apos;t have an account?{' '}
          <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
