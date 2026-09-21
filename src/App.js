import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import AuthPage from './pages/AuthPage';
import SearchPage from './pages/SearchPage';
import WishlistPage from './pages/WishlistPage';
import SettingsPage from './pages/SettingsPage';

import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useSettings } from './contexts/SettingsContext';

function App() {
  const [token, setToken] = useState(null);

  const { changeLanguage } = useSettings();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) setToken(storedToken);
  }, []);

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    changeLanguage('en'); 
  };

  return (
    <>
      <Navbar isLoggedIn={!!token} onLogout={handleLogout} />

      <Container maxWidth="lg" sx={{ padding: 4 }}>
        <Routes>
          <Route path="/" element={token ? <Navigate to="/search" /> : <Navigate to="/auth" />} />
          <Route path="/auth" element={token ? <Navigate to="/search" /> : <AuthPage onLogin={handleLogin} />} />
          <Route path="/search" element={token ? <SearchPage /> : <Navigate to="/auth" />} />
          <Route path="/wishlist" element={token ? <WishlistPage /> : <Navigate to="/auth" />} />
          
          <Route 
            path="/settings" 
            element={token ? <SettingsPage /> : <Navigate to="/auth" />} 
          />

          <Route path="*" element={
            <Box sx={{textAlign: 'center', marginTop: 10}}>
              <Typography variant="h1">404</Typography>
            </Box>
          } />
        </Routes>
      </Container>
    </>
  );
}

export default App;