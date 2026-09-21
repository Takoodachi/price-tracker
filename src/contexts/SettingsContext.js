import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';
import { translations } from '../translations';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const SettingsContext = createContext();

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }) {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('app_mode') || 'dark';
  });
  
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('app_language') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_mode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  // --- Toggle Functions ---
  const toggleMode = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
  };

  // --- Theme Generation ---
  const theme = useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: '#61dafb' },
      background: { 
        default: mode === 'dark' ? '#282c34' : '#f5f5f5', 
        paper: mode === 'dark' ? '#33373e' : '#ffffff' 
      },
      text: { 
        primary: mode === 'dark' ? '#ffffff' : '#000000', 
        secondary: mode === 'dark' ? '#bbbbbb' : '#666666' 
      }
    },
  }), [mode]);

  // --- Translation Helper ---
  const t = (key) => {
    const selectedLang = translations[language] ? language : 'en';
    return translations[selectedLang][key] || key;
  };

  const value = {
    mode,
    toggleMode,
    language,
    changeLanguage,
    t
  };

  return (
    <SettingsContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </SettingsContext.Provider>
  );
}