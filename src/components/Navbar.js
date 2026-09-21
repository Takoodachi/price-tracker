// src/components/Navbar.js
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';

// Import the hook
import { useSettings } from '../contexts/SettingsContext';

function Navbar({ isLoggedIn, onLogout }) {
  // Get the translator function
  const { t } = useSettings();

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography 
          variant="h6" 
          component={RouterLink}
          to="/"
          sx={{ flexGrow: 1, color: 'inherit', textDecoration: 'none' }}
        >
          {t('appTitle')}
        </Typography>

        {isLoggedIn ? (
          <Box>
            <Button color="inherit" component={RouterLink} to="/search">
              {t('search')}
            </Button>
            <Button color="inherit" component={RouterLink} to="/wishlist">
              {t('wishlist')}
            </Button>
            {/* New Settings Link */}
            <Button color="inherit" component={RouterLink} to="/settings">
              {t('settings')}
            </Button>
            <Button color="inherit" onClick={onLogout}>
              {t('logout')}
            </Button>
          </Box>
        ) : (
          <Box>
            <Button color="inherit" component={RouterLink} to="/auth">
              {t('login')}
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;