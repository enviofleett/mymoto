
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();

async function checkFileContent(path: string, searchString: string, description: string) {
  try {
    const content = await readFile(join(ROOT_DIR, path), 'utf-8');
    if (content.includes(searchString)) {
      console.log(`✅ ${description}: Verified`);
      return true;
    } else {
      console.log(`❌ ${description}: FAILED - Content not found`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${description}: FAILED - File not found (${path})`);
    return false;
  }
}

async function checkFileExists(path: string, description: string) {
  if (existsSync(join(ROOT_DIR, path))) {
    console.log(`✅ ${description}: Verified`);
    return true;
  } else {
    console.log(`❌ ${description}: FAILED - File not found`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Production Readiness Verification...\n');

  // 1. Verify Vehicle Chat Wallet Check
  await checkFileContent(
    'supabase/functions/vehicle-chat/index.ts',
    "from('wallets')",
    'Vehicle Chat: Wallet Balance Check Implementation'
  );

  // 2. Verify Proactive Alarm Wallet Check
  await checkFileContent(
    'supabase/functions/proactive-alarm-to-chat/index.ts',
    "from('wallets')",
    'Proactive Alarm: Wallet Balance Check Implementation'
  );

  // 3. Verify Report Template Settings Component
  await checkFileExists(
    'src/components/admin/ReportTemplateSettings.tsx',
    'Admin: Report Template Settings Component'
  );

  // 4. Verify Admin AI Settings Integration
  await checkFileContent(
    'src/pages/AdminAiSettings.tsx',
    'ReportTemplateSettings',
    'Admin: AI Settings Page Integration'
  );

  // 5. Verify RLS Migration
  await checkFileExists(
    'supabase/migrations/20260128000004_fix_vehicle_rls_security.sql',
    'Database: RLS Security Fix Migration'
  );

  // 6. Verify Daily Reports Migration
  await checkFileExists(
    'supabase/migrations/20260128000002_daily_trip_reports.sql',
    'Database: Daily Reports Schema Migration'
  );

  console.log('\n✨ Verification Complete.');
}

main().catch(console.error);
