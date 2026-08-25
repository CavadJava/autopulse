-- migrations/0014_seller_name_unique.sql
ALTER TABLE avto444.sellers ADD CONSTRAINT sellers_name_unique UNIQUE (name);
