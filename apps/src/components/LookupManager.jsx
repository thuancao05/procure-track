import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Modal from './Modal';
import {
  apiError,
  dangerButtonClass,
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallButtonClass,
} from '../ui';

/**
 * Trang quản lý danh mục dùng chung (Hàng hóa / Kênh mua / Phương thức thanh toán).
 * Gọi backend: /api/admin/lookups/:resource
 */
export default function LookupManager({ config }) {
  const { resource, title, itemLabel, fields, emptyItem, primary, secondary } = config;
  const endpoint = `/admin/lookups/${resource}`;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null); // { id?: number, values: {...} }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleting, setDeleting] = useState(null); // item
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(
    () =>
      api
        .get(endpoint)
        .then(({ data }) => {
          setItems(data.items);
          setLoadError('');
        })
        .catch((error) => setLoadError(apiError(error, 'Không thể tải dữ liệu.')))
        .finally(() => setLoading(false)),
    [endpoint]
  );

  // Mỗi danh mục được mount với `key` riêng (App.jsx) nên chỉ cần tải 1 lần
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      fields.some((f) => String(item[f.key] ?? '').toLowerCase().includes(q))
    );
  }, [items, search, fields]);

  const openCreate = () => {
    setFormError('');
    setEditing({ values: { ...emptyItem } });
  };

  const openEdit = (item) => {
    setFormError('');
    const values = { isActive: item.isActive };
    for (const f of fields) values[f.key] = item[f.key] ?? '';
    setEditing({ id: item.id, values });
  };

  const closeEditor = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  const setValue = (key, value) =>
    setEditing((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    const payload = { isActive: editing.values.isActive };
    for (const f of fields) {
      const v = editing.values[f.key];
      payload[f.key] = f.type === 'number' ? Number(v || 0) : String(v ?? '');
    }

    try {
      if (editing.id) {
        await api.patch(`${endpoint}/${editing.id}`, payload);
      } else {
        await api.post(endpoint, payload);
      }
      setEditing(null);
      await load();
    } catch (error) {
      setFormError(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    setBusyId(item.id);
    setActionError('');
    try {
      const { data } = await api.patch(`${endpoint}/${item.id}`, { isActive: !item.isActive });
      setItems((prev) => prev.map((it) => (it.id === item.id ? data.item : it)));
    } catch (error) {
      setActionError(apiError(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    const item = deleting;
    setBusyId(item.id);
    setActionError('');
    try {
      await api.delete(`${endpoint}/${item.id}`);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setDeleting(null);
    } catch (error) {
      setActionError(apiError(error));
      setDeleting(null);
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = items.filter((it) => it.isActive).length;

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200">
      {/* Tiêu đề + nút thêm */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">{title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {loading ? 'Đang tải...' : `${items.length} mục • ${activeCount} đang dùng`}
          </p>
        </div>
        <button type="button" onClick={openCreate} className={`${primaryButtonClass} shrink-0`}>
          <span className="text-lg leading-none">+</span> Thêm
        </button>
      </div>

      {/* Tìm kiếm */}
      <div className="px-4 sm:px-6 pb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`🔍 Tìm ${itemLabel}...`}
          className={inputClass}
        />
      </div>

      {(loadError || actionError) && (
        <div className="px-4 sm:px-6 pb-3">
          <p className={errorBoxClass}>{loadError || actionError}</p>
        </div>
      )}

      {/* Danh sách */}
      <ul className="border-t border-slate-100 divide-y divide-slate-100">
        {loading && <li className="px-4 sm:px-6 py-8 text-center text-sm text-slate-500">⏳ Đang tải...</li>}

        {!loading && filtered.length === 0 && !loadError && (
          <li className="px-4 sm:px-6 py-8 text-center text-sm text-slate-500">
            {search ? 'Không tìm thấy kết quả phù hợp.' : `Chưa có ${itemLabel} nào. Bấm "Thêm" để tạo mới.`}
          </li>
        )}

        {!loading &&
          filtered.map((item) => (
            <li key={item.id} className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 basis-48">
                <p className={`font-medium truncate ${item.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                  {primary(item)}
                </p>
                {secondary && <p className="text-xs text-slate-500 truncate">{secondary(item)}</p>}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => toggleActive(item)}
                  disabled={busyId === item.id}
                  className={`${smallButtonClass} ${
                    item.isActive
                      ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                  title={item.isActive ? 'Bấm để ngưng dùng' : 'Bấm để dùng lại'}
                >
                  {item.isActive ? '● Đang dùng' : '○ Ngưng'}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className={`${smallButtonClass} border-slate-200 text-slate-700 hover:bg-slate-50`}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(item)}
                  disabled={busyId === item.id}
                  className={`${smallButtonClass} border-red-200 text-red-600 hover:bg-red-50`}
                >
                  Xóa
                </button>
              </div>
            </li>
          ))}
      </ul>

      {/* Form thêm / sửa */}
      {editing && (
        <Modal title={editing.id ? `Sửa ${itemLabel}` : `Thêm ${itemLabel}`} onClose={closeEditor}>
          <form onSubmit={handleSave} className="space-y-4">
            {fields.map((f, index) => (
              <div key={f.key}>
                <label className={labelClass} htmlFor={`field-${f.key}`}>{f.label}</label>
                <input
                  id={`field-${f.key}`}
                  type={f.type === 'number' ? 'number' : 'text'}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  autoCapitalize={f.autoCapitalize}
                  autoFocus={index === 0}
                  value={editing.values[f.key]}
                  onChange={(e) => setValue(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  required={f.required}
                  className={inputClass}
                />
                {f.hint && <p className="text-xs text-slate-400 mt-1">{f.hint}</p>}
              </div>
            ))}

            <label className="flex items-center gap-3 py-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editing.values.isActive}
                onChange={(e) => setValue('isActive', e.target.checked)}
                className="w-5 h-5 accent-blue-600"
              />
              <span className="text-sm text-slate-700">Đang dùng (hiển thị trong form nhập hàng)</span>
            </label>

            {formError && <p className={errorBoxClass}>{formError}</p>}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button type="button" onClick={closeEditor} className={secondaryButtonClass}>Hủy</button>
              <button type="submit" disabled={saving} className={primaryButtonClass}>
                {saving ? '⏳ Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Xác nhận xóa */}
      {deleting && (
        <Modal title={`Xóa ${itemLabel}?`} onClose={closeDelete}>
          <p className="text-sm text-slate-600">
            Xóa <b className="text-slate-800">{primary(deleting)}</b>? Thao tác này không thể hoàn tác.
            Nếu chỉ muốn ẩn khỏi form nhập hàng, hãy chọn <b>Ngưng</b> thay vì xóa.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4">
            <button type="button" onClick={closeDelete} className={secondaryButtonClass}>Hủy</button>
            <button type="button" onClick={handleDelete} disabled={busyId === deleting.id} className={dangerButtonClass}>
              {busyId === deleting.id ? '⏳ Đang xóa...' : 'Xóa'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
