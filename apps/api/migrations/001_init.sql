-- Schema overview
--
--   products       one row per real-world item ("PlayStation 5 Digital Edition")
--   listings       that item at one store, with the latest known price
--   price_history  append-only log of price/stock changes per listing
--   favorites      which users track which products (+ optional target price)
--
-- Money is always integer cents. NULL price = the store shows no price.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         citext NOT NULL UNIQUE,          -- case-insensitive: A@x.com == a@x.com
  password_hash text   NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL,
  brand        text,
  image_url    text,
  gtin         text UNIQUE,                      -- UPC/EAN, zero-padded to 14 digits
  shopping_key text UNIQUE,                      -- stable Google Shopping cluster id
  shopping_ref text,                             -- full Google Shopping id (needed to fetch offers)
  refreshed_at timestamptz,                      -- last full store-by-store price check
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source      text   NOT NULL,                   -- which integration produced it
  external_id text   NOT NULL,                   -- ASIN, Best Buy SKU, ...
  retailer    text   NOT NULL,                   -- store slug: amazon, walmart, ...
  title       text   NOT NULL,
  url         text   NOT NULL,
  image_url   text,
  condition   text   NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used', 'refurbished')),
  price_cents integer CHECK (price_cents > 0),
  currency    char(3) NOT NULL DEFAULT 'USD',
  in_stock    boolean,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  -- When the price was last confirmed by an exact lookup. Amazon search
  -- results can show a used-condition price, so they stay unverified until
  -- looked up by ASIN.
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
CREATE INDEX listings_product_id_idx ON listings (product_id);

-- Only written when price or stock changes (plus a daily heartbeat), so it
-- stays small. The primary key doubles as the index for "history of listing X".
-- If this ever reaches hundreds of millions of rows, partition it by month.
CREATE TABLE price_history (
  listing_id  bigint NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now(),
  price_cents integer,
  in_stock    boolean,
  PRIMARY KEY (listing_id, observed_at)
);

CREATE TABLE favorites (
  user_id            bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id         bigint NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price_cents integer CHECK (target_price_cents > 0),
  saved_price_cents  integer,                    -- best price when favorited
  alerted_at         timestamptz,                -- when the price last crossed below target
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)             -- also prevents duplicate favorites
);
CREATE INDEX favorites_product_id_idx ON favorites (product_id);
