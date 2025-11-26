import { Router } from 'express';
import { Event } from '../models/Event.js';
import { getICalGenerator } from '../services/ICalGenerator.js';

const router = Router();

/**
 * GET /api/calendar.ics - Get combined calendar in iCalendar format
 */
router.get('/calendar.ics', (req, res) => {
  try {
    const generator = getICalGenerator();
    const icalData = generator.generate();

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
    res.send(icalData);
  } catch (error) {
    console.error('[API] Error generating iCal:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/calendar/:sourceId.ics - Get calendar for specific source
 */
router.get('/calendar/:sourceId.ics', (req, res) => {
  try {
    const generator = getICalGenerator();
    const icalData = generator.generateForSource(parseInt(req.params.sourceId));

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="calendar-${req.params.sourceId}.ics"`);
    res.send(icalData);
  } catch (error) {
    console.error('[API] Error generating iCal for source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/events - Get all events as JSON
 */
router.get('/events', (req, res) => {
  try {
    const events = Event.findAll();

    res.json({
      success: true,
      count: events.length,
      data: events.map(e => e.toJSON())
    });
  } catch (error) {
    console.error('[API] Error listing events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/events/:id - Get event by ID
 */
router.get('/events/:id', (req, res) => {
  try {
    const event = Event.findById(parseInt(req.params.id));

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.json({
      success: true,
      data: event.toJSON()
    });
  } catch (error) {
    console.error('[API] Error getting event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
