import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function HomeDashboard() {
  const [formData, setFormData] = useState({
          ngay: '2026-01-01',
          kenhMua: 'Shopee',
          maDonHang: '123',
          tenShop: 'Shop 1',
          sku: 'SKU001',
          tenHangHoa: 'Pin 1',
          soLuong: '10',
          giaGoc: '100000',
          giaThucTra: '120000',
          phuongThucThanhToan: 'Chuyển khoản',
          maVanDon: 'SPX123',
  });

  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);
  const [spreadsheets, setSpreadsheets] = useState([]);
  
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState('');
  
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        setFormData({
          ngay: '2026-01-01',
          kenhMua: 'Shopee',
          maDonHang: '123',
          tenShop: 'Shop 1',
          sku: 'SKU001',
          tenHangHoa: 'Pin 1',
          soLuong: '10',
          giaGoc: '100000',
          giaThucTra: '120000',
          phuongThucThanhToan: 'Chuyển khoản',
          maVanDon: 'SPX123',
        });
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
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-5 text-white">
          <h1 className="text-2xl font-bold tracking-tight">Quản Lý Nhập Hàng Hóa</h1>
          <p className="text-blue-100 text-sm mt-1">Procure-Track • Chứng minh nguồn gốc hàng hóa pháp lý</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {/* 1. Chọn thư mục Drive */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                📂 1. Chọn thư mục gốc trên Google Drive:
              </label>
              <select 
                value={selectedFolder} 
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <p className="text-xs text-slate-500 mt-1">
                💡 Dữ liệu đơn hàng sẽ được tự động ghi vào Sheet (Tab) tương ứng với <b>Tháng/Năm</b> của ngày nhập hàng trong file này.
              </p>
            </div>
          </div>

          {/* Grid thông tin form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Ngày nhập</label>
              <input type="date" name="ngay" value={formData.ngay} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Kênh mua</label>
              <input type="text" name="kenhMua" value={formData.kenhMua} placeholder="Shopee, Lazada, Trực tiếp..." onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Mã đơn hàng</label>
              <input type="text" name="maDonHang" value={formData.maDonHang} placeholder="VD: DH123456" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Tên Shop</label>
              <input type="text" name="tenShop" value={formData.tenShop} placeholder="Tên nhà cung cấp / shop" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Mã SKU</label>
              <input type="text" name="sku" value={formData.sku} placeholder="VD: 18650-CELL-3000" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Tên hàng hóa</label>
              <input type="text" name="tenHangHoa" value={formData.tenHangHoa} placeholder="VD: Pin sạc 18650" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Số lượng</label>
              <input type="number" name="soLuong" value={formData.soLuong} placeholder="0" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Phương thức Thanh toán</label>
              <select name="phuongThucThanhToan" value={formData.phuongThucThanhToan} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="Chuyển khoản">Chuyển khoản</option>
                <option value="Tiền mặt">Tiền mặt</option>
                <option value="Thẻ tín dụng">Thẻ tín dụng</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Giá gốc (VNĐ)</label>
              <input type="number" name="giaGoc" value={formData.giaGoc} placeholder="0" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Giá thực trả (VNĐ)</label>
              <input type="number" name="giaThucTra" value={formData.giaThucTra} placeholder="0" onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Mã Vận đơn</label>
              <input type="text" name="maVanDon" value={formData.maVanDon} placeholder="VD: SPXVN..." onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" required />
            </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
              Hình ảnh chứng từ (Bill, nhãn SKU, kiện hàng - Chọn nhiều ảnh)
            </label>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={(e) => setImages(e.target.files)} 
              className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm bg-slate-50 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
            />
            <span className="text-xs text-slate-400 mt-1 block">
              💡 Bạn có thể giữ phím Ctrl (hoặc Shift trên máy tính) hoặc chọn nhiều tệp trên điện thoại để tải lên một lúc tất cả các bill liên quan.
            </span>
          </div>
          </div>

          <button 
            type="submit" 
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow transition duration-150 disabled:bg-blue-300"
          >
            {submitting ? "⏳ Đang xử lý tạo thư mục, ghi Sheet & tải ảnh..." : "💾 Lưu Đơn Hàng & Ghi Nhật Ký"}
          </button>
        </form>
      </div>
    </div>
  );
}