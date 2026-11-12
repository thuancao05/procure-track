import React, { useState, useEffect } from 'react';
import api from '../services/api';

// Kênh mua, SKU, Tên hàng hóa, Thanh toán được chọn từ danh mục (backend đọc từ Supabase)
const INITIAL_FORM = {
  ngay: '2026-01-01',
  kenhMua: '',
  maDonHang: '123',
  tenShop: 'Shop 1',
  sku: '',
  tenHangHoa: '',
  soLuong: '10',
  giaGoc: '100000',
  giaThucTra: '120000',
  phuongThucThanhToan: '',
  maVanDon: 'SPX123',
};

export default function HomeDashboard({ user, onLogout }) {
  const [formData, setFormData] = useState(INITIAL_FORM);

  // Danh mục từ backend (/api/lookups)
  const [products, setProducts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState('');

  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);
  const [spreadsheets, setSpreadsheets] = useState([]);
  
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        }
      } catch (error) {
        console.error("Không thể tải danh sách file Excel/Sheet:", error);
      } finally {
        setLoadingSheets(false);
      }
    }
    fetchSpreadsheetsInFolder();
  }, [selectedFolder]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
        data.append(key, formData[key]);
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

  const inputClass =
    "w-full px-3 py-3 sm:py-2 bg-white border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectClass = `${inputClass} disabled:bg-slate-100 disabled:text-slate-400`;
  const labelClass = "block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1";

  return (
    <div className="min-h-svh bg-slate-50 sm:py-8 sm:px-6 lg:px-8 font-sans text-slate-800 text-left">
      <div className="max-w-3xl mx-auto bg-white sm:rounded-2xl sm:shadow-lg sm:border border-slate-100">
        {/* Header */}
        <div className="bg-blue-600 px-4 py-4 sm:px-6 sm:py-5 text-white sm:rounded-t-2xl flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Quản Lý Nhập Hàng Hóa</h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1">Procure-Track • Chứng minh nguồn gốc hàng hóa pháp lý</p>
            <p className="text-blue-200 text-xs mt-1 truncate">👤 {user?.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 text-xs sm:text-sm font-medium bg-white/15 hover:bg-white/25 active:bg-white/30 px-3 py-2 rounded-lg"
          >
            Đăng xuất
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-5 sm:space-y-6">
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

            <div>
              <label className={labelClass}>Kênh mua</label>
              <select name="kenhMua" value={formData.kenhMua} onChange={handleChange} className={selectClass} required>
                <option value="">{lookupPlaceholder('-- Chọn kênh mua --', channels)}</option>
                {channels.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
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
              <select name="sku" value={formData.sku} onChange={handleProductChange} className={selectClass} required>
                <option value="">{lookupPlaceholder('-- Chọn SKU --', products)}</option>
                {products.map((p) => (
                  <option key={p.sku} value={p.sku}>{p.sku}</option>
                ))}
              </select>
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

            <div>
              <label className={labelClass}>Phương thức Thanh toán</label>
              <select name="phuongThucThanhToan" value={formData.phuongThucThanhToan} onChange={handleChange} className={selectClass} required>
                <option value="">{lookupPlaceholder('-- Chọn phương thức --', paymentMethods)}</option>
                {paymentMethods.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Giá gốc (VNĐ)</label>
              <input type="number" inputMode="numeric" min="0" name="giaGoc" value={formData.giaGoc} placeholder="0" onChange={handleChange} className={inputClass} required />
            </div>

            <div>
              <label className={labelClass}>Giá thực trả (VNĐ)</label>
              <input type="number" inputMode="numeric" min="0" name="giaThucTra" value={formData.giaThucTra} placeholder="0" onChange={handleChange} className={inputClass} required />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass}>Mã Vận đơn</label>
              <input type="text" name="maVanDon" autoCapitalize="characters" value={formData.maVanDon} placeholder="VD: SPXVN..." onChange={handleChange} className={inputClass} required />
            </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Hình ảnh chứng từ (Bill, nhãn SKU, kiện hàng - Chọn nhiều ảnh)
            </label>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={(e) => setImages(e.target.files)} 
              className="w-full min-w-0 px-3 py-3 sm:py-2 border border-dashed border-slate-300 rounded-lg text-sm bg-slate-50 file:mr-3 file:py-2 sm:file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm sm:file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {images.length > 0 && (
              <span className="text-xs font-medium text-blue-700 mt-1 block">
                ✅ Đã chọn {images.length} ảnh
              </span>
            )}
            <span className="text-xs text-slate-400 mt-1 block leading-relaxed">
              💡 Bạn có thể giữ phím Ctrl (hoặc Shift trên máy tính) hoặc chọn nhiều tệp trên điện thoại để tải lên một lúc tất cả các bill liên quan.
            </span>
          </div>
          </div>

          {/* Nút lưu: dính đáy màn hình trên mobile */}
          <div className="sticky bottom-0 z-10 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-slate-200 sm:static sm:mx-0 sm:p-0 sm:bg-transparent sm:border-0 sm:backdrop-blur-none">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-base py-3.5 sm:py-3 px-4 rounded-xl shadow transition duration-150 disabled:bg-blue-300"
            >
              {submitting ? "⏳ Đang xử lý tạo thư mục, ghi Sheet & tải ảnh..." : "💾 Lưu Đơn Hàng & Ghi Nhật Ký"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}