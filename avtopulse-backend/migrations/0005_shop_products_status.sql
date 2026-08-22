ALTER TABLE avto444.shop_products
  ADD COLUMN status TEXT NOT NULL DEFAULT 'saytda' CHECK (status IN ('saytda', 'legv_edilib'));
