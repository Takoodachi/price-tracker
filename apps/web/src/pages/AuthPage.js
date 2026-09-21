import React, { useState } from 'react';
import Login from '../components/Login';
import Register from '../components/Register';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import { motion, AnimatePresence } from 'framer-motion';

import { useSettings } from '../contexts/SettingsContext';

function AuthPage({ onLogin }) {
  const [showLogin, setShowLogin] = useState(true);
  const { language, changeLanguage } = useSettings();

  const toggleForm = () => {
    setShowLogin((prevShowLogin) => !prevShowLogin);
  };

  const formVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      marginTop: 8,
      gap: 2 
    }}>
      
      <ButtonGroup variant="text" aria-label="language selector">
        <Button 
          onClick={() => changeLanguage('en')}
          variant={language === 'en' ? 'contained' : 'text'}
        >
          English
        </Button>
        <Button 
          onClick={() => changeLanguage('vi')}
          variant={language === 'vi' ? 'contained' : 'text'}
        >
          Tiếng Việt
        </Button>
      </ButtonGroup>

      <AnimatePresence mode="wait">
        {showLogin ? (
          <motion.div
            key="login"
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Login onLogin={onLogin} onToggle={toggleForm} />
          </motion.div>
        ) : (
          <motion.div
            key="register"
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Register onToggle={toggleForm} />
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

export default AuthPage;