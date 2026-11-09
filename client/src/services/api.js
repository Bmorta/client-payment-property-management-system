import {expiredSessionToken} from '../utils/sessionRecovery.js';
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json"
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cpm_access_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(response=>response,error=>{
  if(error.response?.data?.maintenance?.path==='/database-maintenance')window.dispatchEvent(new CustomEvent('rems:backup-required',{detail:{message:error.response.data.message,maintenance:error.response.data.maintenance}}));
  const token=expiredSessionToken(error,localStorage.getItem('cpm_access_token'));
  if(token)window.dispatchEvent(new CustomEvent('cpm:session-expired',{detail:{token}}));
  // Never replay a financial mutation after a network/authentication failure.
  return Promise.reject(error);
});
export default api;
