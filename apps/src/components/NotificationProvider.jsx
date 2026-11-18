import { createContext, useCallback, useContext, useState } from 'react';
import Modal from './Modal';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const closeDialog = useCallback((result) => {
    setDialog((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  const showAlert = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'alert',
      title: options.title ?? (options.variant === 'error' ? 'Có lỗi xảy ra' : 'Thông báo'),
      message,
      variant: options.variant ?? 'info',
      resolve,
    });
  }), []);

  const showConfirm = useCallback((message, options = {}) => new Promise((resolve) => {
    setDialog({
      type: 'confirm',
      title: options.title ?? 'Xác nhận',
      message,
      variant: options.variant ?? 'warning',
      confirmText: options.confirmText ?? 'Xác nhận',
      resolve,
    });
  }), []);

  const icon = dialog?.variant === 'success' ? '✓' : dialog?.variant === 'error' ? '!' : dialog?.variant === 'warning' ? '?' : 'i';
  const iconClass = dialog?.variant === 'success'
    ? 'bg-green-100 text-green-700'
    : dialog?.variant === 'error'
      ? 'bg-red-100 text-red-700'
      : dialog?.variant === 'warning'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-blue-100 text-blue-700';

  return (
    <NotificationContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <Modal title={dialog.title} onClose={() => closeDialog(false)}>
          <div className="flex gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${iconClass}`} aria-hidden="true">
              {icon}
            </div>
            <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-6 text-slate-600">{dialog.message}</p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            {dialog.type === 'confirm' && (
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
            )}
            <button
              type="button"
              onClick={() => closeDialog(dialog.type === 'confirm' ? true : true)}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${dialog.variant === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {dialog.type === 'confirm' ? dialog.confirmText : 'Đã hiểu'}
            </button>
          </div>
        </Modal>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification phải được dùng bên trong NotificationProvider.');
  return context;
}
