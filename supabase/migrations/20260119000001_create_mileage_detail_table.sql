-- Vehicle Mileage Details Table
-- Stores GPS51 reportmileagedetail API response data with manufacturer-based estimates

CREATE TABLE public.vehicle_mileage_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  
  -- Date and time
  statisticsday DATE NOT NULL, -- Statistics date (yyyy-MM-dd)
  starttime BIGINT, -- Start time (ms, UTC)
  endtime BIGINT, -- End time (ms, UTC)
  
  -- Mileage data
  begindis INTEGER, -- Start mileage (meter)
  enddis INTEGER, -- End mileage (meter)
  totaldistance INTEGER, -- Total mileage in period (meter)
  
  -- Fuel data (all in 1/100L units from GPS51)
  beginoil INTEGER, -- Start fuel value (1/100L)
  endoil INTEGER, -- End fuel value (1/100L)
  ddoil INTEGER, -- Refuel volume (1/100L)
  idleoil INTEGER, -- Idling fuel value (1/100L)
  leakoil INTEGER, -- Steal fuel value (1/100L) - CRITICAL for theft detection
  
  -- Speed data (m/h from GPS51)
  avgspeed FLOAT, -- Average speed (m/h)
  overspeed INTEGER, -- Overspeed count
  
  -- Fuel efficiency from GPS51 (actual measured)
  oilper100km FLOAT, -- Comprehensive fuel consumption (L/100KM) - GPS51 measured
  runoilper100km FLOAT, -- Real driving fuel consumption (L/100KM) - GPS51 measured
  oilperhour FLOAT, -- Fuel consumption per hour (L/H) - GPS51 measured
  
  -- Estimated fuel consumption (manufacturer-based)
  estimated_fuel_consumption_combined FLOAT, -- Manufacturer + age estimate (L/100km)
  estimated_fuel_consumption_city FLOAT, -- Manufacturer city estimate (L/100km)
  estimated_fuel_consumption_highway FLOAT, -- Manufacturer highway estimate (L/100km)
  fuel_consumption_variance FLOAT, -- Difference between actual and estimated (%)
  
  -- ACC time
  totalacc BIGINT, -- Total time of ACC on (ms)
  
  -- GPS51 sync tracking
  gps51_record_id TEXT, -- GPS51 record identifier for deduplication
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT fk_device FOREIGN KEY (device_id) REFERENCES vehicles(device_id) ON DELETE CASCADE,
  CONSTRAINT unique_device_date UNIQUE (device_id, statisticsday, gps51_record_id)
);

-- Indexes
CREATE INDEX idx_mileage_details_device_date ON vehicle_mileage_details(device_id, statisticsday DESC);
CREATE INDEX idx_mileage_details_device_time ON vehicle_mileage_details(device_id, starttime DESC);
CREATE INDEX idx_mileage_details_fuel_theft ON vehicle_mileage_details(device_id, leakoil) WHERE leakoil > 0;
CREATE INDEX idx_mileage_details_variance ON vehicle_mileage_details(device_id, fuel_consumption_variance) WHERE fuel_consumption_variance IS NOT NULL;

-- Enable RLS
ALTER TABLE public.vehicle_mileage_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read mileage details"
ON public.vehicle_mileage_details FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage mileage details"
ON public.vehicle_mileage_details FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE vehicle_mileage_details IS 'Stores GPS51 reportmileagedetail API data including fuel consumption, efficiency, and ACC time. Includes manufacturer-based estimates for comparison.';
COMMENT ON COLUMN vehicle_mileage_details.estimated_fuel_consumption_combined IS 'Estimated fuel consumption based on manufacturer data and vehicle age. This is an ASSUMPTION and may vary from actual consumption.';
COMMENT ON COLUMN vehicle_mileage_details.fuel_consumption_variance IS 'Percentage difference between GPS51 measured consumption and manufacturer estimate. Positive = using more fuel than estimated, Negative = using less. Formula: ((actual - estimated) / estimated) × 100';
