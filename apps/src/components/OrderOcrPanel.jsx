import { useRef, useState } from 'react';
import api from '../services/api';
import Modal from './Modal';

async function compressImage(file) {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.filter = 'grayscale(1) contrast(1.2) brightness(1.05)';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

const fillTargets = [
  ['ngay', 'Ngày'],
  ['maDonHang', 'Mã đơn hàng'],
  ['tenShop', 'Tên shop'],
  ['sku', 'SKU'],
  ['soLuong', 'Số lượng'],
  ['giaGoc', 'Giá gốc'],
  ['giaThucTra', 'Giá thực trả'],
  ['maVanDon', 'Mã vận đơn'],
];

const cleanSelectedValue = (field, value) => {
  const text = value.trim();
  if (['soLuong', 'giaGoc', 'giaThucTra'].includes(field)) return text.replace(/[^\d]/g, '');
  if (field === 'ngay') {
    const iso = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const local = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  }
  return text;
};

export default function OrderOcrPanel({ onFill }) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState({ top: 8, left: 8 });
  const textareaRef = useRef(null);

  const openModal = () => {
    setOpen(true);
    setError('');
  };

  const closeModal = () => {
    if (!loading) setOpen(false);
  };

  const selectImage = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setImage(selected);
    setText('');
    setError('');
    setCopied(false);
    setSelectedText('');
    event.target.value = '';
  };

  const recognize = async () => {
    if (!image) return;
    setLoading(true);
    setError('');
    setText('');
    setCopied(false);
    try {
      const payload = new FormData();
      payload.append('file', await compressImage(image), 'ocr.jpg');
      const response = await api.post('/ocr', payload, { timeout: 60000 });
      setText(response.data.text ?? '');
    } catch (recognitionError) {
      setError(recognitionError.response?.data?.error ?? recognitionError.message ?? 'Không thể nhận diện phiếu nhập hàng.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.querySelector('[data-ocr-text]');
      textarea?.focus();
      textarea?.select();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleTextSelection = (event) => {
    const value = event.target.value.slice(event.target.selectionStart, event.target.selectionEnd).trim();
    setSelectedText(value);
    if (!value) return;
    const beforeSelection = event.target.value.slice(0, event.target.selectionStart);
    const lineCount = beforeSelection.split('\n').length - 1;
    const lastLine = beforeSelection.split('\n').at(-1) ?? '';
    const charsPerLine = Math.max(20, Math.floor((event.target.clientWidth - 24) / 8.4));
    const wrappedLines = Math.floor(lastLine.length / charsPerLine);
    const lineHeight = 24;
    const top = Math.min(event.target.clientHeight - 72, 8 + (lineCount + wrappedLines + 1) * lineHeight - event.target.scrollTop);
    setSelectionPosition({ top: Math.max(8, top), left: 8 });
  };

  const handleTextScroll = () => {
    if (textareaRef.current && selectedText) handleTextSelection({
      target: {
        value: textareaRef.current.value,
        selectionStart: textareaRef.current.selectionStart,
        selectionEnd: textareaRef.current.selectionEnd,
        clientWidth: textareaRef.current.clientWidth,
        clientHeight: textareaRef.current.clientHeight,
        scrollTop: textareaRef.current.scrollTop,
      },
    });
  };

  const fillField = (field) => {
    const value = cleanSelectedValue(field, selectedText);
    if (!value) return;
    onFill(field, value);
    setSelectedText('');
  };

  return (
    <>
      <div className="mb-3 flex justify-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={openModal} className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">OCR</button>
        </div>
      </div>

      {open && (
        <Modal title="Đọc phiếu bằng OCR.Space" onClose={closeModal} size="xl">
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-4">
              <label className="block text-sm font-semibold text-indigo-800">Chụp hoặc tải ảnh phiếu</label>
              <p className="mt-1 text-xs text-indigo-700">Ảnh sẽ được nén trước khi gửi OCR.Space. Trên điện thoại, nút này có thể mở camera.</p>
              <input type="file" accept="image/*" capture="environment" onChange={selectImage} className="mt-3 w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm" />
              {image && <p className="mt-2 text-xs text-slate-600">Đã chọn: {image.name}</p>}
              <button type="button" onClick={recognize} disabled={!image || loading} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {loading ? 'Đang đọc bằng OCR.Space...' : 'Đọc phiếu'}
              </button>
            </div>
            {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {text && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="ocr-text-result" className="text-sm font-semibold text-indigo-800">Văn bản OCR — chọn đoạn cần dùng rồi dán vào form</label>
                  <button type="button" onClick={copyText} className="rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">{copied ? 'Đã chép' : 'Chép toàn bộ'}</button>
                </div>
                <div className="relative">
                  <textarea ref={textareaRef} id="ocr-text-result" data-ocr-text value={text} readOnly rows={18} onSelect={handleTextSelection} onScroll={handleTextScroll} className="min-h-[28rem] w-full resize-y rounded-md border border-indigo-200 bg-white p-3 font-mono text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {selectedText && (
                    <div className="absolute z-10 max-w-[calc(100%-1rem)] rounded-lg border border-indigo-300 bg-white p-2 shadow-lg" style={{ top: selectionPosition.top, left: selectionPosition.left }}>
                      <p className="mb-2 max-w-full truncate text-xs font-medium text-slate-600">Đã chọn: “{selectedText}”</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fillTargets.map(([field, label]) => <button key={field} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => fillField(field)} className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{label}</button>)}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-indigo-700">Bôi đen phần cần dùng, nhấn Ctrl+C, sau đó dán vào ô tương ứng trong form.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
