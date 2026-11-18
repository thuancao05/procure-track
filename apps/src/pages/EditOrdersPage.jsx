import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useNotification } from '../components/NotificationProvider';
import EditOrderModal from '../components/EditOrderModal';
import { selectClass } from '../ui';

const PAGE_SIZE = 10;

const getCurrentYear = () => new Date().getFullYear();
const getCurrentMonth = () => new Date().getMonth() + 1;

const dateSortValue = (value) => {
  const text = String(value ?? '').trim();
  let year; let month; let day;
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [, year, month, day] = match;
  else {
    match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (!match) return null;
    [, day, month, year] = match;
  }
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date.getTime();
};

const sortFoldersAsTree = (folders) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map();
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

  folders.forEach((folder) => {
    const parentId = folder.parents?.find((id) => byId.has(id));
    const children = childrenByParent.get(parentId) ?? [];
    children.push(folder);
    childrenByParent.set(parentId, children);
  });
  childrenByParent.forEach((children) => children.sort((a, b) => collator.compare(a.name, b.name)));

  const result = [];
  const visited = new Set();
  const addBranch = (folder, depth) => {
    if (visited.has(folder.id)) return;
    visited.add(folder.id);
    result.push({ ...folder, depth });
    (childrenByParent.get(folder.id) ?? []).forEach((child) => addBranch(child, depth + 1));
  };
  (childrenByParent.get(undefined) ?? []).forEach((folder) => addBranch(folder, 0));
  folders.forEach((folder) => addBranch(folder, 0));
  return result;
};

const getSheetTitle = (year, month) => `Tháng ${month}/${year}`;

