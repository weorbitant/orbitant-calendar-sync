import { DateTime } from 'luxon';

/**
 * Fetches the user's timezone from Slack API
 * @param {object} client - Slack Web API client
 * @param {string} slackUserId - Slack user ID
 * @returns {Promise<string>} - IANA timezone identifier (e.g., 'America/New_York')
 */
export async function fetchUserTimezone(client, slackUserId) {
  try {
    const userInfo = await client.users.info({ user: slackUserId });
    return userInfo.user?.tz || 'UTC';
  } catch (error) {
    console.error(`[Timezone] Error fetching timezone for user ${slackUserId}:`, error.message);
    return 'UTC';
  }
}

/**
 * Formats a datetime string in the specified timezone
 * @param {string} isoDateTime - ISO 8601 datetime string
 * @param {string} timezone - IANA timezone identifier
 * @param {string} format - Luxon format string (default: 'HH:mm')
 * @returns {string} - Formatted time string
 */
export function formatTimeInZone(isoDateTime, timezone, format = 'HH:mm') {
  if (!isoDateTime) return '';
  return DateTime.fromISO(isoDateTime).setZone(timezone).toFormat(format);
}

/**
 * Formats a datetime string as a localized date in the specified timezone
 * @param {string} isoDateTime - ISO 8601 datetime string
 * @param {string} timezone - IANA timezone identifier
 * @param {string} format - Luxon format string (default: 'yyyy-MM-dd')
 * @returns {string} - Formatted date string
 */
export function formatDateInZone(isoDateTime, timezone, format = 'yyyy-MM-dd') {
  if (!isoDateTime) return '';
  return DateTime.fromISO(isoDateTime).setZone(timezone).toFormat(format);
}

/**
 * Gets a DateTime object in the specified timezone
 * @param {string} isoDateTime - ISO 8601 datetime string
 * @param {string} timezone - IANA timezone identifier
 * @returns {DateTime} - Luxon DateTime object
 */
export function getDateTimeInZone(isoDateTime, timezone) {
  return DateTime.fromISO(isoDateTime).setZone(timezone);
}

/**
 * Gets today's date string in the specified timezone
 * @param {string} timezone - IANA timezone identifier
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export function getTodayInZone(timezone) {
  return DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
}

/**
 * Gets a date relative to today in the specified timezone
 * @param {string} timezone - IANA timezone identifier
 * @param {number} daysOffset - Number of days to add (can be negative)
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export function getDateRelativeToToday(timezone, daysOffset) {
  return DateTime.now().setZone(timezone).plus({ days: daysOffset }).toFormat('yyyy-MM-dd');
}

/**
 * Checks if a datetime is on a specific date in the given timezone
 * @param {string} isoDateTime - ISO 8601 datetime string
 * @param {string} targetDate - Date string in YYYY-MM-DD format
 * @param {string} timezone - IANA timezone identifier
 * @returns {boolean}
 */
export function isOnDate(isoDateTime, targetDate, timezone) {
  if (!isoDateTime) return false;
  const eventDate = formatDateInZone(isoDateTime, timezone);
  return eventDate === targetDate;
}

export default {
  fetchUserTimezone,
  formatTimeInZone,
  formatDateInZone,
  getDateTimeInZone,
  getTodayInZone,
  getDateRelativeToToday,
  isOnDate
};
