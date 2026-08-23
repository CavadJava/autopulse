ALTER TABLE avto444.shop ADD COLUMN email TEXT;

UPDATE avto444.shop SET email = 'avto444@autopulse.local' WHERE name = 'avto444';

ALTER TABLE avto444.shop ALTER COLUMN email SET NOT NULL;
ALTER TABLE avto444.shop ADD CONSTRAINT shop_email_unique UNIQUE (email);
