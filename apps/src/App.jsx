import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomeDashboard from './components/HomeDashboard';
import Layout from './components/Layout';
import LookupManager from './components/LookupManager';
import Login from './components/Login';
import UsersPage from './pages/UsersPage';
import { LOOKUP_CONFIGS } from './pages/lookupConfigs';
import api, { UNAUTHORIZED_EVENT } from './services/api';

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {

    // Kiểm tra phiên hiện tại (cookie) với backend
    api.get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));

    const handleUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  };

  if (checkingSession) {
    return <div className="min-h-svh flex items-center justify-center text-sm text-slate-500">⏳ Đang tải...</div>;
  }

  if (!user) return <Login onLogin={setUser} />;

  const isAdmin = user.role === 'admin';
  // Trang quản trị: chỉ admin; người khác quay về trang nhập hàng
  const adminOnly = (element) => (isAdmin ? element : <Navigate to="/" replace />);

  return (
    <Routes>
      <Route element={<Layout user={user} onLogout={handleLogout} />}>
        <Route index element={<HomeDashboard />} />
        <Route
          path="admin/products"
          element={adminOnly(<LookupManager key="products" config={LOOKUP_CONFIGS.products} />)}
        />
        <Route
          path="admin/purchase-channels"
          element={adminOnly(<LookupManager key="purchase-channels" config={LOOKUP_CONFIGS.purchaseChannels} />)}
        />
        <Route
          path="admin/payment-methods"
          element={adminOnly(<LookupManager key="payment-methods" config={LOOKUP_CONFIGS.paymentMethods} />)}
        />
        <Route path="admin/users" element={adminOnly(<UsersPage currentUser={user} />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
