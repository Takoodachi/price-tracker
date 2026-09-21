import React, { useState } from 'react';
import Search from '../components/Search';
import WishlistDrawer from '../components/WishlistDrawer';
import Fab from '@mui/material/Fab';
import FavoriteIcon from '@mui/icons-material/Favorite';

function SearchPage() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <Search />
      
      <Fab
        color="primary"
        aria-label="wishlist"
        onClick={() => setIsDrawerOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
        }}
      >
        <FavoriteIcon />
      </Fab>

      <WishlistDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </>
  );
}

export default SearchPage;