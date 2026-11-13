import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { isSupabaseConfigured, supabase } from '../services/supabase';

function hashError() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const error = hash.get('error_description') || hash.get('error');
  return error ? decodeURIComponent(error.replace(/\+/g, ' ')) : '';
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Frontend chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY.');
      return undefined;
    }

    let active = true;
    const prepare = async () => {
      const linkError = hashError();
      if (linkError) {
        setError(linkError);
        return;
      }
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError || !data.session) {
        setError('Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu email mới.');
        return;
      }
      setReady(true);
    };
    prepare();
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) return setError('Mật khẩu phải có ít nhất 8 ký tự.');
    if (password !== confirmPassword) return setError('Mật khẩu xác nhận không khớp.');

    setSaving(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (data.user?.email) await api.post('/auth/login', { email: data.user.email, password });
      await supabase.auth.signOut();
      setSuccess(true);
      window.setTimeout(() => navigate('/', { replace: true }), 800);
    } catch (submitError) {
      setError(submitError.message || 'Không thể cập nhật mật khẩu.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-3 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div className="min-h-svh bg-slate-50 flex items-center justify-center px-4 font-sans text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Đặt lại mật khẩu</h1>
        <p className="text-sm text-slate-500 mt-2">Nhập mật khẩu mới cho tài khoản của bạn.</p>
        {success ? (
          <p className="mt-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Đã đổi mật khẩu. Đang chuyển vào ứng dụng...</p>
        ) : !ready ? (
          <p className="mt-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error || 'Đang kiểm tra link đặt lại mật khẩu...'}</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input type="password" autoComplete="new-password" placeholder="Mật khẩu mới" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} required />
            <input type="password" autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={saving} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-xl disabled:bg-blue-200">{saving ? 'Đang lưu...' : 'Lưu mật khẩu mới'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
