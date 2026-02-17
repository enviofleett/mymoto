import { TOOLS, TOOLS_SCHEMA } from '../tools.ts'

type ToolSchema = {
  type: string
  function: {
    name: string
    description: string
    parameters: unknown
  }
}

function fail(message: string): never {
  console.error(`[validate-tools-schema] ${message}`)
  throw new Error(message)
}

if (!Array.isArray(TOOLS) || TOOLS.length === 0) {
  console.warn('[validate-tools-schema] TOOLS array is empty or not defined')
}

const schemaTools = TOOLS_SCHEMA as ToolSchema[]
const schemaByName = new Map<string, ToolSchema['function']>()
for (const t of schemaTools) {
  if (!t || !t.function || !t.function.name) continue
  schemaByName.set(t.function.name, t.function)
}

for (const tool of TOOLS) {
  if (!tool || !tool.name) {
    console.warn('[validate-tools-schema] Skipping tool without name', tool)
    continue
  }

  const schema = schemaByName.get(tool.name)
  if (!schema) {
    fail(`Missing schema entry for tool "${tool.name}"`)
  }

  if (typeof schema.description !== 'string' || schema.description.length === 0) {
    fail(`Tool "${tool.name}" has no description in schema`)
  }

  if (schema.parameters == null) {
    fail(`Tool "${tool.name}" has no parameters schema defined`)
  }
}

for (const [name] of schemaByName) {
  const inRuntime = TOOLS.find(t => t.name === name)
  if (!inRuntime) {
    fail(`Schema defines tool "${name}" that is not present in TOOLS runtime array`)
  }
}

console.log('[validate-tools-schema] TOOLS and TOOLS_SCHEMA are consistent')
