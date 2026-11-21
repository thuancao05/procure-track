import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../services/api';
import { apiError, inputClass, labelClass, selectClass } from '../ui';
import { useNotification } from './NotificationProvider';
import OrderOcrPanel from './OrderOcrPanel';

const todayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (value) => {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
};

const formatShortDateDisplay = (value) => {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}` : '';
};

const shiftDate = (value, days) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Kênh mua, SKU, Tên hàng hóa, Thanh toán được chọn từ danh mục (backend đọc từ Supabase)
const INITIAL_FORM = {
  ngay: todayDateString(),
  kenhMua: '',
  maDonHang: '',
  tenShop: '',
  sku: '',
  tenHangHoa: '',
  soLuong: '2',
  giaGoc: '',
  giaThucTra: '',
  phuongThucThanhToan: '',
  maVanDon: '',
};

const formatThousandUnits = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

const normalizeHeader = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const isMoneyHeader = (value) => ['gia goc', 'gia thuc tra'].includes(normalizeHeader(value));
const formatMoneyDisplay = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

const getCurrentYear = () => new Date().getFullYear();
const getCurrentMonth = () => new Date().getMonth() + 1;

const sortFoldersAsTree = (folders) => {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map();
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

  folders.forEach((folder) => {
    const parentId = folder.parents?.find((id) => byId.has(id));
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(parentId, siblings);
  });

  childrenByParent.forEach((siblings) => siblings.sort((a, b) => collator.compare(a.name, b.name)));

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

export default function HomeDashboard() {
  const { showAlert } = useNotification();
  const [formData, setFormData] = useState(INITIAL_FORM);

  // Danh mục từ backend (/api/lookups)
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [channels, setChannels] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState('');

  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  // Ô đang được quét QR: 'maVanDon' | 'maDonHang' | null (đóng)
  const [qrTarget, setQrTarget] = useState(null);
  const qrOpen = qrTarget !== null;
  const [qrError, setQrError] = useState('');
  const nativeQrScannerEnabled = false;
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const qrVideoRef = useRef(null);
  const qrStreamRef = useRef(null);
  const fileInputRef = useRef(null);
  const datePickerRef = useRef(null);

  useEffect(() => {
    const previews = images.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImagePreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [images]);
  const [folders, setFolders] = useState([]);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [driveDefaultFolderId, setDriveDefaultFolderId] = useState('');
  const [defaultSpreadsheetId, setDefaultSpreadsheetId] = useState('');
  const [preferredFolderId, setPreferredFolderId] = useState('');
  const [preferredSpreadsheetId, setPreferredSpreadsheetId] = useState('');
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [localPreferencesMode, setLocalPreferencesMode] = useState(false);
  const [savingDefault, setSavingDefault] = useState('');
  const foldersInTreeOrder = useMemo(() => sortFoldersAsTree(folders), [folders]);
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const foldersWithChildren = useMemo(() => {
    const ids = new Set();
    folders.forEach((folder) => {
      folder.parents?.forEach((parentId) => {
        if (folderIds.has(parentId)) ids.add(parentId);
      });
    });
    return ids;
  }, [folders, folderIds]);

  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState(() => new Set());
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

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

  useEffect(() => {
    if (!selectedFolder) return;
    const selected = folders.find((folder) => folder.id === selectedFolder);
    if (!selected) return;
    const ancestorIds = [];
    let parentId = selected.parents?.find((id) => folderIds.has(id));
    while (parentId) {
      ancestorIds.push(parentId);
      const parent = folders.find((folder) => folder.id === parentId);
      parentId = parent?.parents?.find((id) => folderIds.has(id));
    }
    if (ancestorIds.length === 0) return;
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      ancestorIds.forEach((id) => next.add(id));
      return next.size === current.size ? current : next;
    });
  }, [folderIds, folders, selectedFolder]);
  
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [sheetRows, setSheetRows] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetLoadingMore, setSheetLoadingMore] = useState(false);
  const [sheetHasMore, setSheetHasMore] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [sheetMessage, setSheetMessage] = useState('');
  const [selectedLogYear, setSelectedLogYear] = useState(getCurrentYear());
  const [selectedLogMonth, setSelectedLogMonth] = useState(getCurrentMonth());
  const [sheetReloadKey, setSheetReloadKey] = useState(0);
  const [sheetSortColumn, setSheetSortColumn] = useState(0);
  const [sheetSortDirection, setSheetSortDirection] = useState('desc');

  const sortedSheetRows = useMemo(() => {
    const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
    return sheetRows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const left = String(a.row[sheetSortColumn] ?? '');
        const right = String(b.row[sheetSortColumn] ?? '');
        const result = collator.compare(left, right);
        if (result !== 0) return sheetSortDirection === 'asc' ? result : -result;
        // API đã sắp xếp các đơn cùng ngày theo hàng mới thêm trước.
        // Không đảo lại ở đây, nếu không thứ tự nhập sẽ bị đảo lần thứ hai.
        return 0;
      })
      .map(({ row }) => row);
  }, [sheetRows, sheetSortColumn, sheetSortDirection]);

  const selectedLogSheetTitle = `Tháng ${selectedLogMonth}/${selectedLogYear}`;
  const sheetYearOptions = useMemo(() => {
    const currentYear = getCurrentYear();
    const years = Array.from({ length: 5 }, (_, index) => currentYear - index);
    if (!years.includes(selectedLogYear)) years.push(selectedLogYear);
    return years.sort((a, b) => b - a);
  }, [selectedLogYear]);

  useEffect(() => {
    if (!cameraOpen) return undefined;

    let cancelled = false;
    const startCamera = async () => {
      try {
        setCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setCameraError('Không thể mở camera. Hãy cấp quyền camera cho trình duyệt.');
      }
    };
    startCamera();

    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraOpen]);

  const openQrScanner = (field) => {
    setQrError('');
    setQrTarget(field);
  };

  useEffect(() => {
    if (!qrOpen || !nativeQrScannerEnabled) return undefined;

    let cancelled = false;
    let animationFrame;
    const startQrScanner = async () => {
      if (!('BarcodeDetector' in window)) {
        setQrError('Trình duyệt chưa hỗ trợ quét QR trực tiếp. Hãy dùng Chrome/Edge phiên bản mới.');
        return;
      }
      try {
        setQrError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        qrStreamRef.current = stream;
        qrVideoRef.current.srcObject = stream;
        await qrVideoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

        const scan = async () => {
          if (cancelled || !qrVideoRef.current) return;
          try {
            const codes = await detector.detect(qrVideoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              setFormData((current) => ({ ...current, [qrTarget]: value }));
              setQrTarget(null);
              return;
            }
          } catch {
            // Tiếp tục quét ở frame kế tiếp.
          }
          animationFrame = requestAnimationFrame(scan);
        };
        scan();
      } catch {
        setQrError('Không thể mở camera. Hãy cấp quyền camera cho trình duyệt.');
      }
    };
    startQrScanner();

    return () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      qrStreamRef.current?.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    };
  }, [qrTarget]);

  useEffect(() => {
    if (!qrOpen) return undefined;

    const scanner = new Html5Qrcode('qr-reader');
    let stopped = false;
    const startScanner = async () => {
      try {
        setQrError('');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 180 } },
          (decodedText) => {
            if (stopped) return;
            setFormData((current) => ({ ...current, [qrTarget]: decodedText.trim() }));
            stopped = true;
            setQrTarget(null);
          },
          () => {}
        );
      } catch {
        setQrError('Không thể mở camera hoặc camera chưa được cấp quyền.');
      }
    };
    startScanner();

    return () => {
      stopped = true;
      scanner.stop()
        .catch(() => {})
        .finally(() => {
          try {
            scanner.clear();
          } catch {
            // Scanner có thể chưa khởi động xong khi modal bị đóng.
          }
        });
    };
  }, [qrTarget]);

  // 0. Tải danh mục Hàng hóa / Kênh mua / Phương thức thanh toán từ backend
  useEffect(() => {
    async function fetchLookups() {
      setLoadingLookups(true);
      try {
        const { data } = await api.get('/lookups');
        const nextChannels = data.kenhMua ?? [];
        const nextPaymentMethods = data.phuongThucThanhToan ?? [];
        setProducts(data.products ?? []);
        setShops(data.shops ?? []);
        setChannels(nextChannels);
        setPaymentMethods(nextPaymentMethods);
        setFormData((current) => ({
          ...current,
          kenhMua: current.kenhMua || nextChannels.find((item) => item.isDefault)?.name || '',
          phuongThucThanhToan: current.phuongThucThanhToan || nextPaymentMethods.find((item) => item.isDefault)?.name || '',
        }));
        setLookupError('');
      } catch (error) {
        console.error('Không thể tải danh mục:', error);
        setLookupError(error.response?.data?.error ?? 'Không thể tải danh mục từ server.');
      } finally {
        setLoadingLookups(false);
      }
    }
    fetchLookups();
  }, []);

  // 1. Lấy danh sách thư mục từ Google Drive khi tải trang
  useEffect(() => {
    async function fetchDriveFolders() {
      setLoadingFolders(true);
      try {
        const response = await api.get('/drive/folders');
        if (response.data.success) {
          setFolders(response.data.folders);
          setDriveDefaultFolderId(response.data.defaultFolderId ?? '');
          setDefaultSpreadsheetId(response.data.defaultSpreadsheetId ?? '');
        }
      } catch (error) {
        console.error("Không thể tải danh sách thư mục Drive:", error);
      } finally {
        setLoadingFolders(false);
        setFoldersLoaded(true);
      }
    }
    fetchDriveFolders();
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get('/preferences/drive')
      .then(({ data }) => {
        if (cancelled) return;
        if (data.localOnly) {
          setLocalPreferencesMode(true);
          let localPreferences = {};
          try {
            localPreferences = JSON.parse(localStorage.getItem('pt-drive-preferences') || '{}');
          } catch { /* Ignore unavailable or invalid local storage. */ }
          setPreferredFolderId(localPreferences.defaultFolderId ?? '');
          setPreferredSpreadsheetId(localPreferences.defaultSpreadsheetId ?? '');
        } else {
          setPreferredFolderId(data.preferences.defaultFolderId);
          setPreferredSpreadsheetId(data.preferences.defaultSpreadsheetId);
        }
      })
      .catch((error) => console.error('Không thể tải thiết lập Drive:', error))
      .finally(() => {
        if (!cancelled) setPreferencesLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!foldersLoaded || !preferencesLoaded) return;
    const preferredFolderExists = folders.some((folder) => folder.id === preferredFolderId);
    const configuredFolderExists = folders.some((folder) => folder.id === driveDefaultFolderId);
    setSelectedFolder(preferredFolderExists ? preferredFolderId : configuredFolderExists ? driveDefaultFolderId : '');
  }, [foldersLoaded, preferencesLoaded, folders, preferredFolderId, driveDefaultFolderId]);

  // 2. Khi người dùng thay đổi thư mục chọn ở đầu, tự động quét tìm các Google Spreadsheet nằm trong thư mục đó
  useEffect(() => {
    async function fetchSpreadsheetsInFolder() {
      if (!selectedFolder) {
        setSpreadsheets([]);
        setSelectedSpreadsheet('');
        return;
      }

      setLoadingSheets(true);
      try {
        const response = await api.get(`/drive/spreadsheets?folderId=${selectedFolder}`);
        if (response.data.success) {
          setSpreadsheets(response.data.spreadsheets);
          setSelectedSpreadsheet((current) => {
            if (current && response.data.spreadsheets.some((sheet) => sheet.id === current)) return current;
            if (response.data.spreadsheets.some((sheet) => sheet.id === preferredSpreadsheetId)) return preferredSpreadsheetId;
            return response.data.spreadsheets.some((sheet) => sheet.id === defaultSpreadsheetId) ? defaultSpreadsheetId : '';
          });
        }
      } catch (error) {
        console.error("Không thể tải danh sách file Excel/Sheet:", error);
      } finally {
        setLoadingSheets(false);
      }
    }
    fetchSpreadsheetsInFolder();
  }, [selectedFolder, defaultSpreadsheetId, preferredSpreadsheetId]);

  useEffect(() => {
    const sheetTitle = selectedLogSheetTitle;
    if (!selectedSpreadsheet || !sheetTitle) {
      setSheetHeaders([]);
      setSheetRows([]);
      setSheetHasMore(false);
      setSheetMessage('');
      return undefined;
    }

    let active = true;
    setSheetLoading(true);
    setSheetError('');
    setSheetMessage('');
    setSheetHeaders([]);
    setSheetRows([]);
    setSheetHasMore(false);
    api.get('/drive/sheet-data', { params: { spreadsheetId: selectedSpreadsheet, sheetTitle, offset: 0, limit: 5 } })
      .then(({ data }) => {
        if (!active) return;
        setSheetHeaders(data.headers ?? []);
        setSheetRows(data.rows ?? []);
        setSheetHasMore(Boolean(data.hasMore));
        setSheetMessage(data.sheetExists === false ? (data.message ?? `Chưa có sheet ${sheetTitle}.`) : '');
      })
      .catch((error) => {
        if (!active) return;
        setSheetHeaders([]);
        setSheetRows([]);
        setSheetMessage('');
        setSheetError(error.response?.data?.error ?? 'Không thể tải dữ liệu Spreadsheet.');
      })
      .finally(() => {
        if (active) setSheetLoading(false);
      });

    return () => { active = false; };
  }, [selectedSpreadsheet, selectedLogSheetTitle, sheetReloadKey]);

  const loadMoreSheetRows = async () => {
    const sheetTitle = selectedLogSheetTitle;
    if (!selectedSpreadsheet || !sheetTitle || sheetLoadingMore || !sheetHasMore) return;
    setSheetLoadingMore(true);
    try {
      const { data } = await api.get('/drive/sheet-data', {
        params: { spreadsheetId: selectedSpreadsheet, sheetTitle, offset: sheetRows.length, limit: 5 },
      });
      setSheetRows((current) => [...current, ...(data.rows ?? [])]);
      setSheetHasMore(Boolean(data.hasMore));
    } catch (error) {
      setSheetError(error.response?.data?.error ?? 'Không thể tải thêm dữ liệu Spreadsheet.');
    } finally {
      setSheetLoadingMore(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleMoneyChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    setFormData((current) => ({ ...current, [e.target.name]: digits }));
  };

  const captureCameraImage = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const filename = `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      setCameraMessage(`Đã chụp thành công ảnh số ${images.length + 1}.`);
      setImages((current) => [...current, new File([blob], filename, { type: 'image/jpeg' })]);
    }, 'image/jpeg', 0.9);
  };

  const clearImages = () => {
    setImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Chọn SKU hoặc Tên hàng hóa -> tự động điền trường còn lại
  const handleProductChange = (e) => {
    const { name, value } = e.target;
    const product = products.find((p) => p[name] === value);
    setFormData((current) => ({
      ...current,
      sku: product?.sku ?? '',
      tenHangHoa: product?.tenHangHoa ?? '',
    }));
  };

  const handleSkuChange = (e) => {
    const sku = e.target.value;
    const product = products.find((p) => p.sku.toLowerCase() === sku.trim().toLowerCase());
    setFormData((current) => ({
      ...current,
      sku,
      tenHangHoa: product?.tenHangHoa ?? '',
    }));
  };

  const lookupPlaceholder = (emptyLabel, list) =>
    loadingLookups ? '⏳ Đang tải...' : list.length === 0 ? '-- Chưa có dữ liệu --' : emptyLabel;

  const saveDriveDefault = async (key, value, successMessage) => {
    setSavingDefault(key);
    try {
      if (localPreferencesMode) {
        const current = JSON.parse(localStorage.getItem('pt-drive-preferences') || '{}');
        localStorage.setItem('pt-drive-preferences', JSON.stringify({ ...current, [key]: value }));
      } else {
        await api.patch('/preferences/drive', { [key]: value || null });
      }
      if (key === 'defaultFolderId') setPreferredFolderId(value ?? '');
      if (key === 'defaultSpreadsheetId') setPreferredSpreadsheetId(value ?? '');
      await showAlert(value ? successMessage : 'Đã bỏ thiết lập mặc định.', { variant: 'success', title: 'Đã cập nhật' });
    } catch (error) {
      await showAlert(error.response?.data?.error ?? 'Không thể lưu thiết lập mặc định.', { variant: 'error' });
    } finally {
      setSavingDefault('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.ngay) {
      await showAlert('Vui lòng chọn ngày nhập hàng.', { variant: 'warning' });
      return;
    }

    if (!selectedFolder) {
      await showAlert('Vui lòng chọn thư mục gốc trên Google Drive.', { variant: 'warning' });
      return;
    }

    if (!selectedSpreadsheet) {
      await showAlert('Vui lòng chọn hoặc tạo file Google Spreadsheet đích để lưu dữ liệu nhật ký.', { variant: 'warning' });
      return;
    }

    if (!images.length) {
      await showAlert('Vui lòng chọn hoặc chụp ít nhất một ảnh chứng từ.', { variant: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('parentFolderId', selectedFolder);
      data.append('spreadsheetId', selectedSpreadsheet); // Truyền ID file Sheet được chọn
      
      Object.keys(formData).forEach((key) => {
        data.append(key, formData[key]);
      });

      for (let i = 0; i < images.length; i++) {
        data.append('images', images[i]);
      }

      // Không tự đặt Content-Type: browser/Axios cần tự thêm boundary cho multipart body.
      const response = await api.post('/procure', data);

      if (response.data.success) {
        await showAlert(`${response.data.message}\nLink Drive: ${response.data.linkChungTu}`, { variant: 'success', title: 'Thêm đơn hàng thành công' });

        const [orderYear, orderMonth] = String(formData.ngay).split('-').map(Number);
        if (orderYear && orderMonth) {
          setSelectedLogYear(orderYear);
          setSelectedLogMonth(orderMonth);
        }
        setSheetReloadKey((key) => key + 1);
        
        // Reset form sau khi lưu thành công
        setFormData(INITIAL_FORM);
        setImages([]);
      } else {
        await showAlert(`Lỗi: ${response.data.error}`, { variant: 'error' });
      }
    } catch (error) {
      console.error("Lỗi khi gửi dữ liệu:", error);
      await showAlert(apiError(error, 'Không thể tạo đơn hàng.'), { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white sm:rounded-2xl sm:shadow-sm sm:border border-slate-200">
        <div className="px-4 sm:px-8 pt-4 sm:pt-6">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">Quản Lý Nhập Hàng Hóa</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Chứng minh nguồn gốc hàng hóa pháp lý</p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-8 sm:pt-5 space-y-5 sm:space-y-6">
          {lookupError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{lookupError}</p>
          )}

          {/* 1. Chọn thư mục Drive */}
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 space-y-4 sm:space-y-3">
            <div>
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="block text-sm font-semibold text-slate-700">
                  📂 1. Chọn thư mục gốc trên Google Drive:
                </label>
                <label className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-slate-700 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedFolder && preferredFolderId === selectedFolder)}
                    onChange={(e) => saveDriveDefault('defaultFolderId', e.target.checked ? selectedFolder : null, 'Đã lưu thư mục mặc định cho tài khoản của bạn.')}
                    disabled={!selectedFolder || savingDefault !== ''}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                  />
                  <span>{savingDefault === 'defaultFolderId' ? 'Đang lưu...' : 'Dùng làm mặc định'}</span>
                </label>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFolderPickerOpen((open) => !open)}
                  disabled={loadingFolders || foldersInTreeOrder.length === 0}
                  className={`${selectClass} flex items-center justify-between text-left`}
                >
                  <span className={selectedFolderName ? 'truncate text-slate-800' : 'text-slate-500'}>
                    {loadingFolders ? '⏳ Đang tải thư mục...' : selectedFolderName ? `📁 ${selectedFolderName}` : '-- Chọn thư mục quản lý chính --'}
                  </span>
                  <span className="ml-2 shrink-0 text-slate-500" aria-hidden="true">{folderPickerOpen ? '▴' : '▾'}</span>
                </button>

                {folderPickerOpen && foldersInTreeOrder.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg">
                    <div className="max-h-64 overflow-y-auto py-1" role="tree" aria-label="Cây thư mục Google Drive">
                      {visibleFolders.map((folder) => {
                        const hasChildren = foldersWithChildren.has(folder.id);
                        const isExpanded = expandedFolderIds.has(folder.id);
                        const isSelected = selectedFolder === folder.id;
                        return (
                          <div
                            key={folder.id}
                            role="treeitem"
                            aria-level={folder.depth + 1}
                            aria-expanded={hasChildren ? isExpanded : undefined}
                            className={`flex items-center gap-1 min-h-10 pr-2 hover:bg-blue-50 ${isSelected ? 'bg-blue-100 text-blue-800' : 'text-slate-700'}`}
                            style={{ paddingLeft: `${0.5 + folder.depth * 1.25}rem` }}
                          >
                            {hasChildren ? (
                              <button
                                type="button"
                                onClick={() => setExpandedFolderIds((current) => {
                                  const next = new Set(current);
                                  if (next.has(folder.id)) next.delete(folder.id);
                                  else next.add(folder.id);
                                  return next;
                                })}
                                className="h-8 w-8 shrink-0 rounded text-slate-500 hover:bg-blue-100 hover:text-blue-700"
                                aria-label={isExpanded ? `Thu nhỏ ${folder.name}` : `Mở rộng ${folder.name}`}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            ) : (
                              <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFolder(folder.id);
                                setFolderPickerOpen(false);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
                              title={folder.name}
                            >
                              <span aria-hidden="true">📁</span>
                              <span className="truncate">{folder.name}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {!selectedFolder && !loadingFolders && foldersInTreeOrder.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Bấm vào ô để mở danh sách thư mục; chọn thư mục con nếu cần.</p>
              )}
            </div>

            {/* 2. Chọn file Google Spreadsheet nằm trong thư mục đó */}
            <div>
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="block text-sm font-semibold text-slate-700">
                  📊 2. Chọn File Google Spreadsheet (Sổ nhật ký):
                </label>
                <label className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-slate-700 sm:min-h-0">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedSpreadsheet && preferredSpreadsheetId === selectedSpreadsheet)}
                    onChange={(e) => saveDriveDefault('defaultSpreadsheetId', e.target.checked ? selectedSpreadsheet : null, 'Đã lưu Spreadsheet mặc định cho tài khoản của bạn.')}
                    disabled={!selectedSpreadsheet || savingDefault !== ''}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                  />
                  <span>{savingDefault === 'defaultSpreadsheetId' ? 'Đang lưu...' : 'Dùng làm mặc định'}</span>
                </label>
              </div>
              <select 
                value={selectedSpreadsheet} 
                onChange={(e) => setSelectedSpreadsheet(e.target.value)}
                className={selectClass}
                required
                disabled={!selectedFolder}
              >
                <option value="">
                  {!selectedFolder 
                    ? "-- Vui lòng chọn thư mục ở trên trước --" 
                    : loadingSheets 
                      ? "⏳ Đang tìm file Spreadsheet trong thư mục..." 
                      : spreadsheets.length === 0 
                        ? "-- Không tìm thấy file Sheet nào trong thư mục này --" 
                        : "-- Chọn file Spreadsheet --"}
                </option>
                {spreadsheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>
                    📊 {sheet.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                💡 Dữ liệu đơn hàng sẽ được tự động ghi vào Sheet (Tab) tương ứng với <b>Tháng/Năm</b> của ngày nhập hàng trong file này.
              </p>
            </div>
          </div>

          {/* Grid thông tin form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Ngày nhập</label>
              <div className="flex flex-nowrap items-center gap-2">
                <div className="relative w-[170px] shrink-0 sm:w-[180px]">
                  <input
                    type="text"
                    value={formatDateDisplay(formData.ngay)}
                    readOnly
                    aria-label="Ngày nhập theo định dạng ngày/tháng/năm"
                    className={`${inputClass} !w-full pr-10 pointer-events-none`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" aria-hidden="true">📅</span>
                  <input
                    ref={datePickerRef}
                    type="date"
                    name="ngay"
                    value={formData.ngay}
                    onChange={handleChange}
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    aria-label="Chọn ngày nhập"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    required
                  />
                </div>
                {[-1, -2, -3].map((offset) => (
                  <button
                    key={offset}
                    type="button"
                    onClick={() => setFormData((current) => ({ ...current, ngay: shiftDate(current.ngay, offset) }))}
                    aria-label={`Chọn ngày ${formatDateDisplay(shiftDate(formData.ngay, offset))}`}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {formatShortDateDisplay(shiftDate(formData.ngay, offset))}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Kênh mua</label>
              {loadingLookups ? (
                <p className="text-sm text-slate-500 py-2">Đang tải kênh mua...</p>
              ) : channels.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">Chưa có kênh mua.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="radiogroup" aria-label="Kênh mua">
                  {channels.map(({ name }) => (
                    <label
                      key={name}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition min-h-10 ${
                        formData.kenhMua === name
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="kenhMua"
                        value={name}
                        checked={formData.kenhMua === name}
                        onChange={handleChange}
                        className="h-4 w-4 shrink-0 accent-blue-600"
                        required
                      />
                      <span className="text-sm leading-tight truncate" title={name}>{name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Mã đơn hàng</label>
              <div className="flex gap-2">
                <input type="text" name="maDonHang" autoCapitalize="characters" value={formData.maDonHang} placeholder="VD: DH123456 (không bắt buộc)" onChange={handleChange} className={`${inputClass} flex-1 min-w-0`} />
                <button type="button" onClick={() => openQrScanner('maDonHang')} className="shrink-0 px-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100" title="Quét mã đơn hàng">
                  📷 Quét QR
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Tên Shop</label>
              <input type="text" name="tenShop" value={formData.tenShop} list="shop-options" autoComplete="off" placeholder="Tên nhà cung cấp / shop" onChange={handleChange} className={inputClass} required />
              <datalist id="shop-options">
                {shops.map((shop) => <option key={shop} value={shop} />)}
              </datalist>
            </div>

            <div>
              <label className={labelClass}>Mã SKU</label>
              <input
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleSkuChange}
                list="sku-options"
                autoComplete="off"
                placeholder={lookupPlaceholder('Nhập hoặc chọn SKU', products)}
                className={inputClass}
                required
              />
              <datalist id="sku-options">
                {products.map((p) => <option key={p.sku} value={p.sku}>{p.tenHangHoa}</option>)}
              </datalist>
            </div>

            <div>
              <label className={labelClass}>Tên hàng hóa</label>
              <select name="tenHangHoa" value={formData.tenHangHoa} onChange={handleProductChange} className={selectClass}>
                <option value="">{lookupPlaceholder('-- Chọn hàng hóa --', products)}</option>
                {products.map((p) => (
                  <option key={p.sku} value={p.tenHangHoa}>{p.tenHangHoa}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Số lượng</label>
              <input type="number" inputMode="numeric" min="0" name="soLuong" value={formData.soLuong} placeholder="0" onChange={handleChange} className={inputClass} required />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-[auto_140px_140px] gap-4 items-end justify-start">
              <div>
                <label className={labelClass}>Phương thức thanh toán</label>
                {loadingLookups ? (
                <p className="text-sm text-slate-500 py-2">Đang tải phương thức thanh toán...</p>
                ) : paymentMethods.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">Chưa có phương thức thanh toán.</p>
                ) : (
                <div className="flex flex-nowrap items-center gap-2" role="radiogroup" aria-label="Phương thức thanh toán">
                  {paymentMethods.map(({ name }) => (
                    <label
                      key={name}
                      className={`flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition min-h-10 w-fit ${
                        formData.phuongThucThanhToan === name
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="phuongThucThanhToan"
                        value={name}
                        checked={formData.phuongThucThanhToan === name}
                        onChange={handleChange}
                        className="h-4 w-4 shrink-0 accent-blue-600"
                        required
                      />
                      <span className="text-sm leading-tight truncate" title={name}>{name}</span>
                    </label>
                  ))}
                </div>
                )}
              </div>

            <div>
              <label className={labelClass}>Giá gốc </label>
              <div className="relative max-w-[140px]">
                <input type="text" inputMode="numeric" name="giaGoc" value={formatThousandUnits(formData.giaGoc)} placeholder="100.000" onChange={handleMoneyChange} className={`${inputClass} pr-3 text-right`} required />
              </div>
            </div>

            <div>
              <label className={labelClass}>Giá thực trả</label>
              <div className="relative max-w-[140px]">
                <input type="text" inputMode="numeric" name="giaThucTra" value={formatThousandUnits(formData.giaThucTra)} placeholder="100.000" onChange={handleMoneyChange} className={`${inputClass} pr-3 text-right`} required />
              </div>
            </div>

            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Mã Vận đơn</label>
              <div className="flex gap-2">
                <input type="text" name="maVanDon" autoCapitalize="characters" value={formData.maVanDon} placeholder="VD: SPXVN... (không bắt buộc)" onChange={handleChange} className={`${inputClass} flex-1 min-w-0`} />
                <button type="button" onClick={() => openQrScanner('maVanDon')} className="shrink-0 px-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100" title="Quét mã QR">
                  📷 Quét QR
                </button>
              </div>
            </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Hình ảnh chứng từ (Bill, nhãn SKU, kiện hàng - Chọn nhiều ảnh)
            </label>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input 
                ref={fileInputRef}
                type="file" 
                multiple 
                accept="image/*" 
                onChange={(e) => setImages((current) => [...current, ...Array.from(e.target.files ?? [])])} 
                className="w-full sm:flex-1 min-w-0 px-3 py-3 sm:py-2 border border-dashed border-slate-300 rounded-lg text-sm bg-slate-50 file:mr-3 file:py-2 sm:file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm sm:file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <button
                type="button"
                onClick={() => { setCameraMessage(''); setCameraOpen(true); }}
                className="shrink-0 px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100"
              >
                📷 Mở camera chụp ảnh
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {images.length > 0 && (
                <button
                  type="button"
                  onClick={clearImages}
                  className="px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100"
                >
                  Xóa ảnh đã chọn
                </button>
              )}
            </div>
            {images.length > 0 && (
              <>
                <span className="text-xs font-medium text-blue-700 mt-1 block">
                  ✅ Đã chọn {images.length} ảnh
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                  {imagePreviews.map(({ file, url }, index) => (
                    <div
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                    >
                      <button
                        type="button"
                        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                        className="h-full w-full"
                        title="Bấm để xem ảnh lớn"
                      >
                        <img src={url} alt={`Ảnh chứng từ ${index + 1}`} className="h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow hover:bg-red-700"
                        aria-label={`Xóa ảnh ${index + 1}`}
                        title="Xóa ảnh này"
                      >
                        ×
                      </button>
                      <span className="absolute bottom-1 right-1 rounded bg-slate-900/70 px-1.5 text-[10px] text-white">{index + 1}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <span className="text-xs text-slate-400 mt-1 block leading-relaxed">
              💡 Bạn có thể giữ phím Ctrl (hoặc Shift trên máy tính) hoặc chọn nhiều tệp trên điện thoại để tải lên một lúc tất cả các bill liên quan.
            </span>
          </div>
            <OrderOcrPanel />
          </div>

          {/* Nút lưu: dính đáy màn hình trên mobile */}
          {qrOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Quét mã QR">
              <div className="w-full max-w-lg bg-white rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-800">{qrTarget === 'maDonHang' ? 'Quét mã đơn hàng' : 'Quét mã QR vận đơn'}</h2>
                  <button type="button" onClick={() => setQrTarget(null)} className="text-slate-500 hover:text-slate-800 text-xl" aria-label="Đóng quét QR">×</button>
                </div>
                {qrError ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{qrError}</p>
                ) : (
                  <div id="qr-reader" className="w-full min-h-64 overflow-hidden rounded-xl bg-slate-900" />
                )}
                <p className="text-xs text-slate-500 mt-3">Đưa mã QR vào giữa khung hình; mã sẽ được điền tự động.</p>
                <button type="button" onClick={() => setQrTarget(null)} className="w-full mt-4 py-3 rounded-xl border border-slate-300 text-slate-700">Đóng</button>
              </div>
            </div>
          )}

          {cameraOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Chụp ảnh bằng camera">
              <div className="w-full max-w-lg bg-white rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-800">Chụp ảnh chứng từ</h2>
                  <button type="button" onClick={() => setCameraOpen(false)} className="text-slate-500 hover:text-slate-800 text-xl" aria-label="Đóng camera">×</button>
                </div>
                {cameraError ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{cameraError}</p>
                ) : (
                  <video ref={videoRef} autoPlay playsInline className="w-full aspect-video object-cover rounded-xl bg-slate-900" />
                )}
                {cameraMessage && (
                  <p className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">✅ {cameraMessage}</p>
                )}
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={captureCameraImage} disabled={Boolean(cameraError)} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-medium disabled:bg-slate-300">Chụp ảnh</button>
                  <button type="button" onClick={() => setCameraOpen(false)} className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700">Xong</button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Bạn có thể bấm “Chụp ảnh” nhiều lần rồi chọn “Xong”.</p>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-slate-200 sm:static sm:mx-0 sm:p-0 sm:bg-transparent sm:border-0 sm:backdrop-blur-none">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-medium text-base py-3.5 sm:py-3 px-4 rounded-xl shadow-sm transition duration-150 disabled:bg-blue-200"
            >
              {submitting ? "⏳ Đang xử lý tạo thư mục, ghi Sheet & tải ảnh..." : "💾 Lưu Đơn Hàng & Ghi Nhật Ký"}
            </button>
          </div>
        </form>

        {selectedSpreadsheet && (
          <section className="border-t border-slate-200 px-4 py-4 sm:px-8 sm:py-6" aria-label="Nhật ký nhập hàng">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">Nhật ký nhập hàng</h2>
                <p className="text-xs text-slate-500">{selectedLogSheetTitle} · chỉ xem</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Năm
                  <select
                    value={selectedLogYear}
                    onChange={(event) => setSelectedLogYear(Number(event.target.value))}
                    className={`${selectClass} mt-1 min-w-[7rem] sm:w-auto`}
                    disabled={sheetLoading}
                  >
                    {sheetYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tháng
                  <select
                    value={selectedLogMonth}
                    onChange={(event) => setSelectedLogMonth(Number(event.target.value))}
                    className={`${selectClass} mt-1 min-w-[7rem] sm:w-auto`}
                    disabled={sheetLoading}
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                      <option key={month} value={month}>Tháng {month}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setSheetReloadKey((key) => key + 1)}
                  disabled={sheetLoading}
                  className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {sheetLoading ? 'Đang tải...' : 'Làm mới'}
                </button>
              </div>
            </div>

            {sheetError ? (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{sheetError}</p>
            ) : sheetMessage ? (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{sheetMessage}</p>
            ) : sheetLoading && sheetRows.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">Đang tải dữ liệu Spreadsheet...</p>
            ) : sheetHeaders.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">Tab tháng này chưa có dữ liệu.</p>
            ) : (
              <div className="w-full max-w-full max-h-[30rem] overflow-x-auto overflow-y-auto border border-slate-200 rounded-lg">
                <table className="min-w-max w-full text-xs text-left">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      {sheetHeaders.map((header, index) => (
                        <th key={`${header}-${index}`} className="px-3 py-2 font-semibold whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (sheetSortColumn === index) {
                                setSheetSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
                              } else {
                                setSheetSortColumn(index);
                                setSheetSortDirection('asc');
                              }
                            }}
                            className="hover:text-blue-700"
                          >
                            {header} {sheetSortColumn === index ? (sheetSortDirection === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSheetRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-slate-100 hover:bg-slate-50">
                        {sheetHeaders.map((header, columnIndex) => {
                          const value = String(row[columnIndex] ?? '');
                          const displayValue = isMoneyHeader(header) ? formatMoneyDisplay(value) : value;
                          const isDocumentLink = header.trim().toLowerCase() === 'chứng từ' && /^https?:\/\//i.test(value);
                          return (
                            <td key={columnIndex} className="px-3 py-2 whitespace-nowrap text-slate-700">
                              {isDocumentLink ? (
                                <a
                                  href={value}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 underline hover:text-blue-800"
                                >
                                  {value}
                                </a>
                              ) : displayValue}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sheetHasMore && !sheetError && (
              <button
                type="button"
                onClick={loadMoreSheetRows}
                disabled={sheetLoadingMore}
                className="w-full mt-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {sheetLoadingMore ? 'Đang tải thêm...' : 'Tải thêm 5 dòng'}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
