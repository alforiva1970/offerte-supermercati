import axios from 'axios';

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api/', // Using 127.0.0.1 to be explicit
});

// We'll add an interceptor to include the auth token in requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Token ${token}`; // Assuming we will use DRF's TokenAuthentication
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
