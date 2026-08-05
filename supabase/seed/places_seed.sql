-- supabase/seed/places_seed.sql — PawPi pet-friendly places DATA SEED (generated).
--
-- DATA seed, NOT a schema migration: it lives in supabase/seed/ so the integration harness
-- (which globs supabase/migrations/) never auto-applies it. Paste it into the Supabase SQL
-- editor — it runs as `postgres`, which bypasses the FORCE row-level security on `places`
-- (the table has a public-read policy and NO write policy, so only an admin/service role can
-- populate it — same reason a migration is hand-applied).
--
-- IDEMPOTENT + re-runnable: every row is an INSERT … ON CONFLICT (id) DO UPDATE, keyed on the
-- stable text id (osm-<type>-<id> / curated-<slug>). Re-running refreshes fields + updated_at;
-- it never duplicates and never resurrects a hidden/deleted row's deleted_at. Wrapped in a
-- transaction so it is all-or-nothing.
--
-- Sources: OpenStreetMap/Overpass (dog=yes venues + leisure=dog_park over CABA + Zona Norte)
-- and data/seed/places_curated.json (coord-less rows geocoded via OSM Nominatim; misses left
-- NULL — never fabricated). Regenerate with: node scripts/places/generate-seed-sql.mjs
--
-- Rows: 73 total (59 osm, 14 curated).

