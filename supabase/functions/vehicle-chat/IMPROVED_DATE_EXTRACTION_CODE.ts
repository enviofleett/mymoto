/**
 * IMPROVED DATE EXTRACTION CODE
 * 
 * This is an enhanced version of the date extraction section with:
 * - Better error handling and logging
 * - Consistent timezone enforcement
 * - More structured validation
 * - Improved fallback logic
 * 
 * Replace the section starting at line ~2649 in index.ts with this code.
 */

// 4.5. Extract date context from user message for historical queries (Enhanced V2)
// Enforce Lagos timezone across all date operations
const DEFAULT_TIMEZONE = 'Africa/Lagos'
const userTimezone = DEFAULT_TIMEZONE // Always use Lagos timezone (Africa/Lagos)

// Use enhanced date extraction (hybrid: regex + LLM)
let dateContext: DateContext
const dateExtractionStartTime = Date.now()

try {
  // Attempt V2 extraction (hybrid: regex + LLM for ambiguous cases)
  dateContext = await extractDateContextV2(message, client_timestamp, userTimezone)
  
  // Validate extracted date context
  const validation = validateDateContext(dateContext)
  
  if (!validation.isValid) {
    // Categorize issues for appropriate logging
    const futureDateIssues = validation.issues.filter(issue => 
      issue.includes('End date is in the future') || 
      issue.includes('Start date is in the future')
    )
    const significantIssues = validation.issues.filter(issue => 
      !issue.includes('End date is in the future') && 
      !issue.includes('Start date is in the future')
    )
    
    // Apply corrections if available
    if (validation.corrected) {
      dateContext = validation.corrected
      
      // Log based on issue severity
      if (significantIssues.length > 0) {
        // Significant issues (inverted dates, negative ranges, etc.) - warn
        console.warn('[Date Extraction] Validation issues found, using corrected dates:', {
          issues: validation.issues,
          original: {
            startDate: dateContext.startDate,
            endDate: dateContext.endDate,
            period: dateContext.period
          },
          corrected: {
            startDate: validation.corrected.startDate,
            endDate: validation.corrected.endDate,
            period: validation.corrected.period
          }
        })
      } else if (futureDateIssues.length > 0) {
        // Minor corrections (future dates) are common and expected - debug level
        console.log('[Date Extraction] Auto-corrected future date(s) to current time (expected behavior)', {
          correctedIssues: futureDateIssues,
          correctedStartDate: validation.corrected.startDate,
          correctedEndDate: validation.corrected.endDate
        })
      }
    } else {
      // No correction available - this is a problem
      console.error('[Date Extraction] Validation failed but no correction available:', {
        issues: validation.issues,
        dateContext: {
          startDate: dateContext.startDate,
          endDate: dateContext.endDate,
          period: dateContext.period,
          hasDateReference: dateContext.hasDateReference
        }
      })
      // Continue with original context but log the issue
    }
  }
  
  // Log successful extraction with performance metrics
  const extractionDuration = Date.now() - dateExtractionStartTime
  console.log('[Date Extraction] Successfully extracted date context', {
    hasDateReference: dateContext.hasDateReference,
    period: dateContext.period,
    humanReadable: dateContext.humanReadable,
    startDate: dateContext.startDate,
    endDate: dateContext.endDate,
    timezone: dateContext.timezone,
    confidence: dateContext.confidence,
    extractionDurationMs: extractionDuration
  })
  
} catch (error) {
  // V2 extraction failed - fallback to V1 (regex-only)
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack : undefined
  
  console.warn('[Date Extraction] V2 extraction failed, falling back to V1 (regex-only)', {
    error: errorMessage,
    errorType: error?.constructor?.name,
    stack: errorStack,
    message: message.substring(0, 100), // Log first 100 chars of message for debugging
    clientTimestamp: client_timestamp
  })
  
  try {
    // Fallback to V1 (regex-based extraction)
    dateContext = extractDateContext(message, client_timestamp, userTimezone)
    
    // Validate V1 result as well
    const v1Validation = validateDateContext(dateContext)
    if (!v1Validation.isValid && v1Validation.corrected) {
      dateContext = v1Validation.corrected
      console.log('[Date Extraction] V1 result corrected:', {
        issues: v1Validation.issues,
        corrected: {
          startDate: dateContext.startDate,
          endDate: dateContext.endDate
        }
      })
    }
    
    console.log('[Date Extraction] V1 fallback successful', {
      hasDateReference: dateContext.hasDateReference,
      period: dateContext.period,
      humanReadable: dateContext.humanReadable,
      startDate: dateContext.startDate,
      endDate: dateContext.endDate
    })
    
  } catch (fallbackError) {
    // Even V1 failed - use default (today)
    const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
    console.error('[Date Extraction] Both V2 and V1 extraction failed, using default (today)', {
      v2Error: errorMessage,
      v1Error: fallbackErrorMessage,
      message: message.substring(0, 100)
    })
    
    // Default to today in Lagos timezone
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setUTCHours(23, 59, 59, 999)
    
    dateContext = {
      hasDateReference: false,
      period: 'none',
      startDate: todayStart.toISOString(),
      endDate: todayEnd.toISOString(),
      humanReadable: 'today',
      timezone: userTimezone,
      confidence: 0.5
    }
  }
}
