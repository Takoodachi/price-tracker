import React, { useState, useEffect, useMemo } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import Skeleton from '@mui/material/Skeleton';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import { useSettings } from '../contexts/SettingsContext';

function WishlistDrawer({ isOpen, onClose }) {
  const { t } = useSettings();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchWishlist();
    }
  }, [isOpen]);

  const fetchWishlist = async () => {
    setIsLoading(true);
    const token = localStorage.getItem('token');
    if (!token) {
      setMessage(t('loginReqWishlist'));
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch('http://localhost:5000/api/wishlist', {
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token }
      });
      const data = await response.json();
      if (response.ok) {
        setItems(data);
        if (data.length === 0) setMessage(t('emptyWishlistShort'));
        else setMessage('');
      } else {
        setMessage(data.error || 'Failed to fetch.');
      }
    } catch (err) {
      setMessage("Network error.");
    }
    setIsLoading(false);
  };
  
  const handleRemoveItem = async (asinToRemove) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:5000/api/wishlist/${asinToRemove}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      if (response.ok) {
        setItems(prevItems => 
          prevItems.filter(item => item.product_asin !== asinToRemove)
        );
      } else {
        alert('Failed to remove item.');
      }
    } catch (err) {
      alert('Network error.');
    }
  };

  const totalPrice = useMemo(() => {
    const total = items.reduce((acc, item) => acc + parseFloat(item.price || 0), 0);
    return total.toFixed(2);
  }, [items]);

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
    >
      <Box sx={{ width: 375, padding: 2 }} role="presentation">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <Typography variant="h5">
            {t('wishlistTitle')}
          </Typography>
          {!isLoading && items.length > 0 && (
            <Typography variant="h6" component="p">
              {t('total')}: ${totalPrice}
            </Typography>
          )}
        </Box>
        
        {message && <Typography sx={{ mb: 2 }}>{message}</Typography>}
        
        <List>
          {isLoading ? (
            Array.from(new Array(3)).map((_, index) => (
              <ListItem key={index}>
                <ListItemAvatar>
                  <Skeleton variant="circular" width={40} height={40} />
                </ListItemAvatar>
                <ListItemText
                  primary={<Skeleton variant="text" width="80%" />}
                  secondary={<Skeleton variant="text" width="40%" />}
                />
              </ListItem>
            ))
          ) : (
            items.map((item) => (
              <ListItem
                key={item.product_asin}
                secondaryAction={
                  <IconButton edge="end" aria-label="delete" onClick={() => handleRemoveItem(item.product_asin)}>
                    <DeleteIcon />
                  </IconButton>
                }
                sx={{paddingRight: '60px'}}
              >
                <ListItemAvatar>
                  <Avatar src={item.image_url} alt={item.name} />
                </ListItemAvatar>
                <ListItemText
                  primary={item.name}
                  secondary={`$${item.price}`}
                  primaryTypographyProps={{ 
                    noWrap: true, 
                    fontSize: 14,
                    fontWeight: 'medium'
                  }}
                />
                <IconButton 
                  edge="end" 
                  aria-label="visit"
                  href={`https://www.amazon.com/dp/${item.product_asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ position: 'absolute', right: 48 }}
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </ListItem>
            ))
          )}
        </List>
      </Box>
    </Drawer>
  );
}

export default WishlistDrawer;