BEGIN;

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-1701185132', 'Oveja Negra', 'bar', 'Boulogne Sur Mer', 'Buenos Aires', 'Avenida Fondo de la Legua 425', -34.496972, -58.5464247, NULL, NULL, '+54 11 3437-1404', 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/1701185132', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-2199808670', 'Fiorire', 'restaurant', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', 'Avenida Cabildo 2802', -34.5562172, -58.462169, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/2199808670', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-2299698420', 'El Galpón de Tacuara', 'bar', NULL, 'Buenos Aires', 'Juramento 2781', -34.5639554, -58.4601758, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/2299698420', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-2588555369', 'Boutique de Pizzas', 'restaurant', NULL, 'Buenos Aires', NULL, -34.5532145, -58.466743, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/2588555369', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-2588555416', 'Tienda de Café', 'cafe', 'Saavedra', 'Buenos Aires', 'Avenida San Isidro Labrador 4408', -34.5441764, -58.4735682, 'https://www.tiendadecafe.com.ar', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/2588555416', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-2703556109', 'Fortín Salteño', 'restaurant', 'Saavedra', 'Buenos Aires', 'Avenida Cabildo 4702', -34.5414665, -58.4740832, 'https://www.fortinsalteño.com.ar', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/2703556109', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-2874895260', 'Bonafide', 'cafe', NULL, 'Buenos Aires', 'Avenida Cabildo 3614', -34.5499338, -58.4676909, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/2874895260', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-3345169569', 'Esquina Taki Bar', 'bar', 'Saavedra', 'Buenos Aires', 'Avenida García del Río 3003', -34.5495216, -58.47546, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/3345169569', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4319023517', 'Sudestada', 'restaurant', NULL, 'Buenos Aires', NULL, -34.5803377, -58.4321742, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4319023517', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4461102489', 'NOLA', 'restaurant', 'Palermo', 'Buenos Aires', 'Gorriti 4389', -34.5935319, -58.4250258, 'https://nolabuenosaires.com/', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4461102489', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4484621790', 'La panera rosa', 'cafe', NULL, 'Buenos Aires', NULL, -34.5890153, -58.4259162, 'https://www.lapanerarosa.com.ar', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4484621790', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4560930498', 'Cosi mi Piace', 'restaurant', 'Palermo', 'Buenos Aires', 'El Salvador 4618', -34.5900271, -58.4263541, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4560930498', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4613321055', 'Pizzería El Barba', 'restaurant', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', 'Avenida Lope de Vega 1302', -34.6276099, -58.5074934, NULL, NULL, '+54 11 4639-6363; +54 11 4639-6278', 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4613321055', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4621138848', 'Café Martínez', 'cafe', 'Núñez', 'Buenos Aires', 'Avenida Cabildo 3565', -34.5499173, -58.4671321, 'https://www.cafemartinez.com/', 'https://www.instagram.com/cafemartinezoficial/', '+54 11 4702-9938', 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4621138848', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4630611745', 'La Farolita de Beccar', 'restaurant', 'Beccar', 'Buenos Aires', 'Avenida Centenario 2000', -34.4604861, -58.5281536, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4630611745', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4635820178', 'Victorica', 'restaurant', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', NULL, -34.5848119, -58.4792846, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4635820178', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4650220293', 'Capra café', 'cafe', 'Olivos', 'Buenos Aires', 'Avenida Maipú 3101', -34.5071648, -58.492514, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4650220293', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4669685780', 'Ballesteros', 'restaurant', NULL, 'Buenos Aires', 'Valle Grande', -34.531522, -58.4994633, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4669685780', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4672215183', 'Forno Rosso', 'restaurant', NULL, 'Buenos Aires', 'Avenida Maipú 1777', -34.5211925, -58.4848751, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4672215183', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4678791275', 'Espresso Costa', 'cafe', NULL, 'Buenos Aires', 'Cosme Beccar 216', -34.4714357, -58.5137323, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4678791275', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-4744334235', 'Big Rabbit', 'cafe', NULL, 'Buenos Aires', 'Avenida Juramento 1717', -34.5582748, -58.4505785, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/4744334235', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-5517478084', 'Bastardo', 'restaurant', NULL, 'Buenos Aires', NULL, -34.5395635, -58.4670196, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/5517478084', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-6863797286', 'Desarmadero Bar', 'bar', 'Palermo', 'Buenos Aires', 'Gorriti 4295', -34.5941489, -58.42417, 'https://www.desarmadero.com.ar/', 'https://www.instagram.com/desarmaderobar', '+54 9 11 6737 6903', 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/6863797286', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-8581270600', 'Pibä', 'bar', NULL, 'Buenos Aires', 'Juramento 2702', -34.5638536, -58.4594513, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/8581270600', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-9548541621', 'Bartola', 'bar', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', 'Junín 1761', -34.5888041, -58.3923138, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/9548541621', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-9548541821', 'Electrica pizza', 'restaurant', 'Palermo', 'Buenos Aires', 'Julián Álvarez', -34.5943466, -58.4262239, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/9548541821', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-9762850719', 'Archivo', 'bar', NULL, 'Buenos Aires', 'Gorriti 4191', -34.5948058, -58.4235252, 'https://instagram.com/archivo.bar', 'https://www.instagram.com/benaventebar_', NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/9762850719', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-9943114940', 'Rock and Beer RNB', 'bar', 'Tigre', 'Buenos Aires', 'Enciso 1577', -34.4233469, -58.5806599, NULL, NULL, '+54 9 11 5808-2803', 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/9943114940', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-9971003002', 'ForestDan', 'bar', 'Olivos', 'Buenos Aires', 'Avenida del Libertador 2363', -34.5088144, -58.4789285, 'http://www.forestdan.com.ar/', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/9971003002', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-10093732617', 'Bucaré', 'bar', NULL, 'Buenos Aires', 'General José de San Martín 2800', -34.53166, -58.4993748, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/10093732617', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-10172644585', 'La Panera Rosa', 'cafe', NULL, 'Buenos Aires', NULL, -34.5916938, -58.4073431, 'https://www.google.com/url?q=https://www.lapanerarosa.com.ar/images/home/1/pdf0000.pdf&opi=79508299&sa=U&ved=0ahUKEwjVs5zfxd-DAxVJqpUCHXdCBpQQ61gIEygO&usg=', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/10172644585', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-10552812609', 'Borja', 'cafe', NULL, 'Buenos Aires', NULL, -34.5794936, -58.4153803, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/10552812609', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-10809922241', 'Cuervo', 'cafe', 'Belgrano', 'Buenos Aires', 'Juramento 1248', -34.5553464, -58.4452815, NULL, 'cuervocafe', NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/10809922241', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11086398405', 'Panera Rosa', 'cafe', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', 'Avenida Coronel Díaz 1699', -34.5919009, -58.4123262, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11086398405', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11261401009', 'Bulldog', 'restaurant', NULL, 'Buenos Aires', NULL, -34.4806997, -58.5063535, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11261401009', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11509016870', 'Toust', 'cafe', NULL, 'Buenos Aires', NULL, -34.5507926, -58.4742286, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11509016870', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11524591069', 'Temple Craft Hollywood', 'bar', NULL, 'Buenos Aires', 'Honduras 5602', -34.5841489, -58.4364031, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11524591069', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11688432238', 'Canil del Paseo Costero', 'park', NULL, 'Buenos Aires', NULL, -34.5182842, -58.4719849, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11688432238', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11794021031', 'La Tranquera', 'restaurant', NULL, 'Buenos Aires', 'Avenida Bartolomé Mitre 1209', -34.538502, -58.5071809, NULL, NULL, '+54 11 4730-0193', 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11794021031', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-11990763666', 'Preto coffee', 'cafe', NULL, 'Buenos Aires', NULL, -34.4718879, -58.5133572, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/11990763666', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-12327879101', 'Furia', 'cafe', NULL, 'Buenos Aires', 'Avenida Leopoldo Marechal 1002', -34.6063851, -58.4388219, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/12327879101', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-12334384030', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.4770371, -58.5262594, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/12334384030', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-12880943453', 'Betular', 'cafe', NULL, 'Buenos Aires', 'Mercedes 3900', -34.6012862, -58.5120575, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/12880943453', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-node-13316400170', 'La Romana', 'restaurant', NULL, 'Buenos Aires', NULL, -34.468392, -58.5026645, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/node/13316400170', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-448225746', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.6268719, -58.3879031, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/448225746', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-448427261', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.6325806, -58.4561822, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/448427261', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-451956963', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.6474944, -58.5139834, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/451956963', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-452358295', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.6429336, -58.5121745, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/452358295', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-457732872', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.5445651, -58.464747, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/457732872', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-462897369', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.575071, -58.4169656, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/462897369', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-464000314', 'Café Bar Don Martin', 'cafe', NULL, 'Buenos Aires', 'Diagonal Salta 801', -34.4917739, -58.5113329, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/464000314', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-473633239', 'Andy''s', 'restaurant', 'San Isidro', 'Buenos Aires', 'Avenida 25 de Mayo 272', -34.4694002, -58.5092865, 'https://andysbakeshop.com/', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/473633239', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-624134474', 'Temple', 'bar', 'Boulogne Sur Mer', 'Buenos Aires', 'Juan Segundo Fernández 20', -34.4919952, -58.5475215, NULL, 'https://www.instagram.com/templesanisidro', NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/624134474', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-907862638', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.6346597, -58.4634286, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/907862638', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-907871028', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.6679597, -58.4815783, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/907871028', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-1052448946', 'Bamboo Beer Garden', 'bar', 'Don Torcuato', 'Buenos Aires', 'Avenida Ángel Torcuato de Alvear 2526', -34.4887399, -58.6218633, 'https://www.instagram.com/bamboo.bg/', NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/1052448946', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-1354437670', 'Canil Parque La Isla de la Paternal', 'park', 'Ciudad Autónoma de Buenos Aires', 'Buenos Aires', 'Avenida Chorroarín 384', -34.5930701, -58.4757134, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/1354437670', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-way-1380648282', 'Canil Plaza 25 de Agosto', 'park', NULL, 'Buenos Aires', NULL, -34.580479, -58.4630646, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/way/1380648282', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('osm-relation-6791006', 'Canil', 'park', NULL, 'Buenos Aires', NULL, -34.5883942, -58.4254145, NULL, NULL, NULL, 'Fenced off-leash dog park (leisure=dog_park) in OpenStreetMap.', 'osm', 'https://www.openstreetmap.org/relation/6791006', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-soffice-pasteleria-san-isidro', 'Soffice Pastelería', 'bakery', 'San Isidro', 'Buenos Aires', 'Martín y Omar 242, San Isidro', -34.4710897, -58.511464, NULL, NULL, '011 4747-1576', 'Pets allowed in the front patio if they behave well.', 'curated', 'https://www.guiapetfriendly.com/item_detalle.php?id=47', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-suss-cupcake-cafe-san-isidro', 'Süss Cupcake Cafe', 'cafe', 'San Isidro', 'Buenos Aires', 'Paunero 2046, Martínez', -34.4876339, -58.4955608, 'http://www.susscupcakecafe.com.ar/', NULL, '4793-2553', 'Patio is the designated pet-friendly area; pets must behave.', 'curated', 'https://www.guiapetfriendly.com/item_detalle.php?id=317', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-plaza-castiglia-canil-san-isidro', 'Plaza Castiglia (canil)', 'park', 'San Isidro', 'Buenos Aires', 'Jacinto Díaz y Garibaldi, San Isidro', NULL, NULL, NULL, NULL, NULL, 'Municipal fenced off-leash dog area.', 'curated', 'https://www.sanisidro.gob.ar/caniles', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-oveja-negra-san-isidro', 'Oveja Negra', 'brewery', 'San Isidro', 'Buenos Aires', 'Av. Fondo de la Legua 425, Boulogne', -34.496972, -58.5464247, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'curated', 'https://www.openstreetmap.org/node/1701185132', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-la-farolita-de-beccar-san-isidro', 'La Farolita de Beccar', 'restaurant', 'San Isidro', 'Buenos Aires', 'Av. Centenario 2000, Beccar', -34.4604861, -58.5281536, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'curated', 'https://www.openstreetmap.org/node/4630611745', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-espresso-costa-san-isidro', 'Espresso Costa', 'cafe', 'San Isidro', 'Buenos Aires', 'Cosme Beccar 216, San Isidro', -34.4714357, -58.5137323, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'curated', 'https://www.openstreetmap.org/node/4678791275', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-andy-s-san-isidro', 'Andy''s', 'restaurant', 'San Isidro', 'Buenos Aires', 'Av. 25 de Mayo 272, San Isidro', -34.4694002, -58.5092865, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'curated', 'https://www.openstreetmap.org/way/473633239', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-temple-san-isidro', 'Temple', 'brewery', 'San Isidro', 'Buenos Aires', 'Juan Segundo Fernández 20, Boulogne', -34.4919952, -58.5475215, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap.', 'curated', 'https://www.openstreetmap.org/way/624134474', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-gluck-san-isidro', 'Glück', 'cafe', 'San Isidro', 'Buenos Aires', 'Av. Santa Fe 2835, Martínez', -34.4975495, -58.4980074, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap; likely cafe/pastry.', 'curated', 'https://www.openstreetmap.org/node/4660373376', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-cafe-bar-don-martin-san-isidro', 'Café Bar Don Martín', 'cafe', 'San Isidro', 'Buenos Aires', 'Diagonal Salta 801', -34.4917739, -58.5113329, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap; coords inside San Isidro partido.', 'curated', 'https://www.openstreetmap.org/way/464000314', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-la-romana-san-isidro', 'La Romana', 'restaurant', 'San Isidro', 'Buenos Aires', NULL, -34.468392, -58.5026645, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap; Acassuso/San Isidro area.', 'curated', 'https://www.openstreetmap.org/node/13316400170', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-preto-coffee-san-isidro', 'Preto Coffee', 'cafe', 'San Isidro', 'Buenos Aires', NULL, -34.4718879, -58.5133572, NULL, NULL, NULL, 'Tagged dog=yes in OpenStreetMap; San Isidro centro.', 'curated', 'https://www.openstreetmap.org/node/11990763666', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-canil-del-paseo-costero-san-isidro', 'Canil del Paseo Costero', 'park', 'San Isidro', 'Buenos Aires', 'Paseo Costero, San Isidro', -34.5182842, -58.4719849, NULL, NULL, NULL, 'Fenced dog park (leisure=dog_park) in OpenStreetMap.', 'curated', 'https://www.openstreetmap.org/node/11688432238', 'medium', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO places (id, name, category, neighborhood, city, address, lat, lng, website, instagram, phone, pet_friendly_note, source, source_url, confidence, status)
  VALUES ('curated-ibis-pilar-pilar', 'ibis Pilar', 'hotel', 'Pilar', 'Buenos Aires', 'Las Magnolias 533 (Panamericana km 50), Pilar', NULL, NULL, NULL, NULL, NULL, 'Accepts pets on request; surcharge may apply.', 'curated', 'https://es.planetofhotels.com/argentina/pilar/hotel-ibis-pilar', 'high', 'published')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    neighborhood = EXCLUDED.neighborhood,
    city = EXCLUDED.city,
    address = EXCLUDED.address,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    phone = EXCLUDED.phone,
    pet_friendly_note = EXCLUDED.pet_friendly_note,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    confidence = EXCLUDED.confidence,
    status = EXCLUDED.status,
    updated_at = now();

COMMIT;
