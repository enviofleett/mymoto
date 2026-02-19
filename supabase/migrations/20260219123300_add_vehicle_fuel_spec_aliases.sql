-- Add compatibility alias keys to maximize matches with existing vehicle model strings.
WITH alias_map AS (
  SELECT *
  FROM (VALUES
    -- Toyota aliases (legacy short forms)
    ('toyota|corolla cross', 'toyota|corolla cross 1.8l petrol', 'Toyota', 'Corolla Cross', 'Alias: Corolla Cross'),
    ('toyota|rav4', 'toyota|rav4 hybrid 2.5l', 'Toyota', 'RAV4', 'Alias: RAV4'),
    ('toyota|avanza', 'toyota|avanza 1.5l petrol', 'Toyota', 'Avanza', 'Alias: Avanza'),
    ('toyota|hilux 2.4 gd-6', 'toyota|hilux 2.4l gd-6 diesel', 'Toyota', 'Hilux 2.4 GD-6', 'Alias: Hilux 2.4 GD-6'),
    ('toyota|hilux 2.8 gd-6', 'toyota|hilux 2.8l gd-6 diesel', 'Toyota', 'Hilux 2.8 GD-6', 'Alias: Hilux 2.8 GD-6'),
    ('toyota|fortuner 2.4 gd-6', 'toyota|fortuner 2.4l gd-6 diesel', 'Toyota', 'Fortuner 2.4 GD-6', 'Alias: Fortuner 2.4 GD-6'),
    ('toyota|fortuner 2.8 gd-6', 'toyota|fortuner 2.8l gd-6 diesel', 'Toyota', 'Fortuner 2.8 GD-6', 'Alias: Fortuner 2.8 GD-6'),
    ('toyota|land cruiser prado 2.8 d-4d', 'toyota|land cruiser prado 2.8l d-4d diesel', 'Toyota', 'Land Cruiser Prado 2.8 D-4D', 'Alias: Land Cruiser Prado 2.8 D-4D'),
    ('toyota|land cruiser 300 3.5 v6', 'toyota|land cruiser 300 3.5l v6 twin-turbo petrol', 'Toyota', 'Land Cruiser 300 3.5 V6', 'Alias: Land Cruiser 300 3.5 V6'),
    ('toyota|land cruiser 79 4.5 v8', 'toyota|land cruiser 79 4.5l v8 diesel', 'Toyota', 'Land Cruiser 79 4.5 V8', 'Alias: Land Cruiser 79 4.5 V8'),
    ('toyota|hiace 2.5 d-4d', 'toyota|hiace 2.5l d-4d diesel', 'Toyota', 'Hiace 2.5 D-4D', 'Alias: Hiace 2.5 D-4D'),

    -- Lexus aliases (legacy short forms)
    ('lexus|lx570', 'lexus|lx 570 5.7l v8 petrol', 'Lexus', 'LX570', 'Alias: LX570'),
    ('lexus|rx350', 'lexus|rx 350 3.5l v6 petrol', 'Lexus', 'RX350', 'Alias: RX350'),
    ('lexus|rx450h', 'lexus|rx 450h 3.5l hybrid', 'Lexus', 'RX450h', 'Alias: RX450h'),
    ('lexus|es350', 'lexus|es 350 3.5l v6 petrol', 'Lexus', 'ES350', 'Alias: ES350'),
    ('lexus|gx460', 'lexus|gx 460 4.6l v8 petrol', 'Lexus', 'GX460', 'Alias: GX460'),

    -- Mercedes-Benz aliases (legacy short forms)
    ('mercedes-benz|a200', 'mercedes-benz|a 200 1.3t petrol', 'Mercedes-Benz', 'A200', 'Alias: A200'),
    ('mercedes-benz|c200', 'mercedes-benz|c 200 1.5t petrol', 'Mercedes-Benz', 'C200', 'Alias: C200'),
    ('mercedes-benz|e220d', 'mercedes-benz|e 220d 2.0 diesel', 'Mercedes-Benz', 'E220d', 'Alias: E220d'),
    ('mercedes-benz|s350d', 'mercedes-benz|s 350d 2.9 diesel', 'Mercedes-Benz', 'S350d', 'Alias: S350d'),
    ('mercedes-benz|glc 220d', 'mercedes-benz|glc 220d 2.0 diesel', 'Mercedes-Benz', 'GLC 220d', 'Alias: GLC 220d'),
    ('mercedes-benz|gle 300d', 'mercedes-benz|gle 300d 2.0 diesel', 'Mercedes-Benz', 'GLE 300d', 'Alias: GLE 300d'),
    ('mercedes-benz|vito 116 cdi', 'mercedes-benz|vito 116 cdi 2.0 diesel', 'Mercedes-Benz', 'Vito 116 CDI', 'Alias: Vito 116 CDI'),
    ('mercedes-benz|sprinter 316 cdi', 'mercedes-benz|316 cdi 2.7l diesel', 'Mercedes-Benz', 'Sprinter 316 CDI', 'Alias: Sprinter 316 CDI'),

    -- Honda aliases (legacy short forms)
    ('honda|accord 2.0', 'honda|accord 2.0l petrol', 'Honda', 'Accord 2.0', 'Alias: Accord 2.0'),
    ('honda|civic 1.8', 'honda|civic 1.8l petrol', 'Honda', 'Civic 1.8', 'Alias: Civic 1.8'),
    ('honda|cr-v 2.0', 'honda|cr-v 2.0l petrol', 'Honda', 'CR-V 2.0', 'Alias: CR-V 2.0'),
    ('honda|hr-v 1.8', 'honda|hr-v 1.8l petrol', 'Honda', 'HR-V 1.8', 'Alias: HR-V 1.8'),
    ('honda|pilot 3.5', 'honda|pilot 3.5l v6 petrol', 'Honda', 'Pilot 3.5', 'Alias: Pilot 3.5'),
    ('honda|odyssey 2.4', 'honda|odyssey 2.4l petrol', 'Honda', 'Odyssey 2.4', 'Alias: Odyssey 2.4'),
    ('honda|fit 1.5', 'honda|fit 1.5l petrol', 'Honda', 'Fit 1.5', 'Alias: Fit 1.5')
  ) AS t(alias_key, source_key, alias_brand, alias_model, alias_variant)
)
INSERT INTO public.vehicle_fuel_specs_catalog (
  brand,
  model,
  variant,
  normalized_key,
  fuel_type,
  engine_displacement,
  official_fuel_efficiency_l_100km,
  vehicle_type,
  usage_weight,
  test_cycle,
  market_region,
  source_note,
  is_active
)
SELECT
  a.alias_brand,
  a.alias_model,
  a.alias_variant,
  a.alias_key,
  c.fuel_type,
  c.engine_displacement,
  c.official_fuel_efficiency_l_100km,
  c.vehicle_type,
  c.usage_weight,
  c.test_cycle,
  c.market_region,
  COALESCE(c.source_note || ' | ', '') || 'Compatibility alias',
  true
FROM alias_map a
JOIN public.vehicle_fuel_specs_catalog c
  ON c.normalized_key = a.source_key
 AND c.is_active = true
ON CONFLICT (normalized_key) DO UPDATE
SET
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  variant = EXCLUDED.variant,
  fuel_type = EXCLUDED.fuel_type,
  engine_displacement = EXCLUDED.engine_displacement,
  official_fuel_efficiency_l_100km = EXCLUDED.official_fuel_efficiency_l_100km,
  vehicle_type = EXCLUDED.vehicle_type,
  usage_weight = EXCLUDED.usage_weight,
  test_cycle = EXCLUDED.test_cycle,
  market_region = EXCLUDED.market_region,
  source_note = EXCLUDED.source_note,
  is_active = true,
  updated_at = now();
