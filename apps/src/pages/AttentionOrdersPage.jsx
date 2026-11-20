import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Pagination from '../components/Pagination';
import { apiError, errorBoxClass, primaryButtonClass, selectClass } from '../ui';
import { useNotification } from '../components/NotificationProvider';

const formatDate = (value) => {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '—';
};

const sortFoldersAsTree = (folders) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map();
  folders.forEach((folder) => {
    const parentId = folder.parents?.find((id) => byId.has(id));
    const list = children.get(parentId) ?? [];
    list.push(folder);
    children.set(parentId, list);
  });
  children.forEach((list) => list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi', { numeric: true })));
  const result = [];
  const visited = new Set();
  const addBranch = (folder, depth) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    result.push({ ...folder, depth });
    (children.get(folder.id) ?? []).forEach((child) => addBranch(child, depth + 1));
  };
  (children.get(undefined) ?? []).forEach((folder) => addBranch(folder, 0));
  folders.forEach((folder) => addBranch(folder, 0));
  return { result, children };
};

export default function AttentionOrdersPage() {
  const { showAlert, showConfirm } = useNotification();
  const [folders, setFolders] = useState([]);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [defaultSpreadsheet, setDefaultSpreadsheet] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/drive/folders'), api.get('/preferences/drive')])
      .then(([folderResponse, preferenceResponse]) => {
        if (!active) return;
        const folderData = folderResponse.data;
        const preferences = preferenceResponse.data.preferences ?? {};
        const nextFolders = folderData.folders ?? [];
        const nextFolder = preferences.defaultFolderId || folderData.defaultFolderId || '';
        const nextSpreadsheet = preferences.defaultSpreadsheetId || folderData.defaultSpreadsheetId || '';
        setFolders(nextFolders);
        setSelectedFolder(nextFolder);
        setDefaultSpreadsheet(nextSpreadsheet);
        setSelectedSpreadsheet(nextSpreadsheet);
      })
      .catch((requestError) => { if (active) setError(apiError(requestError, 'Không thể tải danh sách folder và sổ nhật ký.')); })
      .finally(() => { if (active) setLoadingSources(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedFolder) {
      setSpreadsheets([]);
      return undefined;
    }
    let active = true;
    setLoadingSheets(true);
    api.get('/drive/spreadsheets', { params: { folderId: selectedFolder } })
      .then(({ data }) => {
        if (!active) return;
        const nextSheets = data.spreadsheets ?? [];
        setSpreadsheets(nextSheets);
        setSelectedSpreadsheet((current) => {
          if (current && nextSheets.some((sheet) => sheet.id === current)) return current;
          if (nextSheets.some((sheet) => sheet.id === defaultSpreadsheet)) return defaultSpreadsheet;
          return nextSheets[0]?.id ?? '';
        });
      })
      .catch((requestError) => { if (active) setError(apiError(requestError, 'Không thể tải danh sách sổ nhật ký.')); })
      .finally(() => { if (active) setLoadingSheets(false); });
    return () => { active = false; };
  }, [defaultSpreadsheet, selectedFolder]);

  const load = useCallback(async () => {
    if (!selectedFolder || !selectedSpreadsheet) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/drive/attention', { params: { page, folderId: selectedFolder, spreadsheetId: selectedSpreadsheet } });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (requestError) {
      setError(apiError(requestError, 'Không thể đối chiếu sổ nhật ký và folder chứng từ.'));
    } finally {
      setLoading(false);
    }
  }, [page, selectedFolder, selectedSpreadsheet]);

  useEffect(() => { setPage(1); }, [selectedFolder, selectedSpreadsheet]);
  useEffect(() => { load(); }, [load]);

  const deleteItem = async (item) => {
    const isJournal = item.type === 'missing-folder';
    const confirmed = await showConfirm(
      isJournal
        ? `Xóa dòng nhật ký của đơn ${item.orderCode || '(chưa có mã)'}? Thao tác này không xóa folder.`
        : `Xóa folder chứng từ ${item.folderName}? Toàn bộ ảnh bên trong sẽ bị xóa.`,
      { title: isJournal ? 'Xóa nhật ký?' : 'Xóa folder?', confirmText: 'Xóa', variant: 'warning' },
    );
    if (!confirmed) return;
    const key = `${item.type}-${item.sheetTitle ?? item.folderId}-${item.rowNumber ?? ''}`;
    setDeleting(key);
    setError('');
    try {
      await api.delete('/drive/attention', {
        data: isJournal
          ? { action: 'delete-journal', spreadsheetId: selectedSpreadsheet, sheetTitle: item.sheetTitle, rowNumber: item.rowNumber }
          : { action: 'delete-folder', folderId: selectedFolder, targetFolderId: item.folderId },
      });
      if (items.length === 1 && page > 1) setPage((current) => current - 1);
      else await load();
      await showAlert(isJournal ? 'Đã xóa dòng nhật ký.' : 'Đã xóa folder và toàn bộ ảnh bên trong.', { variant: 'success' });
    } catch (requestError) {
      setError(apiError(requestError, 'Không thể xóa dữ liệu.'));
    } finally {
      setDeleting('');
    }
  };

  const folderTree = useMemo(() => sortFoldersAsTree(folders), [folders]);
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const foldersWithChildren = useMemo(() => new Set(folders.flatMap((folder) => (folder.parents ?? []).filter((parentId) => folderIds.has(parentId)))), [folderIds, folders]);
  const visibleFolders = useMemo(() => folderTree.result.filter((folder) => {
    let parentId = folder.parents?.find((id) => folderIds.has(id));
    while (parentId) {
      if (!expandedFolderIds.has(parentId)) return false;
      const parent = folders.find((item) => item.id === parentId);
      parentId = parent?.parents?.find((id) => folderIds.has(id));
    }
    return true;
  }), [expandedFolderIds, folderIds, folders, folderTree.result]);
  const selectedFolderName = folders.find((folder) => folder.id === selectedFolder)?.name ?? '';
  const journalUrl = selectedSpreadsheet ? `https://docs.google.com/spreadsheets/d/${selectedSpreadsheet}/edit` : '';

  useEffect(() => {
    if (!selectedFolder) return;
    const ancestors = [];
    let parentId = folders.find((folder) => folder.id === selectedFolder)?.parents?.find((id) => folderIds.has(id));
    while (parentId) {
      ancestors.push(parentId);
      const parent = folders.find((folder) => folder.id === parentId);
      parentId = parent?.parents?.find((id) => folderIds.has(id));
    }
    if (!ancestors.length) return;
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      ancestors.forEach((id) => next.add(id));
      return next.size === current.size ? current : next;
    });
  }, [folderIds, folders, selectedFolder]);

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200">
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">Đơn hàng cần lưu ý</h1>
            <p className="text-xs text-slate-500 mt-1">Đối chiếu sổ nhật ký và folder chứng từ trên Google Drive.</p>
          </div>
          <button type="button" onClick={load} disabled={loading || !selectedFolder || !selectedSpreadsheet} className={`${primaryButtonClass} shrink-0 disabled:opacity-50`}>{loading ? 'Đang kiểm tra...' : 'Kiểm tra lại'}</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Folder chứng từ</label>
            <button type="button" onClick={() => setFolderPickerOpen((open) => !open)} disabled={loadingSources || !visibleFolders.length} className={`${selectClass} mt-1 flex items-center justify-between text-left`}>
              <span className={selectedFolderName ? 'truncate text-slate-800' : 'text-slate-500'}>{loadingSources ? 'Đang tải folder...' : selectedFolderName || '-- Chọn folder chứng từ --'}</span>
              <span aria-hidden="true">{folderPickerOpen ? '▴' : '▾'}</span>
            </button>
            {folderPickerOpen && <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg">
              {visibleFolders.map((folder) => {
                const hasChildren = foldersWithChildren.has(folder.id);
                const expanded = expandedFolderIds.has(folder.id);
                return <div key={folder.id} className={`flex min-h-10 items-center gap-1 pr-2 hover:bg-blue-50 ${selectedFolder === folder.id ? 'bg-blue-100 text-blue-800' : 'text-slate-700'}`} style={{ paddingLeft: `${0.5 + folder.depth * 1.25}rem` }}>
                  {hasChildren ? <button type="button" onClick={() => setExpandedFolderIds((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })} className="h-8 w-8 shrink-0 rounded text-slate-500">{expanded ? '▾' : '▸'}</button> : <span className="h-8 w-8 shrink-0" />}
                  <button type="button" onClick={() => { setSelectedFolder(folder.id); setSelectedSpreadsheet(''); setFolderPickerOpen(false); }} className="flex min-w-0 flex-1 py-1.5 text-left text-sm"><span className="truncate">{folder.name}</span></button>
                </div>;
              })}
            </div>}
          </div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sổ nhật ký
            <select value={selectedSpreadsheet} onChange={(event) => { setSelectedSpreadsheet(event.target.value); setPage(1); }} className={`${selectClass} mt-1`} disabled={!selectedFolder || loadingSheets}>
              <option value="">{loadingSheets ? 'Đang tải sổ nhật ký...' : '-- Chọn sổ nhật ký --'}</option>
              {spreadsheets.map((spreadsheet) => <option key={spreadsheet.id} value={spreadsheet.id}>{spreadsheet.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="px-4 sm:px-6 pb-3"><p className={errorBoxClass}>{error}</p></div>}
      {!error && !loading && selectedFolder && selectedSpreadsheet && total === 0 && <p className="mx-4 sm:mx-6 mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-700">Không có đơn hàng nào thiếu folder chứng từ hoặc thiếu nhật ký.</p>}

      <div className="overflow-x-auto border-t border-slate-100"><table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 sm:px-6 py-3">Ngày</th><th className="px-4 py-3">Mã đơn hàng</th><th className="px-4 py-3">Mã vận đơn</th><th className="px-4 py-3">Shop</th><th className="px-4 py-3">Cảnh báo</th><th className="px-4 py-3">Thao tác</th><th className="px-4 sm:px-6 py-3">Nguồn</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {loading && <tr><td colSpan="7" className="px-4 sm:px-6 py-8 text-center text-slate-500">Đang đối chiếu dữ liệu...</td></tr>}
          {!loading && !error && items.map((item, index) => { const key = `${item.type}-${item.sheetTitle ?? item.folderId}-${item.rowNumber ?? ''}`; return <tr key={`${key}-${index}`} className="align-top"><td className="px-4 sm:px-6 py-3 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td><td className="px-4 py-3 font-medium text-slate-800">{item.orderCode || '—'}</td><td className="px-4 py-3 text-slate-700">{item.shippingCode || '—'}</td><td className="px-4 py-3 text-slate-700">{item.shop || '—'}</td><td className="px-4 py-3"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${item.type === 'missing-folder' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{item.message}</span></td><td className="px-4 py-3"><button type="button" onClick={() => deleteItem(item)} disabled={deleting !== ''} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">{deleting === key ? 'Đang xóa...' : item.type === 'missing-folder' ? 'Xóa nhật ký' : 'Xóa folder'}</button></td><td className="px-4 sm:px-6 py-3 text-slate-600">{item.type === 'missing-folder' ? <a href={`${journalUrl}#gid=0`} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{item.sheetTitle} · dòng {item.rowNumber}</a> : item.folderLink ? <a href={item.folderLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Mở folder</a> : item.folderName}</td></tr>; })}
        </tbody>
      </table></div>
      {!loading && !error && selectedFolder && selectedSpreadsheet && <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={5} onChange={setPage} />}
    </div>
  );
}
