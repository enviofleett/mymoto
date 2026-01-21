/**
 * Email rate limiting utilities
 */

const MAX_EMAILS_PER_MINUTE = 5;
const MAX_EMAILS_PER_HOUR = 50;
const MAX_EMAILS_PER_DAY = 200;

export async function checkRateLimit(
  userId: string,
  supabase: any
): Promise<{ allowed: boolean; resetAt?: Date; error?: string }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const oneDayAgo = new Date(now.getTime() - 86400000);
  
  // Check per-minute limit
  const { count: minuteCount, error: minuteError } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneMinuteAgo.toISOString())
    .eq('status', 'sent');
  
  if (minuteError) {
    console.error('[Rate Limit] Error checking minute limit:', minuteError);
    // Fail open - allow if we can't check
    return { allowed: true };
  }
  
  if (minuteCount && minuteCount >= MAX_EMAILS_PER_MINUTE) {
    const resetAt = new Date(oneMinuteAgo.getTime() + 60000);
    return {
      allowed: false,
      resetAt,
      error: `Rate limit exceeded: ${MAX_EMAILS_PER_MINUTE} emails per minute. Try again in ${Math.ceil((resetAt.getTime() - now.getTime()) / 1000)} seconds.`
    };
  }
  
  // Check per-hour limit
  const { count: hourCount, error: hourError } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneHourAgo.toISOString())
    .eq('status', 'sent');
  
  if (hourError) {
    console.error('[Rate Limit] Error checking hour limit:', hourError);
    return { allowed: true };
  }
  
  if (hourCount && hourCount >= MAX_EMAILS_PER_HOUR) {
    const resetAt = new Date(oneHourAgo.getTime() + 3600000);
    return {
      allowed: false,
      resetAt,
      error: `Rate limit exceeded: ${MAX_EMAILS_PER_HOUR} emails per hour. Try again in ${Math.ceil((resetAt.getTime() - now.getTime()) / 3600000)} hours.`
    };
  }
  
  // Check per-day limit
  const { count: dayCount, error: dayError } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', oneDayAgo.toISOString())
    .eq('status', 'sent');
  
  if (dayError) {
    console.error('[Rate Limit] Error checking day limit:', dayError);
    return { allowed: true };
  }
  
  if (dayCount && dayCount >= MAX_EMAILS_PER_DAY) {
    const resetAt = new Date(oneDayAgo.getTime() + 86400000);
    return {
      allowed: false,
      resetAt,
      error: `Rate limit exceeded: ${MAX_EMAILS_PER_DAY} emails per day. Try again tomorrow.`
    };
  }
  
  return { allowed: true };
}

export async function logEmailAttempt(
  recipient: string,
  subject: string,
  templateKey: string | null,
  status: 'sent' | 'failed' | 'rate_limited' | 'validation_failed',
  errorMessage: string | null,
  userId: string | null,
  senderId: string | null,
  supabase: any
): Promise<void> {
  try {
    await supabase.from('email_logs').insert({
      recipient,
      subject,
      template_key: templateKey,
      status,
      error_message: errorMessage,
      user_id: userId,
      sender_id: senderId,
    });
  } catch (error) {
    console.error('[Email Log] Failed to log email attempt:', error);
    // Don't throw - logging failure shouldn't break email sending
  }
}
