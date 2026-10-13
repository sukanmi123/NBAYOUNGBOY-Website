CREATE TABLE IF NOT EXISTS admin_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  category TEXT NOT NULL DEFAULT 'Clothing' CHECK (category IN ('Clothing', 'Footwear')),
  color TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  image_index INTEGER NOT NULL,
  second_image_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hidden_products (
  product_id INTEGER PRIMARY KEY,
  hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
