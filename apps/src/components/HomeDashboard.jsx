import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../services/api';
import { inputClass, labelClass, selectClass } from '../ui';

// Kênh mua, SKU, Tên hàng hóa, Thanh toán được chọn từ danh mục (backend đọc từ Supabase)
const INITIAL_FORM = {
  ngay: '2026-01-01',
  kenhMua: '',
  maDonHang: '123',
  tenShop: 'Shop 1',
  sku: '',
  tenHangHoa: '',
  soLuong: '10',
  giaGoc: '100',
  giaThucTra: '120',
  phuongThucThanhToan: '',
  maVanDon: 'SPX123',
};

const formatThousandUnits = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

export default function HomeDashboard() {
  const [formData, setFormData] = useState(INITIAL_FORM);

  // Danh mục từ backend (/api/lookups)
  const [products, setProducts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState('');

  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrError, setQrError] = useState('');
  const nativeQrScannerEnabled = false;
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const qrVideoRef = useRef(null);
  const qrStreamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const previews = images.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImagePreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [images]);
  const [folders, setFolders] = useState([]);
  const [spreadsheets, setSpreadsheets] = useState([]);
  const [defaultSpreadsheetId, setDefaultSpreadsheetId] = useState('');
  
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
              setFormData((current) => ({ ...current, maVanDon: value }));
              setQrOpen(false);
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
  }, [qrOpen]);

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
            setFormData((current) => ({ ...current, maVanDon: decodedText.trim() }));
            stopped = true;
            setQrOpen(false);
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
  }, [qrOpen]);

  // 0. Tải danh mục Hàng hóa / Kênh mua / Phương thức thanh toán từ backend
  useEffect(() => {
    async function fetchLookups() {
      setLoadingLookups(true);
      try {
        const { data } = await api.get('/lookups');
        setProducts(data.products);
        setChannels(data.kenhMua);
        setPaymentMethods(data.phuongThucThanhToan);
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
          setSelectedFolder(response.data.defaultFolderId ?? '');
          setDefaultSpreadsheetId(response.data.defaultSpreadsheetId ?? '');
        }
      } catch (error) {
        console.error("Không thể tải danh sách thư mục Drive:", error);
      } finally {
        setLoadingFolders(false);
      }
    }
    fetchDriveFolders();
  }, []);

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
            return response.data.spreadsheets.some((sheet) => sheet.id === defaultSpreadsheetId)
              ? defaultSpreadsheetId
              : '';
          });
        }
      } catch (error) {
        console.error("Không thể tải danh sách file Excel/Sheet:", error);
      } finally {
        setLoadingSheets(false);
      }
    }
    fetchSpreadsheetsInFolder();
  }, [selectedFolder, defaultSpreadsheetId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleMoneyChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    setFormData({ ...formData, [e.target.name]: digits });
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
    setFormData({
      ...formData,
      sku: product?.sku ?? '',
      tenHangHoa: product?.tenHangHoa ?? '',
    });
  };

  const handleSkuChange = (e) => {
    const sku = e.target.value;
    const product = products.find((p) => p.sku.toLowerCase() === sku.trim().toLowerCase());
    setFormData({
      ...formData,
      sku,
      tenHangHoa: product?.tenHangHoa ?? '',
    });
  };

  const lookupPlaceholder = (emptyLabel, list) =>
    loadingLookups ? '⏳ Đang tải...' : list.length === 0 ? '-- Chưa có dữ liệu --' : emptyLabel;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.ngay) {
      alert("Vui lòng chọn ngày nhập hàng!");
      return;
    }

    if (!selectedSpreadsheet) {
      alert("Vui lòng chọn hoặc tạo file Google Spreadsheet đích để lưu dữ liệu nhật ký!");
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('parentFolderId', selectedFolder);
      data.append('spreadsheetId', selectedSpreadsheet); // Truyền ID file Sheet được chọn
      
      Object.keys(formData).forEach((key) => {
        const value = ['giaGoc', 'giaThucTra'].includes(key)
          ? String(Number(formData[key] || 0) * 1000)
          : formData[key];
        data.append(key, value);
      });

      for (let i = 0; i < images.length; i++) {
        data.append('images', images[i]);
      }

      const response = await api.post('/procure', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        alert(`${response.data.message}\nLink Drive:${response.data.linkChungTu}`);
        
        // Reset form sau khi lưu thành công
        setFormData(INITIAL_FORM);
        setImages([]);
      } else {
        alert("Lỗi: " + response.data.error);
      }
    } catch (error) {
      console.error("Lỗi khi gửi dữ liệu:", error);
      alert("Đã có lỗi xảy ra khi kết nối tới server.");
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
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                📂 1. Chọn thư mục gốc trên Google Drive:
              </label>
              <select 
                value={selectedFolder} 
                onChange={(e) => setSelectedFolder(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">{loadingFolders ? "⏳ Đang tải thư mục..." : "-- Chọn thư mục quản lý chính --"}</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    📁 {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Chọn file Google Spreadsheet nằm trong thư mục đó */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                📊 2. Chọn File Google Spreadsheet (Sổ nhật ký):
              </label>
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
            <div>
              <label className={labelClass}>Ngày nhập</label>
              <input type="date" name="ngay" value={formData.ngay} onChange={handleChange} className={inputClass} required />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Kênh mua</label>
              {loadingLookups ? (
                <p className="text-sm text-slate-500 py-2">Đang tải kênh mua...</p>
              ) : channels.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">Chưa có kênh mua.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="radiogroup" aria-label="Kênh mua">
                  {channels.map((name) => (
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
              <input type="text" name="maDonHang" autoCapitalize="characters" value={formData.maDonHang} placeholder="VD: DH123456" onChange={handleChange} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Tên Shop</label>
              <input type="text" name="tenShop" value={formData.tenShop} placeholder="Tên nhà cung cấp / shop" onChange={handleChange} className={inputClass} required />
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
              <select name="tenHangHoa" value={formData.tenHangHoa} onChange={handleProductChange} className={selectClass} required>
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

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-[auto_104px_104px] gap-4 items-end justify-start">
              <div>
                <label className={labelClass}>Phương thức thanh toán</label>
                {loadingLookups ? (
                <p className="text-sm text-slate-500 py-2">Đang tải phương thức thanh toán...</p>
                ) : paymentMethods.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">Chưa có phương thức thanh toán.</p>
                ) : (
                <div className="flex flex-nowrap items-center gap-2" role="radiogroup" aria-label="Phương thức thanh toán">
                  {paymentMethods.map((name) => (
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
              <div className="relative max-w-[104px]">
                <input type="text" inputMode="numeric" name="giaGoc" value={formatThousandUnits(formData.giaGoc)} placeholder="100" onChange={handleMoneyChange} className={`${inputClass} pr-14 text-right`} required />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">.000</span>
              </div>
            </div>

            <div>
              <label className={labelClass}>Giá thực trả</label>
              <div className="relative max-w-[104px]">
                <input type="text" inputMode="numeric" name="giaThucTra" value={formatThousandUnits(formData.giaThucTra)} placeholder="120" onChange={handleMoneyChange} className={`${inputClass} pr-14 text-right`} required />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">.000</span>
              </div>
            </div>

            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Mã Vận đơn</label>
              <div className="flex gap-2">
                <input type="text" name="maVanDon" autoCapitalize="characters" value={formData.maVanDon} placeholder="VD: SPXVN..." onChange={handleChange} className={`${inputClass} flex-1 min-w-0`} required />
                <button type="button" onClick={() => { setQrError(''); setQrOpen(true); }} className="shrink-0 px-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100" title="Quét mã QR">
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
          </div>

          {/* Nút lưu: dính đáy màn hình trên mobile */}
          {qrOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Quét mã QR">
              <div className="w-full max-w-lg bg-white rounded-2xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-slate-800">Quét mã QR vận đơn</h2>
                  <button type="button" onClick={() => setQrOpen(false)} className="text-slate-500 hover:text-slate-800 text-xl" aria-label="Đóng quét QR">×</button>
                </div>
                {qrError ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{qrError}</p>
                ) : (
                  <div id="qr-reader" className="w-full min-h-64 overflow-hidden rounded-xl bg-slate-900" />
                )}
                <p className="text-xs text-slate-500 mt-3">Đưa mã QR vào giữa khung hình; mã sẽ được điền tự động.</p>
                <button type="button" onClick={() => setQrOpen(false)} className="w-full mt-4 py-3 rounded-xl border border-slate-300 text-slate-700">Đóng</button>
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
      </div>
    </div>
  );
}
