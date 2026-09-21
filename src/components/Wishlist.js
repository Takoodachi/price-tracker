import React, { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import CardActions from '@mui/material/CardActions';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { useSettings } from '../contexts/SettingsContext';

function Wishlist() {
  const { t } = useSettings();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWishlist = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setMessage(t('loginReqWishlist'));
        setIsLoading(false); 
        return;
      }
      try {
        const response = await fetch('http://localhost:5000/api/wishlist', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'x-auth-token': token }
        });
        const data = await response.json();
        if (response.ok) {
          setItems(data);
          if (data.length === 0) {
            setMessage(t('emptyWishlistMsg'));
          } else {
            setMessage('');
          }
        } else {
          setMessage(data.error || 'Failed to fetch wishlist.');
        }
      } catch (err) {
        setMessage("A network error occurred.");
      }
      setIsLoading(false);
    };
    fetchWishlist();
  }, [t]);

  const handleRemoveItem = async (asinToRemove) => {
    setMessage(t('processing'));
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/wishlist/${asinToRemove}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(t('itemRemoved'));
        setItems(prevItems => 
          prevItems.filter(item => item.product_asin !== asinToRemove)
        );
      } else {
        setMessage(data.error || 'Failed to remove item.');
      }
    } catch (err) {
      setMessage('Network error. Failed to remove.');
    }
  };

  const totalPrice = useMemo(() => {
    const total = items.reduce((acc, item) => acc + parseFloat(item.price || 0), 0);
    return total.toFixed(2);
  }, [items]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h2" gutterBottom>
          {t('wishlistTitle')}
        </Typography>
        {!isLoading && items.length > 0 && (
          <Typography variant="h5" component="p">
            {t('total')}: ${totalPrice}
          </Typography>
        )}
      </Box>
      
      {message && <Alert severity="info" sx={{ marginBottom: 2 }}>{message}</Alert>}

      <Box sx={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 3 }}>
        {isLoading ? (
          Array.from(new Array(3)).map((_, index) => (
            <Card key={index}>
              <Skeleton variant="rectangular" height={200} />
              <CardContent>
                <Skeleton variant="text" height={60} />
                <Skeleton variant="text" width="60%" height={30} sx={{ marginBottom: 1 }} />
                <Skeleton variant="text" width="40%" />
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Skeleton variant="rectangular" width={100} height={36} />
                <Skeleton variant="rectangular" width={100} height={36} />
              </CardActions>
            </Card>
          ))
        ) : (
          items.map((item) => (
            <Card key={item.product_asin} sx={{ display: 'flex', flexDirection: 'column' }}>
              <CardMedia
                component="img"
                height="200"
                image={item.image_url}
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
                  ASIN: {item.product_asin}
                </Typography>
              </CardContent>
              <CardActions sx={{ justifyContent: 'space-between' }}>
                <Button 
                  size="small" 
                  variant="outlined"
                  startIcon={<OpenInNewIcon />}
                  href={`https://www.amazon.com/dp/${item.product_asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('visit')}
                </Button>
                <Button 
                  size="small" 
                  variant="outlined" 
                  color="error"
                  onClick={() => handleRemoveItem(item.product_asin)}
                >
                  {t('remove')}
                </Button>
              </CardActions>
            </Card>
          ))
        )}
      </Box>
    </Box>
  );
}

export default Wishlist;