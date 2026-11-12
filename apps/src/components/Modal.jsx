import { useEffect } from 'react';

/** Hộp thoại: dạng bottom sheet trên mobile, căn giữa trên màn hình lớn. */
export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90svh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 text-xl"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>
        <div className="px-4 sm:px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
