
import { classifyIntent } from '../intent-classifier.ts';
import { extractDateContext } from '../date-extractor.ts';
import { parseCommand } from '../command-parser.ts';

const SCENARIOS = [
  // --- Location & Status ---
  "Where is my vehicle right now?",
  "Show me the current location",
  "Is the car parked?",
  
  // --- Trip History & Dates ---
  "Show me my last trip",
  "Did I drive anywhere yesterday?",
  "How many miles did I cover last week?",
  "Show trips from January 1st to January 5th",
  
  // --- Stats & Analytics ---
  "What is my average fuel consumption?",
  "Check battery health",
  "Any maintenance alerts?",
  
  // --- Commands & Control ---
  "Immobilize the engine",
  "Set a geofence around here",
  "Turn off the engine",
  
  // --- Complex / Mixed ---
  "Where was I last Tuesday?",
  "Did I speed during my last trip?",
];

console.log("🚀 Running Vehicle Chat Intent Tests...\n");

for (const query of SCENARIOS) {
  console.log(`📝 Query: "${query}"`);
  
  // 1. Intent Classification
  const intent = classifyIntent(query);
  console.log(`   └─ 🧠 Intent: ${intent.type.toUpperCase()} (Confidence: ${intent.confidence})`);
  
  // 2. Date Extraction
  // Mocking current date as 2026-01-28 for consistent testing
  const mockNow = new Date('2026-01-28T12:00:00Z'); 
  // We need to pass the timezone if the function requires it, defaulting to 'UTC' or 'Africa/Lagos'
  const dateContext = extractDateContext(query, 'Africa/Lagos'); 
  
  if (dateContext.hasDateReference) {
    console.log(`   └─ 📅 Date: ${dateContext.humanReadable} (${dateContext.period})`);
    console.log(`       └─ Range: ${dateContext.startDate} -> ${dateContext.endDate}`);
  }

  // 3. Command Parsing
  const command = parseCommand(query);
  if (command && command.isCommand) {
    console.log(`   └─ ⚡ Command: ${command.commandType} (Confidence: ${command.confidence})`);
    if (command.parameters && Object.keys(command.parameters).length > 0) {
        console.log(`       └─ Parameters: ${JSON.stringify(command.parameters)}`);
    }
    if (command.geofenceParams) {
        console.log(`       └─ Geofence: ${JSON.stringify(command.geofenceParams)}`);
    }
  }

  console.log(""); // Empty line separator
}

console.log("✅ Tests Completed.");
