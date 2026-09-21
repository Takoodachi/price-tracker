import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Paper from '@mui/material/Paper';

import { useSettings } from '../contexts/SettingsContext';

function SettingsPage() {
  const { mode, toggleMode, language, changeLanguage, t } = useSettings();

  return (
    <Box sx={{ maxWidth: 600, margin: '0 auto', marginTop: 4 }}>
      <Typography variant="h4" gutterBottom>
        {t('settingsTitle')}
      </Typography>

      <Paper sx={{ padding: 3 }}>
        {/* Theme Toggle */}
        <Box sx={{ marginBottom: 3 }}>
          <FormControlLabel
            control={
              <Switch checked={mode === 'dark'} onChange={toggleMode} />
            }
            label={t('darkMode')}
          />
        </Box>

        {/* Language Select */}
        <Box>
          <FormControl fullWidth>
            <InputLabel id="language-select-label">{t('language')}</InputLabel>
            <Select
              labelId="language-select-label"
              value={language}
              label={t('language')}
              onChange={(e) => changeLanguage(e.target.value)}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="vi">Tiếng Việt</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>
    </Box>
  );
}

export default SettingsPage;