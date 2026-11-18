import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useNotification } from '../components/NotificationProvider';

export default function GoogleSettingsPage() {
  const { showConfirm } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/google/status');
      setStatus(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error ?? 'Không thể tải trạng thái kết nối Google.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const result = searchParams.get('google');
    if (result === 'connected') setNotice('Đã kết nối Google thành công.');
    if (result === 'error') setError(searchParams.get('message') || 'Kết nối Google thất bại.');
    if (result) setSearchParams({}, { replace: true });
    loadStatus();
  }, [loadStatus, searchParams, setSearchParams]);

  const connectGoogle = async () => {
    setBusy('connect');
    setError('');
    try {
      const { data } = await api.get('/admin/google/connect');
      window.location.assign(data.url);
    } catch (requestError) {
      setError(requestError.response?.data?.error ?? 'Không thể bắt đầu kết nối Google.');
      setBusy('');
    }
  };

  const disconnectGoogle = async () => {
    const confirmed = await showConfirm('Ngắt kết nối Google? Các chức năng Drive/Sheets sẽ dừng cho đến khi kết nối lại.', {
      title: 'Ngắt kết nối Google?',
      confirmText: 'Ngắt kết nối',
      variant: 'warning',
    });
    if (!confirmed) return;
    setBusy('disconnect');
    setError('');
    try {
      await api.post('/admin/google/disconnect');
      setNotice('Đã ngắt kết nối Google.');
      await loadStatus();
    } catch (requestError) {
      setError(requestError.response?.data?.error ?? 'Không thể ngắt kết nối Google.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200 p-4 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Kết nối Google</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý quyền Drive và Google Sheets cho hệ thống.</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status?.connected ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
          {loading ? 'Đang kiểm tra...' : status?.connected ? 'Đã kết nối' : 'Chưa kết nối'}
        </span>
      </div>

      {notice && <p className="mt-5 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{notice}</p>}
      {error && <p className="mt-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="border border-slate-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Tài khoản Google</p>
          <p className="mt-2 font-medium text-slate-800">{status?.googleAccount?.emailAddress || 'Chưa xác định'}</p>
          <p className="text-xs text-slate-500 mt-1">Nguồn: {status?.source === 'oauth' ? 'OAuth lưu an toàn' : status?.source === 'env' ? 'Biến môi trường cũ' : 'Chưa có'}</p>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Quyền</p>
          <p className="mt-2 text-sm text-slate-700">Drive: {status?.driveAccess ? '✓ Có quyền' : '— Chưa kiểm tra'}</p>
          <p className="text-sm text-slate-700">Sheets: {status?.sheetsAccess ? '✓ Có quyền' : '— Chưa kiểm tra'}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={connectGoogle} disabled={busy !== ''} className="px-4 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:bg-blue-200">
          {busy === 'connect' ? 'Đang chuyển sang Google...' : status?.connected ? 'Kết nối lại Google' : 'Kết nối Google'}
        </button>
        {status?.connected && (
          <button type="button" onClick={disconnectGoogle} disabled={busy !== ''} className="px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 disabled:opacity-50">
            {busy === 'disconnect' ? 'Đang ngắt...' : 'Ngắt kết nối'}
          </button>
        )}
        <button type="button" onClick={loadStatus} disabled={loading || busy !== ''} className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50">Kiểm tra lại</button>
      </div>

      <div className="mt-6 text-xs text-slate-500 leading-relaxed">
        <p>Hệ thống yêu cầu quyền Google Drive và Google Sheets để liệt kê folder, upload chứng từ và ghi nhật ký đơn hàng.</p>
        <p className="mt-1">Refresh token được mã hóa và chỉ lưu ở backend; frontend không nhận hoặc hiển thị token.</p>
      </div>
    </div>
  );
}
