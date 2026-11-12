import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  timeout: 30000,
  // Gửi kèm cookie phiên đăng nhập (httpOnly, do backend quản lý)
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Phiên hết hạn / không hợp lệ -> báo cho App quay về màn hình đăng nhập
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? '';
    if (error.response?.status === 401 && !url.startsWith('/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default api;
