import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manually load .env file
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = fs.existsSync(envPath) 
  ? fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .reduce((acc, line) => {
        const [key, value] = line.split('=');
        if (key && value) {
          acc[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
        }
        return acc;
      }, {} as Record<string, string>)
  : {};

Object.assign(process.env, envConfig);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.log('Available keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function invokeSync() {
  const deviceId = '358657105966092'; // RBC784CX
  console.log(`Invoking sync-trips-incremental for device ${deviceId}...`);

  const { data, error } = await supabase.functions.invoke('sync-trips-incremental', {
    body: { device_id: deviceId }
  });

  if (error) {
    console.error('Error invoking sync-trips-incremental:', error);
    if ('context' in error && typeof (error as any).context.json === 'function') {
        try {
            const errorBody = await (error as any).context.text();
            console.error('Error body:', errorBody);
        } catch (e) {
            console.error('Failed to read error body:', e);
        }
    }
  } else {
    console.log('Sync result:', data);
  }

  // Also try sync-gps51-trips as fallback or alternative
  console.log(`\nInvoking sync-gps51-trips for device ${deviceId}...`);
  const { data: data2, error: error2 } = await supabase.functions.invoke('sync-gps51-trips', {
    body: { deviceid: deviceId } // Note: sync-gps51-trips expects 'deviceid' (lowercase) based on index.ts line 96
  });

  if (error2) {
    console.error('Error invoking sync-gps51-trips:', error2);
    if ('context' in error2 && typeof (error2 as any).context.json === 'function') {
        try {
            const errorBody = await (error2 as any).context.text();
            console.error('Error body:', errorBody);
        } catch (e) {
            console.error('Failed to read error body:', e);
        }
    }
  } else {
    console.log('Sync GPS51 result:', data2);
  }
}

invokeSync();
