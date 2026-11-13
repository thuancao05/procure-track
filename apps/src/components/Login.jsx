import { useState } from 'react';
import api from '../services/api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      onLogin(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Không thể kết nối tới server.');
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-3 sm:py-2 bg-white border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-svh bg-slate-50 flex items-start sm:items-center justify-center sm:px-6 font-sans text-slate-800 text-left">
      <div className="w-full max-w-md bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200">
        <div className="bg-gradient-to-b from-blue-50 to-white px-4 pt-6 pb-2 sm:px-8 sm:pt-8 sm:rounded-t-2xl">
          <p className="text-sm font-semibold text-blue-600">Ghi Nhận Đơn Hàng</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 mt-1">Đăng nhập</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Đăng nhập để ghi nhận đơn nhập hàng</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Mật khẩu</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-medium text-base py-3.5 sm:py-3 px-4 rounded-xl shadow-sm transition duration-150 disabled:bg-blue-200"
          >
            {loading ? '⏳ Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
