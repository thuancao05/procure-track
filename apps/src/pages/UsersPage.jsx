import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from '../components/Modal';
import {
  apiError,
  dangerButtonClass,
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  selectClass,
  smallButtonClass,
} from '../ui';

const MIN_PASSWORD_LENGTH = 8;
const ROLE_LABELS = { admin: 'Quản trị', staff: 'Nhân viên' };

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : 'Chưa đăng nhập';

function RoleSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={selectClass}>
      <option value="staff">{ROLE_LABELS.staff} — chỉ nhập hàng</option>
      <option value="admin">{ROLE_LABELS.admin} — quản lý danh mục & người dùng</option>
    </select>
  );
}

export default function UsersPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');

  // Modal: { mode: 'create' } | { mode: 'edit', user } | { mode: 'delete', user }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', role: 'staff' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(
    () =>
      api
        .get('/admin/users')
        .then(({ data }) => {
          setUsers(data.users);
          setLoadError('');
        })
        .catch((error) => setLoadError(apiError(error, 'Không thể tải danh sách người dùng.')))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter((u) => u.email?.toLowerCase().includes(q)) : users;
  }, [users, search]);

  const closeModal = useCallback(() => setModal(null), []);

  const openCreate = () => {
    setForm({ email: '', password: '', role: 'staff' });
    setFormError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (user) => {
    setForm({ email: user.email, password: '', role: user.role });
    setFormError('');
    setModal({ mode: 'edit', user });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError('');

    if ((modal.mode === 'create' || form.password) && form.password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`);
      return;
    }

    setSaving(true);
    try {
      if (modal.mode === 'create') {
        await api.post('/admin/users', form);
      } else {
        const payload = {};
        if (form.role !== modal.user.role) payload.role = form.role;
        if (form.password) payload.password = form.password;
        if (Object.keys(payload).length === 0) {
          setModal(null);
          return;
        }
        await api.patch(`/admin/users/${modal.user.id}`, payload);
      }
      setModal(null);
      await load();
    } catch (error) {
      setFormError(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setActionError('');
    try {
      await api.delete(`/admin/users/${modal.user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== modal.user.id));
    } catch (error) {
      setActionError(apiError(error));
    } finally {
      setSaving(false);
      setModal(null);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint32Array(12));
    const pwd = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    setForm((f) => ({ ...f, password: pwd }));
  };

  const adminCount = users.filter((u) => u.role === 'admin').length;

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200">
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">👤 Người dùng</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {loading ? 'Đang tải...' : `${users.length} tài khoản • ${adminCount} quản trị`}
          </p>
        </div>
        <button type="button" onClick={openCreate} className={`${primaryButtonClass} shrink-0`}>
          <span className="text-lg leading-none">+</span> Thêm
        </button>
      </div>

      <div className="px-4 sm:px-6 pb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Tìm theo email..."
          className={inputClass}
        />
      </div>

      {(loadError || actionError) && (
        <div className="px-4 sm:px-6 pb-3">
          <p className={errorBoxClass}>{loadError || actionError}</p>
        </div>
      )}

      <ul className="border-t border-slate-100 divide-y divide-slate-100">
        {loading && <li className="px-4 sm:px-6 py-8 text-center text-sm text-slate-500">⏳ Đang tải...</li>}

        {!loading && filtered.length === 0 && !loadError && (
          <li className="px-4 sm:px-6 py-8 text-center text-sm text-slate-500">Không tìm thấy người dùng.</li>
        )}

        {!loading &&
          filtered.map((user) => {
            const isSelf = user.id === currentUser.id;
            return (
              <li key={user.id} className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium text-slate-800 truncate">
                    {user.email}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(bạn)</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">Đăng nhập gần nhất: {formatDate(user.lastSignInAt)}</p>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-md ${
                      user.role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    className={`${smallButtonClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => setModal({ mode: 'delete', user })}
                    disabled={isSelf}
                    title={isSelf ? 'Không thể xóa tài khoản của chính bạn' : undefined}
                    className={`${smallButtonClass} border-red-200 text-red-600 hover:bg-red-50`}
                  >
                    Xóa
                  </button>
                </div>
              </li>
            );
          })}
      </ul>

      {(modal?.mode === 'create' || modal?.mode === 'edit') && (
        <Modal title={modal.mode === 'create' ? 'Thêm người dùng' : 'Sửa người dùng'} onClose={closeModal}>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="user-email">Email</label>
              <input
                id="user-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={modal.mode === 'edit'}
                required
                autoFocus={modal.mode === 'create'}
                className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="user-password">
                {modal.mode === 'create' ? 'Mật khẩu' : 'Mật khẩu mới (để trống nếu không đổi)'}
              </label>
              <div className="flex gap-2">
                <input
                  id="user-password"
                  type="text"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={modal.mode === 'create'}
                  minLength={MIN_PASSWORD_LENGTH}
                  placeholder={`Tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`}
                  className={`${inputClass} font-mono`}
                />
                <button type="button" onClick={generatePassword} className={`${secondaryButtonClass} shrink-0`}>
                  Tạo
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Gửi mật khẩu này cho người dùng qua kênh an toàn.</p>
            </div>

            <div>
              <label className={labelClass}>Vai trò</label>
              <RoleSelect
                value={form.role}
                onChange={(role) => setForm({ ...form, role })}
                disabled={modal.mode === 'edit' && modal.user.id === currentUser.id}
              />
              {modal.mode === 'edit' && modal.user.id === currentUser.id && (
                <p className="text-xs text-slate-400 mt-1">Bạn không thể tự đổi vai trò của chính mình.</p>
              )}
            </div>

            {formError && <p className={errorBoxClass}>{formError}</p>}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" onClick={closeModal} className={secondaryButtonClass}>Hủy</button>
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? '⏳ Đang lưu...' : modal.mode === 'create' ? 'Tạo tài khoản' : 'Lưu'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.mode === 'delete' && (
        <Modal title="Xóa người dùng?" onClose={closeModal}>
          <p className="text-sm text-slate-600">
            Xóa tài khoản <b className="text-slate-800">{modal.user.email}</b>? Người này sẽ không thể đăng nhập nữa.
            Thao tác này không thể hoàn tác.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4">
            <button type="button" onClick={closeModal} className={secondaryButtonClass}>Hủy</button>
            <button type="button" onClick={handleDelete} disabled={saving} className={dangerButtonClass}>
              {saving ? '⏳ Đang xóa...' : 'Xóa'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
