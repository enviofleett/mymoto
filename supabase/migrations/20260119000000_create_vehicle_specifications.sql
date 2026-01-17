-- Vehicle Specifications Table
-- Stores vehicle manufacturer data for fuel consumption analysis

CREATE TABLE public.vehicle_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  
  -- Vehicle identification
  brand TEXT NOT NULL, -- e.g., "Toyota", "Honda", "Ford"
  model TEXT, -- e.g., "Camry", "Civic", "F-150"
  year_of_manufacture INTEGER, -- e.g., 2020, 2018
  vehicle_age_years INTEGER, -- Calculated from year_of_manufacture
  
  -- Vehicle components (for fuel consumption calculation)
  engine_type TEXT, -- "petrol", "diesel", "hybrid", "electric"
  engine_size_cc INTEGER, -- Engine displacement in cc
  transmission_type TEXT, -- "manual", "automatic", "CVT"
  fuel_tank_capacity_liters INTEGER, -- Fuel tank capacity
  
  -- Manufacturer fuel consumption data (L/100km)
  manufacturer_fuel_consumption_city FLOAT, -- City driving (L/100km)
  manufacturer_fuel_consumption_highway FLOAT, -- Highway driving (L/100km)
  manufacturer_fuel_consumption_combined FLOAT, -- Combined (L/100km)
  
  -- Age-based degradation factors
  fuel_consumption_degradation_per_year FLOAT DEFAULT 0.02, -- 2% increase per year
  estimated_current_fuel_consumption FLOAT, -- Calculated: manufacturer * (1 + degradation)^age
  
  -- Additional metadata
  notes TEXT, -- User notes about vehicle condition, modifications, etc.
  is_verified BOOLEAN DEFAULT false, -- Whether user has verified the data
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT valid_year CHECK (year_of_manufacture >= 1900 AND year_of_manufacture <= EXTRACT(YEAR FROM now()) + 1),
  CONSTRAINT valid_fuel_consumption CHECK (
    manufacturer_fuel_consumption_combined IS NULL OR 
    manufacturer_fuel_consumption_combined > 0
  )
);

-- Calculate vehicle age automatically
CREATE OR REPLACE FUNCTION calculate_vehicle_age()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.year_of_manufacture IS NOT NULL THEN
    NEW.vehicle_age_years := EXTRACT(YEAR FROM now()) - NEW.year_of_manufacture;
  END IF;
  
  -- Calculate estimated current fuel consumption based on age
  IF NEW.manufacturer_fuel_consumption_combined IS NOT NULL AND NEW.vehicle_age_years IS NOT NULL THEN
    NEW.estimated_current_fuel_consumption := 
      NEW.manufacturer_fuel_consumption_combined * 
      POWER(1 + COALESCE(NEW.fuel_consumption_degradation_per_year, 0.02), NEW.vehicle_age_years);
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_vehicle_age_trigger
BEFORE INSERT OR UPDATE ON vehicle_specifications
FOR EACH ROW
EXECUTE FUNCTION calculate_vehicle_age();

-- Indexes
CREATE INDEX idx_vehicle_specs_device ON vehicle_specifications(device_id);
CREATE INDEX idx_vehicle_specs_brand_year ON vehicle_specifications(brand, year_of_manufacture);

-- Enable RLS
ALTER TABLE public.vehicle_specifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their vehicle specifications"
ON public.vehicle_specifications FOR SELECT
TO authenticated
USING (
  device_id IN (
    SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can manage their vehicle specifications"
ON public.vehicle_specifications FOR ALL
TO authenticated
USING (
  device_id IN (
    SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  device_id IN (
    SELECT device_id FROM vehicle_assignments WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage all specifications"
ON public.vehicle_specifications FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE vehicle_specifications IS 'Stores vehicle manufacturer data for intelligent fuel consumption analysis. Fuel consumption estimates are assumptions based on manufacturer data and vehicle age.';
COMMENT ON COLUMN vehicle_specifications.estimated_current_fuel_consumption IS 'Estimated fuel consumption accounting for vehicle age degradation. Formula: manufacturer_combined × (1 + degradation_per_year)^age_years';
COMMENT ON COLUMN vehicle_specifications.fuel_consumption_degradation_per_year IS 'Percentage increase in fuel consumption per year of vehicle age (default 2%).';
