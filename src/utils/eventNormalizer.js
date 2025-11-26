/**
 * Utility functions for normalizing events from different sources
 */

/**
 * Ensure date is in ISO 8601 format
 * @param {string|Date} date
 * @returns {string}
 */
export function normalizeDate(date) {
  if (!date) return null;

  if (date instanceof Date) {
    return date.toISOString();
  }

  // Already ISO string
  if (typeof date === 'string') {
    // Check if it's a date-only string (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // Try to parse and convert to ISO
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return String(date);
}

/**
 * Generate a unique external ID if not provided
 * @param {string} sourceId
 * @param {object} event
 * @returns {string}
 */
export function generateExternalId(sourceId, event) {
  if (event.uid) return event.uid;
  if (event.id) return event.id;

  // Generate based on content hash
  const content = `${sourceId}-${event.summary}-${event.start_datetime}`;
  return `generated-${hashCode(content)}`;
}

/**
 * Simple hash function for strings
 * @param {string} str
 * @returns {string}
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Validate normalized event has required fields
 * @param {object} event
 * @returns {boolean}
 */
export function validateNormalizedEvent(event) {
  const required = ['source_id', 'external_id', 'start_datetime'];
  return required.every(field => event[field] !== undefined && event[field] !== null);
}

/**
 * Clean and sanitize event text fields
 * @param {string} text
 * @returns {string|null}
 */
export function sanitizeText(text) {
  if (!text) return null;
  return String(text).trim() || null;
}

export default {
  normalizeDate,
  generateExternalId,
  validateNormalizedEvent,
  sanitizeText
};
