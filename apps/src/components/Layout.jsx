import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

// Menu theo nhóm. `defaultOpen`: nhóm mở sẵn khi chưa có lựa chọn của người dùng.
const NAV_GROUPS = [
  {
    id: 'nhap-hang',
    label: 'Nhập hàng',
    icon: '📝',
    defaultOpen: true,
    items: [{ to: '/', label: 'Phiếu nhập hàng', icon: '🧾', end: true }],
  },
  {
    id: 'quan-tri',
    label: 'Quản trị',
    icon: '⚙️',
    admin: true,
    defaultOpen: false,
    items: [
      { to: '/admin/products', label: 'Hàng hóa', icon: '📦' },
      { to: '/admin/purchase-channels', label: 'Kênh mua', icon: '🛒' },
      { to: '/admin/payment-methods', label: 'Thanh toán', icon: '💳' },
      { to: '/admin/users', label: 'Người dùng', icon: '👤' },
    ],
  },
];

const STORAGE_KEY = 'pt-nav-state';

// localStorage có thể bị chặn (chế độ riêng tư...) -> luôn bọc try/catch
function readNavState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}
function writeNavState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* bỏ qua */
  }
}

const isItemActive = (item, pathname) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);

export default function Layout({ user, onLogout }) {
  const { pathname } = useLocation();
  const [navState, setNavState] = useState(readNavState);
  const [mobileOpen, setMobileOpen] = useState(false);

  const collapsed = Boolean(navState.collapsed); // desktop: thu gọn còn cột icon
  const groups = NAV_GROUPS.filter((g) => !g.admin || user.role === 'admin');

  const updateNav = (patch) => {
    setNavState((prev) => {
      const next = { ...prev, ...patch };
      writeNavState(next);
      return next;
    });
  };

  const isGroupOpen = (group) =>
    navState.groups?.[group.id] ??
    (group.defaultOpen || group.items.some((item) => isItemActive(item, pathname)));

  const toggleGroup = (group) =>
    updateNav({ groups: { ...navState.groups, [group.id]: !isGroupOpen(group) } });

  const handleMenuButton = () => {
    // Mobile (< lg): mở/đóng drawer. Desktop: mở rộng/thu gọn sidebar.
    if (window.matchMedia('(min-width: 1024px)').matches) {
      updateNav({ collapsed: !collapsed });
    } else {
      setMobileOpen((open) => !open);
    }
  };

  const closeMobile = () => setMobileOpen(false);

  const linkClass = ({ isActive }, compact) =>
    `flex items-center gap-3 rounded-lg text-sm font-medium transition ${
      compact ? 'justify-center w-10 h-10 mx-auto' : 'px-3 py-2.5'
    } ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;

  /** Nội dung menu. `compact` = chế độ thu gọn (chỉ icon) trên desktop. */
  const renderNav = (compact) => (
    <nav className={`flex flex-col gap-1 ${compact ? 'px-2' : 'px-3'} py-3`} aria-label="Điều hướng chính">
      {groups.map((group) => {
        if (compact) {
          // Thu gọn: hiện thẳng các mục dạng icon, ngăn cách giữa các nhóm
          return (
            <div key={group.id} className="flex flex-col gap-1 pb-2 mb-1 border-b border-slate-100 last:border-0">
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} title={item.label} aria-label={item.label} className={(s) => linkClass(s, true)}>
                  <span className="text-lg leading-none">{item.icon}</span>
                </NavLink>
              ))}
            </div>
          );
        }

        const open = isGroupOpen(group);
        const groupActive = group.items.some((item) => isItemActive(item, pathname));
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              aria-expanded={open}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition hover:bg-slate-100 ${
                groupActive && !open ? 'text-blue-700' : 'text-slate-800'
              }`}
            >
              <span className="text-base leading-none">{group.icon}</span>
              <span className="flex-1 text-left">{group.label}</span>
              <svg
                className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M7.2 14.8a.75.75 0 0 1 0-1.06L10.94 10 7.2 6.26a.75.75 0 1 1 1.06-1.06l4.27 4.27a.75.75 0 0 1 0 1.06L8.26 14.8a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>

            {open && (
              <div className="mt-0.5 ml-4 pl-2 border-l border-slate-200 flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMobile} className={(s) => linkClass(s, false)}>
                    <span className="text-base leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-svh bg-slate-50 font-sans text-slate-800 text-left">
      {/* Thanh trên cùng */}
      <header className="bg-white/90 backdrop-blur text-slate-800 sticky top-0 z-30 border-b border-slate-200">
        <div className="h-14 px-2 sm:px-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleMenuButton}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 active:bg-slate-200"
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            title="Menu"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <p className="text-base font-bold tracking-tight leading-tight text-slate-800 truncate">Ghi Nhận Đơn Hàng</p>
              <p className="text-slate-500 text-xs truncate">
                {user.email}
                {user.role === 'admin' && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-semibold uppercase">admin</span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 text-xs sm:text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-800 active:bg-slate-100 px-3 py-2 rounded-lg"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar desktop: mở rộng / thu gọn */}
        <aside
          className={`hidden lg:block shrink-0 sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto bg-white border-r border-slate-200 transition-[width] duration-200 ${
            collapsed ? 'w-16' : 'w-60'
          }`}
        >
          {renderNav(collapsed)}
        </aside>

        {/* Drawer mobile */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-slate-900/40" onClick={closeMobile} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <div className="h-14 px-4 flex items-center justify-between border-b border-slate-100">
                <p className="font-bold text-slate-800">Menu</p>
                <button
                  type="button"
                  onClick={closeMobile}
                  className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 text-xl"
                  aria-label="Đóng menu"
                >
                  ×
                </button>
              </div>
              {renderNav(false)}
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 sm:px-6 sm:py-6">
          <div className="max-w-5xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
