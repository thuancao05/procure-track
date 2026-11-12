import { useEffect, useState } from 'react';
import HomeDashboard from './components/HomeDashboard';
import Login from './components/Login';
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

  return user
    ? <HomeDashboard user={user} onLogout={handleLogout} />
    : <Login onLogin={setUser} />;
}

export default App;
