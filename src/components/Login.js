import React, { useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

import { useSettings } from '../contexts/SettingsContext';

function Login({ onLogin, onToggle }) {
  const { t } = useSettings();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const response = await fetch('http://localhost:5000/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        onLogin(data.token);
      } else {
        setMessage(data.error || t('loginFailed'));
      }
    } catch (err) {
      console.error('Network error:', err);
      setMessage(t('networkError'));
    }
  };

  return (
    <Box 
      component="form" 
      onSubmit={handleSubmit} 
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 3,
        border: '1px solid #555',
        borderRadius: 2,
        width: 350,
        backgroundColor: 'background.paper'
      }}
    >
      <Typography variant="h5" component="h2" sx={{ textAlign: 'center' }}>
        {t('loginTitle')}
      </Typography>
      
      <TextField
        type="email"
        label={t('email')} 
        variant="outlined"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        type="password"
        label={t('password')} 
        variant="outlined"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      
      <Button type="submit" variant="contained">
        {t('loginButton')}
      </Button>
      
      {message && (
        <Typography color="error.main" sx={{ textAlign: 'center' }}>
          {message}
        </Typography>
      )}

      <Link 
        component="button" 
        type="button" 
        onClick={onToggle}
        sx={{ mt: 1, textAlign: 'center', cursor: 'pointer' }}
      >
        {t('dontHaveAccount')}
      </Link>
    </Box>
  );
}

export default Login;