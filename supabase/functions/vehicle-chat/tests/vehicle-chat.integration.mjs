import process from 'node:process'

const endpoint = process.env.VEHICLE_CHAT_URL
const token = process.env.VEHICLE_CHAT_TOKEN
const deviceId = process.env.VEHICLE_CHAT_DEVICE_ID
const timezone = process.env.VEHICLE_CHAT_TIMEZONE || 'Africa/Lagos'

if (!endpoint || !token || !deviceId) {
  console.error('Missing VEHICLE_CHAT_URL, VEHICLE_CHAT_TOKEN, or VEHICLE_CHAT_DEVICE_ID environment variables')
  process.exit(1)
}

async function callAgent(message) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      message,
      device_id: deviceId,
      conversation_id: `ci-test-${Date.now()}`,
      client_timestamp: new Date().toISOString(),
      user_timezone: timezone
    })
  })

  const bodyText = await res.text()
  let json
  try {
    json = JSON.parse(bodyText)
  } catch {
    throw new Error(`Non-JSON response (status ${res.status}): ${bodyText.slice(0, 400)}`)
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${bodyText}`)
  }

  return json
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function hasPrefetchedTool(result, toolName) {
  const prefetched = result.metadata && result.metadata.prefetched
  if (!Array.isArray(prefetched)) return false
  return prefetched.some(entry => entry && entry.tool === toolName)
}

async function testLocation() {
  const result = await callAgent('Where is my vehicle right now?')
  ensure(typeof result.text === 'string', 'location: missing text field')
  ensure(result.metadata && result.metadata.intent, 'location: missing metadata.intent')
  const type = result.metadata.intent.type
  ensure(type === 'location' || type === 'status', `location: unexpected intent.type "${type}"`)
  ensure(result.text.includes('[LOCATION:'), 'location: response missing [LOCATION: ...] tag')
}

async function testTripHistory() {
  const result = await callAgent('Show me my last trip')
  ensure(result.metadata && result.metadata.intent, 'trip: missing metadata.intent')
  const type = result.metadata.intent.type
  ensure(type === 'trip' || type === 'history' || type === 'stats', `trip: unexpected intent.type "${type}"`)
  ensure(hasPrefetchedTool(result, 'get_trip_history'), 'trip: get_trip_history not present in metadata.prefetched')
}

async function testTripAnalytics() {
  const result = await callAgent('What are my stats for this week?')
  ensure(result.metadata && result.metadata.intent, 'stats: missing metadata.intent')
  const type = result.metadata.intent.type
  ensure(type === 'stats' || type === 'trip', `stats: unexpected intent.type "${type}"`)
  ensure(hasPrefetchedTool(result, 'get_trip_analytics'), 'stats: get_trip_analytics not present in metadata.prefetched')
}

async function testMaintenanceAlerts() {
  const result = await callAgent('Show me my recent alerts')
  ensure(result.metadata && result.metadata.intent, 'maintenance: missing metadata.intent')
  const type = result.metadata.intent.type
  ensure(type === 'maintenance', `maintenance: unexpected intent.type "${type}"`)
  ensure(hasPrefetchedTool(result, 'get_recent_alerts'), 'maintenance: get_recent_alerts not present in metadata.prefetched')
}

async function main() {
  const tests = [
    ['location', testLocation],
    ['trip_history', testTripHistory],
    ['trip_analytics', testTripAnalytics],
    ['maintenance_alerts', testMaintenanceAlerts]
  ]

  let failed = 0

  for (const [name, fn] of tests) {
    process.stdout.write(`Running ${name}... `)
    try {
      await fn()
      console.log('OK')
    } catch (err) {
      failed += 1
      console.log('FAIL')
      console.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (failed > 0) {
    console.error(`vehicle-chat integration tests failed: ${failed} test(s)`)
    process.exit(1)
  } else {
    console.log('vehicle-chat integration tests passed')
  }
}

main().catch(err => {
  console.error('Unexpected error', err)
  process.exit(1)
})
