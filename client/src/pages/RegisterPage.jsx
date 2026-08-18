import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanLine, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]     = useState({ name: '', email: '', password: '', confirm: '' });
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error('Please fill in all fields.'); return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters.'); return;
    }
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match.'); return;
    }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success('Account created! Welcome aboard.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><ScanLine size={20} /></div>
          <span className="auth-logo-text">Docu<span>Mind</span></span>
        </div>

        <h2 className="auth-title">Create your account</h2>
        <p className="auth-sub">Start scanning and summarizing documents with AI.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              className="form-input"
              type="text"
              name="name"
              placeholder="John Doe"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className="form-input"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="reg-password"
                className="form-input"
                type={show ? 'text' : 'password'}
                name="password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={handleChange}
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

          <div className="form-group">
            <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
            <input
              id="reg-confirm"
              className="form-input"
              type="password"
              name="confirm"
              placeholder="Repeat password"
              value={form.confirm}
              onChange={handleChange}
              required
            />
          </div>

          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-divider">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
