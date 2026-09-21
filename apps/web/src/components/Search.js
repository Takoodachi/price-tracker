import React, { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import CardActions from '@mui/material/CardActions';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { useSettings } from '../contexts/SettingsContext'; // Import hook

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function Search() {
  const { t } = useSettings(); // Get translator
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  const pollForResults = async (jobId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("No token found");
      const response = await fetch(`http://localhost:5000/api/search-results/${jobId}`, {
        headers: { 'x-auth-token': token }
      });
      const data = await response.json();
      if (data.status === 'working') {
        await sleep(3000); 
        await pollForResults(jobId);
      } else if (data.status === 'finished') {
        setIsLoading(false);
        setMessage('');
        const productResults = data.results[0]?.content?.offers || [];
        setResults(productResults);
        if (productResults.length === 0) setMessage(t('noResults'));
      } else {
        throw new Error(data.error || `Job status unknown or failed: ${data.status}`);
      }
    } catch (err) {
      setIsLoading(false);
      setMessage(`Polling failed: ${err.message}`);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setResults([]); 
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage(t('loginReqSearch'));
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch(`http://localhost:5000/api/search?q=${query}`, {
        method: 'GET',
        headers: { 'x-auth-token': token }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start search job.');
      const { job_id } = data;
      if (!job_id) throw new Error("API did not return a job_id.");
      await pollForResults(job_id); 
    } catch (err) {
      setIsLoading(false);
      setMessage(`Search failed: ${err.message}`);
    }
  };
  
  const handleSaveItem = async (item) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch('http://localhost:5000/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          asin: item.asin,
          name: item.name,
          price: item.price,
          image: item.image
        })
      });
      const data = await response.json();
      if (response.ok) {
        setSnackbar({ open: true, message: t('itemSaved'), severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to save.', severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: 'Network error. Failed to save.', severity: 'error' });
    }
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  return (
    <Box>
      <Typography variant="h4" component="h2" gutterBottom>
        {t('searchTitle')}
      </Typography>
      <Box component="form" onSubmit={handleSearch} sx={{ display: 'flex', gap: 2, marginBottom: 2 }}>
        <TextField
          label={t('searchPlaceholder')}
          variant="outlined"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required
          disabled={isLoading}
          fullWidth
        />
        <Button 
          type="submit" 
          variant="contained" 
          disabled={isLoading}
          sx={{ minWidth: 120, height: 56 }}
        >
          {isLoading ? <CircularProgress size={24} /> : t('search')}
        </Button>
      </Box>

      {message && <Alert severity="info" sx={{mb: 2}}>{message}</Alert>}

      <Box sx={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 3 }}>
        {isLoading ? (
          Array.from(new Array(6)).map((_, index) => (
            <Card key={index}>
              <Skeleton variant="rectangular" height={200} />
              <CardContent>
                <Skeleton variant="text" height={60} />
                <Skeleton variant="text" width="60%" height={30} sx={{ marginBottom: 1 }} />
                <Skeleton variant="text" width="40%" />
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Skeleton variant="rectangular" width={100} height={36} />
                <Skeleton variant="rectangular" width={140} height={36} />
              </CardActions>
            </Card>
          ))
        ) : (
          results.map((item) => (
            <Card key={item.asin} sx={{ display: 'flex', flexDirection: 'column' }}>
              <CardMedia
                component="img"
                height="200"
                image={item.image}
                alt={item.name}
                sx={{ objectFit: 'contain', padding: 1 }}
              />
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography gutterBottom variant="h6" component="div" sx={{ 
                  height: 60, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', '-webkit-line-clamp': 2, '-webkit-box-orient': 'vertical'
                }}>
                  {item.name}
                </Typography>
                <Typography variant="h5" color="text.primary" sx={{ marginBottom: 1 }}>
                  ${item.price}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ASIN: {item.asin}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Button 
                  size="small" 
                  variant="outlined"
                  startIcon={<OpenInNewIcon />}
                  href={`https://www.amazon.com/dp/${item.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('visit')}
                </Button>
                <Button 
                  size="small" 
                  variant="contained" 
                  onClick={() => handleSaveItem(item)}
                >
                  {t('save')}
                </Button>
              </CardActions>
            </Card>
          ))
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Search;