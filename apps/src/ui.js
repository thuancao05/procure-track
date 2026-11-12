// Class Tailwind dùng chung cho form / nút (mobile-first: input 16px để iOS không zoom)
export const inputClass =
  'w-full px-3 py-3 sm:py-2 bg-white border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
export const selectClass = `${inputClass} disabled:bg-slate-100 disabled:text-slate-400`;
export const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-base sm:text-sm py-3 sm:py-2 px-4 rounded-lg shadow-sm transition disabled:bg-blue-300';
export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-base sm:text-sm py-3 sm:py-2 px-4 rounded-lg transition disabled:opacity-50';
export const dangerButtonClass =
  'inline-flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium text-base sm:text-sm py-3 sm:py-2 px-4 rounded-lg transition disabled:bg-red-300';
export const smallButtonClass =
  'inline-flex items-center justify-center text-sm font-medium px-3 py-2 sm:py-1.5 rounded-lg border transition disabled:opacity-50';

export const errorBoxClass = 'text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2';

/** Lấy thông báo lỗi từ response axios. */
export const apiError = (error, fallback = 'Đã có lỗi xảy ra khi kết nối tới server.') =>
  error?.response?.data?.error ?? fallback;
