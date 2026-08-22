ALTER TABLE avto444.shop_product_images RENAME COLUMN url TO minio_url;
ALTER TABLE avto444.shop_product_images ADD COLUMN s3_url TEXT;
