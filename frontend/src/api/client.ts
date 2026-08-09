import axios from "axios";

// Relative "/api" works in production behind nginx; VITE_API_URL overrides it
// for local dev where the frontend talks directly to the backend.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    console.error("API error:", err.response?.data ?? err.message);
    return Promise.reject(err);
  }
);

export default api;
