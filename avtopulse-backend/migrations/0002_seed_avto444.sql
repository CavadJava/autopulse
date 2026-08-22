INSERT INTO avto444.shop (name, customer_id, title, details, work_times, password_hash)
VALUES (
  'avto444',
  1,
  'Avto 444',
  'Bakı şəhərində etibarlı avtosalon — yeni və işlənmiş avtomobillər.',
  'Hər gün 09:00–19:00',
  '$2a$10$X1AVNrDsT943u4hoY1CEgOEZEQ/3oApww8J2CxeK7bxz1ue50wRu2'
);

INSERT INTO avto444.shop_products (name, title, details, shop_id)
SELECT v.name, v.title, v.details, s.id
FROM avto444.shop s,
(VALUES
  ('bmw-320i', 'BMW 320i, 2020', 'Ağ rəng, avtomat sürət qutusu, 45000 km yürüş'),
  ('mercedes-e200', 'Mercedes-Benz E200, 2019', 'Qara rəng, tam dolğun, 62000 km yürüş'),
  ('toyota-camry', 'Toyota Camry, 2021', 'Gümüşü rəng, hibrid mühərrik, 30000 km yürüş'),
  ('hyundai-sonata', 'Hyundai Sonata, 2018', 'Ağ rəng, mexaniki sürət qutusu, 78000 km yürüş')
) AS v(name, title, details)
WHERE s.name = 'avto444';