export default function EditOrdersPage() {
  const { showAlert } = useNotification();
  const [folders, setFolders] = useState([]);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  const [preferredFolderId, setPreferredFolderId] = useState('');
  const [preferredSpreadsheetId, setPreferredSpreadsheetId] = useState('');
  const [defaultSpreadsheetId, setDefaultSpreadsheetId] = useState('');
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [savingDefault, setSavingDefault] = useState('');
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [sheetRows, setSheetRows] = useState([]);
  const [sheetRowNumbers, setSheetRowNumbers] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetLoadingMore, setSheetLoadingMore] = useState(false);
  const [sheetPage, setSheetPage] = useState(0);
  const [sheetTotalRows, setSheetTotalRows] = useState(0);
  const [sheetHasMore, setSheetHasMore] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [sheetMessage, setSheetMessage] = useState('');
  const [sortColumn, setSortColumn] = useState(0);
  const [sortDirection, setSortDirection] = useState('desc');
  const [sheetReloadKey, setSheetReloadKey] = useState(0);
  const [editingOrder, setEditingOrder] = useState(null);

  const foldersInTreeOrder = useMemo(() => sortFoldersAsTree(folders), [folders]);
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const foldersWithChildren = useMemo(() => new Set(
    folders.flatMap((folder) => (folder.parents ?? []).filter((parentId) => folderIds.has(parentId))),
  ), [folders, folderIds]);
  const visibleFolders = useMemo(() => foldersInTreeOrder.filter((folder) => {
    let parentId = folder.parents?.find((id) => folderIds.has(id));
    while (parentId) {
      if (!expandedFolderIds.has(parentId)) return false;
      const parent = folders.find((item) => item.id === parentId);
      parentId = parent?.parents?.find((id) => folderIds.has(id));
    }
    return true;
  }), [expandedFolderIds, folderIds, folders, foldersInTreeOrder]);
  const selectedFolderName = folders.find((folder) => folder.id === selectedFolder)?.name ?? '';
  const sheetTitle = getSheetTitle(selectedYear, selectedMonth);
  const yearOptions = [...new Set([
    ...Array.from({ length: 5 }, (_, index) => getCurrentYear() - index),
    selectedYear,
  ])].sort((a, b) => b - a);
  const sortedRows = useMemo(() => sheetRows
    .map((row, index) => ({ row, rowNumber: sheetRowNumbers[index], index }))
    .sort((a, b) => {
      const left = String(a.row[sortColumn] ?? '');
      const right = String(b.row[sortColumn] ?? '');
      const isDateColumn = sheetHeaders[sortColumn]?.trim().toLowerCase() === 'ngày';
      const leftDate = isDateColumn ? dateSortValue(left) : null;
      const rightDate = isDateColumn ? dateSortValue(right) : null;
      const result = isDateColumn && leftDate !== null && rightDate !== null
        ? leftDate - rightDate
        : new Intl.Collator('vi', { numeric: true }).compare(left, right);
      return result
        ? (sortDirection === 'asc' ? result : -result)
        : (sortDirection === 'asc' ? a.index - b.index : b.index - a.index);
    })
    .map(({ row, rowNumber }) => ({ row, rowNumber })), [sheetHeaders, sheetRowNumbers, sheetRows, sortColumn, sortDirection]);
  const displayColumns = useMemo(() => {
    const columns = sheetHeaders.map((header, index) => ({ header, index }));
    const orderIndex = columns.findIndex(({ header }) => header.trim().toLowerCase() === 'mã đơn hàng');
    const documentIndex = columns.findIndex(({ header }) => header.trim().toLowerCase() === 'chứng từ');
    const shopIndex = columns.findIndex(({ header }) => header.trim().toLowerCase() === 'tên shop');
    if (orderIndex < 0 || documentIndex < 0 || shopIndex < 0) return columns;
    const documentColumn = columns.splice(documentIndex, 1)[0];
    const currentOrderIndex = columns.findIndex(({ header }) => header.trim().toLowerCase() === 'mã đơn hàng');
    columns.splice(currentOrderIndex + 1, 0, documentColumn);
    return columns;
  }, [sheetHeaders]);

  useEffect(() => {
    if (!selectedFolder) return;
    const selected = folders.find((folder) => folder.id === selectedFolder);
    if (!selected) return;
    const ancestors = [];
    let parentId = selected.parents?.find((id) => folderIds.has(id));
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

  useEffect(() => {
    let active = true;
    Promise.all([api.get('/drive/folders'), api.get('/preferences/drive')])
      .then(([folderResponse, preferenceResponse]) => {
        if (!active) return;
        const nextFolders = folderResponse.data.folders ?? [];
        setFolders(nextFolders);
        setDefaultSpreadsheetId(folderResponse.data.defaultSpreadsheetId ?? '');

        let preferences = preferenceResponse.data.preferences ?? {};
        if (preferenceResponse.data.localOnly) {
          try { preferences = JSON.parse(localStorage.getItem('pt-drive-preferences') || '{}'); } catch { /* ignore */ }
        }
        setPreferredFolderId(preferences.defaultFolderId ?? '');
        setPreferredSpreadsheetId(preferences.defaultSpreadsheetId ?? '');
        const preferred = nextFolders.find((folder) => folder.id === preferences.defaultFolderId);
        const configured = nextFolders.find((folder) => folder.id === folderResponse.data.defaultFolderId);
        setSelectedFolder(preferred?.id ?? configured?.id ?? '');
      })
      .catch(() => showAlert('Không thể tải danh sách thư mục Google Drive.', { variant: 'error' }))
      .finally(() => { if (active) setLoadingFolders(false); });
    return () => { active = false; };
  }, [showAlert]);

  useEffect(() => {
    if (!selectedFolder) {
      setSpreadsheets([]);
      setSelectedSpreadsheet('');
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
          if (nextSheets.some((sheet) => sheet.id === preferredSpreadsheetId)) return preferredSpreadsheetId;
          return nextSheets.some((sheet) => sheet.id === defaultSpreadsheetId) ? defaultSpreadsheetId : '';
        });
      })
      .catch(() => showAlert('Không thể tải danh sách Spreadsheet.', { variant: 'error' }))
      .finally(() => { if (active) setLoadingSheets(false); });
    return () => { active = false; };
  }, [defaultSpreadsheetId, preferredSpreadsheetId, selectedFolder, showAlert]);

  useEffect(() => {
    if (!selectedSpreadsheet) {
      setSheetHeaders([]); setSheetRows([]); setSheetRowNumbers([]); setSheetHasMore(false); setSheetMessage('');
      return undefined;
    }
    let active = true;
    setSheetLoading(true); setSheetError(''); setSheetMessage(''); setSheetHeaders([]); setSheetRows([]); setSheetRowNumbers([]); setSheetHasMore(false); setSheetPage(0); setSheetTotalRows(0);
    api.get('/drive/sheet-data', { params: { spreadsheetId: selectedSpreadsheet, sheetTitle, offset: sheetPage * PAGE_SIZE, limit: PAGE_SIZE } })
      .then(({ data }) => {
        if (!active) return;
        setSheetHeaders(data.headers ?? []);
        setSheetRows(data.rows ?? []);
        setSheetRowNumbers(data.rowNumbers ?? []);
        setSheetHasMore(Boolean(data.hasMore));
        setSheetTotalRows(data.totalRows ?? 0);
        setSheetMessage(data.sheetExists === false ? (data.message ?? `Chưa có sheet ${sheetTitle}.`) : '');
      })
      .catch((error) => { if (active) setSheetError(error.response?.data?.error ?? 'Không thể tải nhật ký nhập hàng.'); })
      .finally(() => { if (active) { setSheetLoading(false); setSheetLoadingMore(false); } });
    return () => { active = false; };
  }, [selectedSpreadsheet, sheetReloadKey, sheetTitle, sheetPage]);

  const changeSheetPage = (page) => {
    if (page < 0 || page * PAGE_SIZE >= sheetTotalRows || page === sheetPage) return;
    setSheetLoadingMore(true);
    setSheetPage(page);
  };

  const saveDefault = async (key, value) => {
    setSavingDefault(key);
    try {
      await api.patch('/preferences/drive', { [key]: value || null });
      if (key === 'defaultFolderId') setPreferredFolderId(value || '');
      if (key === 'defaultSpreadsheetId') setPreferredSpreadsheetId(value || '');
      await showAlert(value ? 'Đã lưu thiết lập mặc định.' : 'Đã bỏ thiết lập mặc định.', { variant: 'success', title: 'Đã cập nhật' });
    } catch (error) {
      await showAlert(error.response?.data?.error ?? 'Không thể lưu thiết lập mặc định.', { variant: 'error' });
    } finally { setSavingDefault(''); }
  };

  return (
    <div className="bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200 p-4 sm:p-8">
      <h1 className="text-xl font-bold text-slate-800">Chỉnh sửa đơn hàng</h1>
      <p className="mt-1 text-sm text-slate-500">Chọn nguồn dữ liệu để xem và chỉnh sửa đơn hàng đã ghi nhận.</p>

      <div className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-700">📂 1. Chọn thư mục gốc trên Google Drive:</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(selectedFolder && preferredFolderId === selectedFolder)} onChange={(e) => saveDefault('defaultFolderId', e.target.checked ? selectedFolder : '')} disabled={!selectedFolder || savingDefault !== ''} />
              Dùng làm mặc định
            </label>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setFolderPickerOpen((open) => !open)} disabled={loadingFolders || !foldersInTreeOrder.length} className={`${selectClass} flex items-center justify-between text-left`}>
              <span className={selectedFolderName ? 'truncate text-slate-800' : 'text-slate-500'}>{loadingFolders ? '⏳ Đang tải thư mục...' : selectedFolderName ? `📁 ${selectedFolderName}` : '-- Chọn thư mục quản lý chính --'}</span>
              <span aria-hidden="true">{folderPickerOpen ? '▴' : '▾'}</span>
            </button>
            {folderPickerOpen && (
              <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
                <div className="max-h-64 overflow-y-auto py-1" role="tree" aria-label="Cây thư mục Google Drive">
                  {visibleFolders.map((folder) => {
                    const hasChildren = foldersWithChildren.has(folder.id);
                    const expanded = expandedFolderIds.has(folder.id);
                    return (
                      <div key={folder.id} className={`flex min-h-10 items-center gap-1 pr-2 hover:bg-blue-50 ${selectedFolder === folder.id ? 'bg-blue-100 text-blue-800' : 'text-slate-700'}`} style={{ paddingLeft: `${0.5 + folder.depth * 1.25}rem` }}>
                        {hasChildren ? <button type="button" onClick={() => setExpandedFolderIds((current) => { const next = new Set(current); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })} className="h-8 w-8 shrink-0 rounded text-slate-500">{expanded ? '▾' : '▸'}</button> : <span className="h-8 w-8 shrink-0" />}
                        <button type="button" onClick={() => { setSelectedFolder(folder.id); setFolderPickerOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"><span>📁</span><span className="truncate">{folder.name}</span></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-700">📊 2. Chọn File Google Spreadsheet (Sổ nhật ký):</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={Boolean(selectedSpreadsheet && preferredSpreadsheetId === selectedSpreadsheet)} onChange={(e) => saveDefault('defaultSpreadsheetId', e.target.checked ? selectedSpreadsheet : '')} disabled={!selectedSpreadsheet || savingDefault !== ''} />Dùng làm mặc định</label>
          </div>
          <select value={selectedSpreadsheet} onChange={(e) => setSelectedSpreadsheet(e.target.value)} className={selectClass} disabled={!selectedFolder}>
            <option value="">{!selectedFolder ? '-- Vui lòng chọn thư mục ở trên trước --' : loadingSheets ? '⏳ Đang tìm file Spreadsheet...' : spreadsheets.length ? '-- Chọn file Spreadsheet --' : '-- Không tìm thấy file Sheet nào --'}</option>
            {spreadsheets.map((sheet) => <option key={sheet.id} value={sheet.id}>📊 {sheet.name}</option>)}
          </select>
        </div>
      </div>

      {selectedSpreadsheet && (
        <section className="mt-6 border-t border-slate-200 pt-5" aria-label="Nhật ký nhập hàng">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="text-base font-bold text-slate-800">Nhật ký nhập hàng</h2><p className="text-xs text-slate-500">{sheetTitle} · chọn một dòng để chỉnh sửa</p></div>
            <div className="flex items-end gap-2">
              <label className="text-xs font-semibold uppercase text-slate-500">Năm<select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className={`${selectClass} mt-1 min-w-24`}>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <label className="text-xs font-semibold uppercase text-slate-500">Tháng<select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className={`${selectClass} mt-1 min-w-24`}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>Tháng {month}</option>)}</select></label>
              <button type="button" onClick={() => { setSelectedYear(getCurrentYear()); setSelectedMonth(getCurrentMonth()); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Hiện tại</button>
            </div>
          </div>

          {sheetError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{sheetError}</p> : sheetMessage ? <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{sheetMessage}</p> : sheetLoading ? <p className="py-4 text-sm text-slate-500">Đang tải dữ liệu...</p> : sheetHeaders.length === 0 ? <p className="py-4 text-sm text-slate-500">Tab tháng này chưa có dữ liệu.</p> : (
            <div className="max-h-[30rem] max-w-full overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-max w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    {displayColumns.map(({ header, index }) => (
                      <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-2">
                        <button type="button" onClick={() => {
                          if (sortColumn === index) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
                          else { setSortColumn(index); setSortDirection('asc'); }
                        }}>{header} {sortColumn === index ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</button>
                      </th>
                    ))}
                    <th className="sticky right-0 bg-slate-100 px-3 py-2">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(({ row, rowNumber }) => (
                    <tr key={rowNumber} onClick={() => setEditingOrder({ rowNumber })} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50">
                      {displayColumns.map(({ header, index: columnIndex }) => {
                        const value = String(row[columnIndex] ?? '');
                        const link = header.trim().toLowerCase() === 'chứng từ' && /^https?:\/\//i.test(value);
                        const visibleLink = value.length > 5 ? `....${value.slice(-5)}` : value;
                        return <td key={columnIndex} className="whitespace-nowrap px-3 py-2">{link ? <a href={value} target="_blank" rel="noopener noreferrer" title={value} onClick={(event) => event.stopPropagation()} className="text-blue-600 underline">{visibleLink}</a> : value}</td>;
                      })}
                      <td className="sticky right-0 bg-white px-3 py-2"><button type="button" onClick={(event) => { event.stopPropagation(); setEditingOrder({ rowNumber }); }} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">Chỉnh sửa</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sheetTotalRows > PAGE_SIZE && !sheetError && <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Trang {sheetPage + 1}/{Math.ceil(sheetTotalRows / PAGE_SIZE)} · {sheetTotalRows} dòng</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => changeSheetPage(sheetPage - 1)} disabled={sheetPage === 0 || sheetLoadingMore} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Trước</button>
              <button type="button" onClick={() => changeSheetPage(sheetPage + 1)} disabled={!sheetHasMore || sheetLoadingMore} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">{sheetLoadingMore ? 'Đang tải…' : 'Sau'}</button>
            </div>
          </div>}
        </section>
      )}
      {editingOrder && selectedSpreadsheet && (
        <EditOrderModal
          order={editingOrder}
          spreadsheetId={selectedSpreadsheet}
          sheetTitle={sheetTitle}
          rowNumber={editingOrder.rowNumber}
          onClose={() => setEditingOrder(null)}
          onSaved={(result) => {
            setEditingOrder(null);
            const match = result.sheetTitle?.match(/^Tháng (\d{1,2})\/(\d{4})$/);
            if (match) {
              setSelectedMonth(Number(match[1]));
              setSelectedYear(Number(match[2]));
            }
            setSheetReloadKey((key) => key + 1);
          }}
        />
      )}
    </div>
  );
}
