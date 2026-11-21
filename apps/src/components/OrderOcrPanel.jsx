import { useState } from 'react';
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

export default function OrderOcrPanel() {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

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

  return (
    <>
      <div className="col-span-full mt-3 w-full rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-indigo-800">Nhập nhanh bằng OCR.Space</p>
            <p className="text-xs text-indigo-700">Mở cửa sổ OCR để chụp hoặc tải ảnh phiếu, sau đó copy văn bản cần dùng.</p>
          </div>
          <button type="button" onClick={openModal} className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">Mở OCR</button>
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
                <textarea id="ocr-text-result" data-ocr-text value={text} readOnly rows={18} className="min-h-[28rem] w-full resize-y rounded-md border border-indigo-200 bg-white p-3 font-mono text-sm leading-6 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <p className="text-xs text-indigo-700">Bôi đen phần cần dùng, nhấn Ctrl+C, sau đó dán vào ô tương ứng trong form.</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
