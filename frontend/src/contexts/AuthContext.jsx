import React, { createContext, useState, useContext, useEffect } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await api.get('/current-user/');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user', error);
      // If fetching user fails, the token is likely invalid, so log out
      logout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Token ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const response = await api.post('/api-token-auth/', { username, password });
      const receivedToken = response.data.token;

      localStorage.setItem('authToken', receivedToken);
      setToken(receivedToken);
      api.defaults.headers.common['Authorization'] = `Token ${receivedToken}`;

      // After setting the token, fetch the user details
      await fetchUser();
      return true;

    } catch (error) {
      console.error('Login failed', error);
      logout(); // Ensure everything is cleaned up on failure
      return false;
    } finally {
        setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setToken(null);
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
    // No need for navigate here, the protected route will handle it.
  };

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
