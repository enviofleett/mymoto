/**
 * Enhanced Date Extraction System (V2)
 * 
 * Hybrid approach: Fast regex for simple cases, LLM for complex/ambiguous cases
 * Includes timezone support and date validation
 */

import { DateContext } from './date-extractor.ts'
import { extractDateContext } from './date-extractor.ts'

/**
 * Call Lovable AI Gateway for date extraction
 */
async function callLovableAPIForDateExtraction(
  message: string,
  clientTimestamp?: string,
  userTimezone?: string
): Promise<DateContext> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY must be configured in Supabase secrets')
  }

  // Default to Lagos timezone if not provided
  const DEFAULT_TIMEZONE = 'Africa/Lagos'
  const tz = userTimezone || DEFAULT_TIMEZONE
  
  const now = clientTimestamp ? new Date(clientTimestamp) : new Date()
  const nowISO = now.toISOString()
  const timezoneInfo = `User's timezone: ${tz}. `

  const systemPrompt = `You are a date extraction assistant. Extract date/time references from user messages and return structured date ranges.

Current date/time: ${nowISO}
${timezoneInfo}
Return a JSON object with:
- hasDateReference: boolean
- period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom' | 'none'
- startDate: ISO string (start of day in UTC)
- endDate: ISO string (end of day in UTC)
- humanReadable: string (e.g., "yesterday", "last 3 days")
- confidence: number (0-1)

Examples:
- "yesterday" → { hasDateReference: true, period: 'yesterday', startDate: '2026-01-14T00:00:00Z', endDate: '2026-01-14T23:59:59Z', humanReadable: 'yesterday', confidence: 0.95 }
- "last week" → { hasDateReference: true, period: 'last_week', startDate: '2026-01-08T00:00:00Z', endDate: '2026-01-14T23:59:59Z', humanReadable: 'last week', confidence: 0.9 }
- "on Monday" → { hasDateReference: true, period: 'custom', startDate: '2026-01-15T00:00:00Z', endDate: '2026-01-15T23:59:59Z', humanReadable: 'Monday', confidence: 0.85 }

Be smart about ambiguous dates:
- "Monday" without context → most recent Monday (could be today if today is Monday, or last Monday)
- "last Monday" → previous Monday
- "this Monday" → upcoming Monday or today if today is Monday
- Relative dates like "3 days ago" → calculate from current date

Return ONLY valid JSON, no other text.`

  const userPrompt = `Extract date context from this message: "${message}"

Return JSON:`

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.1, // Low temperature for consistent date extraction
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Date Extraction LLM] API error:', {
        status: response.status,
        body: errorText.substring(0, 200),
      })
      throw new Error(`Lovable API error: ${response.status}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim() || ''

    if (!text) {
      throw new Error('Empty response from Lovable API')
    }

    // Extract JSON from response (may have markdown code blocks)
    let jsonText = text
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const parsed = JSON.parse(jsonText)
    
    // Validate and normalize the response
    const result: DateContext = {
      hasDateReference: parsed.hasDateReference || false,
      period: parsed.period || 'none',
      startDate: parsed.startDate || new Date().toISOString(),
      endDate: parsed.endDate || new Date().toISOString(),
      humanReadable: parsed.humanReadable || 'current',
      timezone: userTimezone,
      confidence: parsed.confidence || 0.7
    }

    // Validate dates are logical
    const startDate = new Date(result.startDate)
    const endDate = new Date(result.endDate)
    const nowDate = new Date(nowISO)

    // Check if dates are in the future (shouldn't be for historical queries)
    if (startDate > nowDate) {
      console.warn('[Date Extraction LLM] Start date is in future, adjusting')
      result.startDate = nowDate.toISOString()
      result.confidence = (result.confidence || 0.7) * 0.8
    }

    if (endDate > nowDate) {
      console.warn('[Date Extraction LLM] End date is in future, adjusting')
      result.endDate = nowDate.toISOString()
      result.confidence = (result.confidence || 0.7) * 0.8
    }

    // Check if start > end
    if (startDate > endDate) {
      console.warn('[Date Extraction LLM] Start date is after end date, swapping')
      const temp = result.startDate
      result.startDate = result.endDate
      result.endDate = temp
      result.confidence = (result.confidence || 0.7) * 0.7
    }

    return result
  } catch (error) {
    console.error('[Date Extraction LLM] Error:', error)
    // Fallback to regex extraction
    return extractDateContext(message, clientTimestamp, userTimezone)
  }
}

/**
 * Extract date context using regex (fast path)
 * Returns confidence score
 */
function extractDateContextRegex(
  message: string,
  clientTimestamp?: string,
  userTimezone?: string
): DateContext & { confidence: number } {
  const result = extractDateContext(message, clientTimestamp, userTimezone)
  
  // Assign confidence based on pattern match quality
  let confidence = 0.9
  
  const lowerMessage = message.toLowerCase()
  
  // High confidence patterns
  if (/\b(today|yesterday|tomorrow)\b/i.test(lowerMessage)) {
    confidence = 0.95
  } else if (/\b(\d+)\s*days?\s*ago\b/i.test(lowerMessage)) {
    confidence = 0.9
  } else if (/\b(last|previous)\s+week\b/i.test(lowerMessage)) {
    confidence = 0.85
  } else if (/\b(this|current)\s+week\b/i.test(lowerMessage)) {
    confidence = 0.85
  } else if (/\b(on|last|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lowerMessage)) {
    confidence = 0.7 // Lower confidence for day names (ambiguous)
  } else if (result.hasDateReference) {
    confidence = 0.8
  } else {
    confidence = 0.5 // No date reference found
  }

  return {
    ...result,
    confidence
  }
}

/**
 * Enhanced date extraction with hybrid approach
 * 
 * 1. Try regex first (fast path)
 * 2. If confidence < 0.9 or ambiguous, use LLM
 * 3. Validate and return
 */
export async function extractDateContextV2(
  message: string,
  clientTimestamp?: string,
  userTimezone?: string
): Promise<DateContext> {
  // Default to Lagos timezone if not provided
  const DEFAULT_TIMEZONE = 'Africa/Lagos'
  const tz = userTimezone || DEFAULT_TIMEZONE
  
  // Step 1: Try regex first (fast path)
  const regexResult = extractDateContextRegex(message, clientTimestamp, tz)
  
  // Step 2: Use LLM for ambiguous cases or low confidence
  if (regexResult.confidence < 0.9 || regexResult.period === 'none') {
    console.log(`[Date Extraction V2] Low confidence (${regexResult.confidence}) or no match, using LLM extraction`)
    
    // Check if message contains ambiguous date patterns
    const ambiguousPatterns = [
      /\b(on|last|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(that|this)\s+(day|time|morning|afternoon|evening)\b/i,
      /\b(recently|lately|earlier|before)\b/i,
      /\b(when|what\s+time)\s+(did|was|were)\b/i
    ]
    
    const hasAmbiguousPattern = ambiguousPatterns.some(p => p.test(message.toLowerCase()))
    
    if (hasAmbiguousPattern || regexResult.confidence < 0.7) {
      try {
        const llmResult = await callLovableAPIForDateExtraction(message, clientTimestamp, tz)
        
        // Use LLM result if it has higher confidence or found a date reference
        if (llmResult.confidence && llmResult.confidence > regexResult.confidence) {
          console.log(`[Date Extraction V2] Using LLM result (confidence: ${llmResult.confidence})`)
          return llmResult
        } else if (llmResult.hasDateReference && !regexResult.hasDateReference) {
          console.log(`[Date Extraction V2] Using LLM result (found date reference)`)
          return llmResult
        }
      } catch (error) {
        console.warn('[Date Extraction V2] LLM extraction failed, using regex result:', error)
      }
    }
  }
  
  // Step 3: Return regex result (with confidence)
  return regexResult
}

/**
 * Validate extracted date context
 */
export function validateDateContext(context: DateContext): {
  isValid: boolean
  issues: string[]
  corrected?: DateContext
} {
  const issues: string[] = []
  const now = new Date()
  
  const startDate = new Date(context.startDate)
  const endDate = new Date(context.endDate)
  
  // Check if dates are in the future (for historical queries)
  if (startDate > now) {
    issues.push('Start date is in the future')
  }
  
  if (endDate > now) {
    issues.push('End date is in the future')
  }
  
  // Check if start > end
  if (startDate > endDate) {
    issues.push('Start date is after end date')
  }
  
  // Check if date range is too large (more than 1 year)
  const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  if (rangeDays > 365) {
    issues.push(`Date range is very large: ${rangeDays.toFixed(0)} days`)
  }
  
  // Check if date range is negative
  if (rangeDays < 0) {
    issues.push('Date range is negative')
  }
  
  // Create corrected context if needed
  let corrected: DateContext | undefined = undefined
  if (issues.length > 0) {
    corrected = { ...context }
    
    // Fix future dates
    if (startDate > now) {
      corrected.startDate = now.toISOString()
    }
    if (endDate > now) {
      corrected.endDate = now.toISOString()
    }
    
    // Fix inverted dates
    if (startDate > endDate) {
      const temp = corrected.startDate
      corrected.startDate = corrected.endDate
      corrected.endDate = temp
    }
    
    // Ensure end date is at end of day
    const endDateObj = new Date(corrected.endDate)
    endDateObj.setHours(23, 59, 59, 999)
    corrected.endDate = endDateObj.toISOString()
    
    // Ensure start date is at start of day
    const startDateObj = new Date(corrected.startDate)
    startDateObj.setHours(0, 0, 0, 0)
    corrected.startDate = startDateObj.toISOString()
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    corrected
  }
}


