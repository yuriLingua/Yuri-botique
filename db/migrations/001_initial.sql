CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  category text NOT NULL CHECK (category IN ('shoes', 'jewelry')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 3000),
  price integer CHECK (price IS NULL OR (price >= 0 AND price <= 100000000)),
  images jsonb NOT NULL CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) BETWEEN 1 AND 4),
  sizes text[] NOT NULL DEFAULT '{}' CHECK (cardinality(sizes) <= 30),
  available boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  image_url text NOT NULL,
  target_url text NOT NULL DEFAULT '',
  placement text NOT NULL CHECK (placement IN ('top', 'sidebar')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_catalog_order ON products (featured DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS products_category ON products (category);
CREATE INDEX IF NOT EXISTS ads_active_placement ON ads (active, placement, created_at DESC);
