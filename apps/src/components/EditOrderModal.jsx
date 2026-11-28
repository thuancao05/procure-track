import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import Modal from './Modal';
import { useNotification } from './NotificationProvider';
import { inputClass, labelClass, selectClass } from '../ui';
import { compressImagesForUpload } from '../utils/imageCompression';

const formatMoney = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

export default function EditOrderModal({ order, spreadsheetId, sheetTitle, rowNumber, onClose, onSaved }) {
  const { showAlert, showConfirm } = useNotification();
  const [form, setForm] = useState(order);
  const [dateText, setDateText] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [compressingImages, setCompressingImages] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraMessage, setCameraMessage] = useState('');
  const [lookups, setLookups] = useState({ products: [], channels: [], payments: [], shops: [] });
  const [loading, setLoading] = useState(true);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let cancelled = false;
    const startCamera = async () => {
      try {
        setCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
          },
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
    let active = true;
    Promise.allSettled([
      api.get('/lookups'),
      api.get('/procure/edit', { params: { spreadsheetId, sheetTitle, rowNumber } }),
    ])
      .then(([lookupResult, orderResult]) => {
        if (!active) return;
        if (lookupResult.status === 'fulfilled') {
          const data = lookupResult.value.data;
          setLookups({
            products: data.products ?? [],
            channels: (data.kenhMua ?? []).map((item) => typeof item === 'string' ? { name: item } : item),
            payments: (data.phuongThucThanhToan ?? []).map((item) => typeof item === 'string' ? { name: item } : item),
            shops: data.shops ?? [],
          });
        }
        if (orderResult.status === 'rejected') {
          setError(orderResult.reason.response?.data?.error ?? 'Không thể tải thông tin đơn hàng.');
          return;
        }
        setForm(orderResult.value.data.row);
        setDateText(orderResult.value.data.row.ngay?.split('-').reverse().join('/') ?? '');
        setExistingImages(orderResult.value.data.images ?? []);
        setOrderLoaded(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [rowNumber, sheetTitle, spreadsheetId]);

  const channelNames = [...new Set([...lookups.channels.map((item) => item.name), form.kenhMua].filter(Boolean))];
  const paymentNames = [...new Set([...lookups.payments.map((item) => item.name), form.phuongThucThanhToan].filter(Boolean))];
  const productNames = [...new Set([...lookups.products.map((product) => product.tenHangHoa), form.tenHangHoa].filter(Boolean))];
  const shopNames = [...new Set([...lookups.shops, form.tenShop].filter(Boolean))];

  const setField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };
  const setMoney = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value.replace(/\D/g, '') }));
  const handleSkuChange = (event) => {
    const sku = event.target.value;
    const product = lookups.products.find((item) => item.sku.toLowerCase() === sku.trim().toLowerCase());
    setForm((current) => ({ ...current, sku, tenHangHoa: product?.tenHangHoa ?? '' }));
  };
  const handleProductChange = (event) => {
    const tenHangHoa = event.target.value;
    const product = lookups.products.find((item) => item.tenHangHoa === tenHangHoa);
    setForm((current) => ({ ...current, sku: product?.sku ?? current.sku, tenHangHoa }));
  };
  const addFiles = async (event) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
    if (files.length) {
      setCompressingImages(true);
      try {
        const compressedImages = await compressImagesForUpload(files);
        setNewImages((current) => [...current, ...compressedImages]);
      } catch (error) {
        console.error('Không thể xử lý ảnh:', error);
        setError('Không thể giảm một hoặc nhiều ảnh xuống dưới 200 KB. Vui lòng chọn ảnh khác.');
      } finally {
        setCompressingImages(false);
      }
    }
    event.target.value = '';
  };
  const captureCameraImage = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    let blob;
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (track && 'ImageCapture' in window) {
      try {
        blob = await new window.ImageCapture(track).takePhoto();
      } catch {
        // Fall back to the highest-resolution frame provided by the video stream.
      }
    }
    if (!blob) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    }
    if (!blob) return;
    const filename = `camera-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    const capturedImage = new File([blob], filename, { type: blob.type || 'image/jpeg' });
    setCompressingImages(true);
    try {
      const [optimizedImage] = await compressImagesForUpload([capturedImage]);
      setCameraMessage(`Đã chụp và tối ưu ảnh số ${existingImages.length + newImages.length + 1}.`);
      setNewImages((current) => [...current, optimizedImage]);
    } catch (error) {
      console.error('Không thể nén ảnh camera:', error);
      await showAlert('Không thể giảm ảnh xuống dưới 200 KB. Vui lòng chụp lại.', { variant: 'error' });
    } finally {
      setCompressingImages(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (existingImages.length + newImages.length === 0) {
      setError('Đơn hàng cần giữ lại hoặc tải lên ít nhất một ảnh chứng từ.');
      return;
    }
    setSaving(true);
    const payload = new FormData();
    payload.append('spreadsheetId', spreadsheetId);
    payload.append('sheetTitle', sheetTitle);
    payload.append('rowNumber', String(rowNumber));
    Object.entries(form).forEach(([key, value]) => payload.append(key, value ?? ''));
    payload.append('keepImageIds', JSON.stringify(existingImages.map((image) => image.id)));
    newImages.forEach((image) => payload.append('images', image));
    try {
      const { data } = await api.patch('/procure/edit', payload);
      await showAlert('Đã cập nhật đơn hàng, thư mục chứng từ và nhật ký nhập hàng.', { variant: 'success', title: 'Cập nhật thành công' });
      onSaved(data);
    } catch (requestError) {
      setError(requestError.response?.data?.error ?? 'Không thể cập nhật đơn hàng.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm('Xóa vĩnh viễn đơn hàng này, thư mục chứng từ và toàn bộ ảnh bên trong?', { variant: 'warning', title: 'Xác nhận xóa', confirmText: 'Xóa đơn hàng' });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await api.delete('/procure/edit', { data: { spreadsheetId, sheetTitle, rowNumber } });
      await showAlert('Đã xóa đơn hàng và chứng từ.', { variant: 'success', title: 'Đã xóa' });
      onSaved({ deleted: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error ?? 'Không thể xóa đơn hàng.');
    } finally { setDeleting(false); }
  };

  const displayDate = (isoDate) => isoDate ? isoDate.split('-').reverse().join('/') : '';
  const parseDisplayDate = (value) => {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return '';
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  };

  return (
    <Modal title="Chỉnh sửa đơn hàng" onClose={onClose} size="xl">
      {loading ? <p className="py-10 text-center text-sm text-slate-500">Đang tải thông tin đơn hàng và ảnh chứng từ...</p> : !orderLoaded ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error || 'Không thể tải thông tin đơn hàng.'}</p>
          <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Đóng</button></div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Ngày nhập</label>
              <input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" value={dateText} onChange={(event) => { setDateText(event.target.value); setForm((current) => ({ ...current, ngay: parseDisplayDate(event.target.value) })); }} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Tên shop</label>
              <input name="tenShop" list="edit-order-shop-options" autoComplete="off" value={form.tenShop ?? ''} onChange={setField} className={inputClass} required />
              <datalist id="edit-order-shop-options">{shopNames.map((name) => <option key={name} value={name} />)}</datalist>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Kênh mua</label>
              <div className="flex flex-wrap gap-2">
                {channelNames.map((name) => (
                  <label key={name} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${form.kenhMua === name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
                    <input type="radio" name="kenhMua" value={name} checked={form.kenhMua === name} onChange={setField} required className="accent-blue-600" />
                    <span className="text-sm">{name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Mã đơn hàng <span className="font-normal normal-case">(không bắt buộc)</span></label>
              <input name="maDonHang" value={form.maDonHang ?? ''} onChange={setField} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Mã vận đơn <span className="font-normal normal-case">(không bắt buộc)</span></label>
              <input name="maVanDon" value={form.maVanDon ?? ''} onChange={setField} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Mã SKU</label>
              <input name="sku" list="edit-order-sku-options" value={form.sku ?? ''} onChange={handleSkuChange} className={inputClass} required />
              <datalist id="edit-order-sku-options">{lookups.products.map((product) => <option key={product.sku} value={product.sku}>{product.tenHangHoa}</option>)}</datalist>
            </div>
            <div>
              <label className={labelClass}>Tên hàng hóa <span className="font-normal normal-case">(không bắt buộc)</span></label>
              <select name="tenHangHoa" value={form.tenHangHoa ?? ''} onChange={handleProductChange} className={selectClass}>
                <option value="">-- Chọn hàng hóa --</option>
                {productNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Số lượng</label>
              <input type="number" min="1" name="soLuong" value={form.soLuong ?? ''} onChange={setField} className={inputClass} required />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Phương thức thanh toán</label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Phương thức thanh toán">
                {paymentNames.map((name) => (
                  <label key={name} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${form.phuongThucThanhToan === name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
                    <input type="radio" name="phuongThucThanhToan" value={name} checked={form.phuongThucThanhToan === name} onChange={setField} required className="accent-blue-600" />
                    <span className="text-sm">{name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>Giá gốc (VNĐ)</label>
              <input inputMode="numeric" name="giaGoc" value={formatMoney(form.giaGoc)} onChange={setMoney} className={`${inputClass} text-left`} required />
            </div>
            <div>
              <label className={labelClass}>Giá thực trả (VNĐ)</label>
              <input inputMode="numeric" name="giaThucTra" value={formatMoney(form.giaThucTra)} onChange={setMoney} className={`${inputClass} text-left`} required />
            </div>
          </div>

          <section className="border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-semibold text-slate-800">Ảnh chứng từ</h3><p className="text-xs text-slate-500">Bấm dấu × để loại ảnh cũ; có thể thêm nhiều ảnh mới.</p></div>
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
                  + Chọn ảnh
                  <input type="file" accept="image/*,.heic,.heif" multiple onChange={addFiles} className="sr-only" />
                </label>
                <button type="button" onClick={() => { setCameraError(''); setCameraMessage(''); setCameraOpen(true); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">📷 Mở camera</button>
              </div>
            </div>
            {compressingImages && <p className="mt-2 text-xs font-medium text-blue-700">⏳ Đang tối ưu kích thước ảnh...</p>}
            {(existingImages.length + newImages.length > 0) && <p className="mt-2 text-xs font-medium text-blue-700">Đang có {existingImages.length + newImages.length} ảnh chứng từ.</p>}
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {existingImages.map((image) => (
                <EvidenceImage key={image.id} image={image} onRemove={() => setExistingImages((current) => current.filter((item) => item.id !== image.id))} />
              ))}
              {newImages.map((file, index) => (
                <NewEvidenceImage key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => setNewImages((current) => current.filter((_, imageIndex) => imageIndex !== index))} />
              ))}
            </div>
          </section>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleDelete} disabled={saving || deleting} className="mr-auto rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">{deleting ? 'Đang xóa...' : 'Xóa đơn hàng'}</button>
            <button type="button" onClick={onClose} disabled={saving || deleting} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Hủy</button>
            <button type="submit" disabled={saving || deleting || compressingImages} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Đang cập nhật...' : 'Lưu chỉnh sửa'}</button>
          </div>
        </form>
      )}
      {cameraOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label="Chụp ảnh chứng từ">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Chụp ảnh chứng từ</h3>
              <button type="button" onClick={() => setCameraOpen(false)} className="text-xl text-slate-500 hover:text-slate-800" aria-label="Đóng camera">×</button>
            </div>
            {cameraError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{cameraError}</p> : <video ref={videoRef} autoPlay playsInline className="mx-auto h-[60vh] w-auto max-w-full aspect-[9/16] rounded-xl bg-slate-900 object-cover" />}
            {cameraMessage && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">✅ {cameraMessage}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={captureCameraImage} disabled={Boolean(cameraError) || compressingImages} className="flex-1 rounded-lg bg-blue-600 py-3 font-medium text-white disabled:bg-slate-300">{compressingImages ? 'Đang tối ưu ảnh...' : 'Chụp ảnh'}</button>
              <button type="button" onClick={() => setCameraOpen(false)} className="rounded-lg border border-slate-300 px-4 py-3 text-slate-700">Xong</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Có thể chụp nhiều ảnh; ảnh sẽ được tải lên khi lưu đơn hàng.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NewEvidenceImage({ file, onRemove }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-blue-200 bg-slate-100">
      {url && <img src={url} alt={file.name} className="h-full w-full object-cover" />}
      <button type="button" onClick={onRemove} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white" aria-label={`Loại ảnh ${file.name}`}>×</button>
    </div>
  );
}

function EvidenceImage({ image, onRemove }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    api.get('/procure/edit/image', { params: { fileId: image.id }, responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.id]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {url ? <img src={url} alt={image.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-500">{image.name}</div>}
      <button type="button" onClick={onRemove} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white" aria-label={`Loại ảnh ${image.name}`}>×</button>
    </div>
  );
}
