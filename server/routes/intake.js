const express = require('express');
const router = express.Router();
const { getDb } = require('../database');

// GET /intake/start - Show intake form (public, no auth required)
router.get('/start', (req, res) => {
  res.sendFile('start.html', { root: './public' });
});

// POST /api/intake - Submit intake form
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      company,
      website,
      services_interested, // array
      budget_range,
      timeline,
      what_building,
      audience,
      dream_outcome,
      references,
      how_found_us
    } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const db = getDb();
    
    // Insert into leads table
    const result = await db.run(`
      INSERT INTO leads (
        name, email, phone, company, website,
        services_interested, budget_range, timeline,
        what_building, audience, dream_outcome, references,
        source, stage, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      name,
      email,
      phone || null,
      company || null,
      website || null,
      Array.isArray(services_interested) ? services_interested.join(', ') : services_interested,
      budget_range || null,
      timeline || null,
      what_building || null,
      audience || null,
      dream_outcome || null,
      references || null,
      how_found_us || 'Website Intake Form',
      'new' // initial stage
    ]);

    // Log stage history
    await db.run(`
      INSERT INTO lead_stage_history (lead_id, from_stage, to_stage, changed_at, note)
      VALUES (?, ?, ?, datetime('now'), ?)
    `, [result.lastID, null, 'new', 'Lead created via intake form']);

    res.json({
      success: true,
      leadId: result.lastID,
      message: 'Thank you! We\'ll be in touch within 24 hours.'
    });

  } catch (error) {
    console.error('Intake submission error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

module.exports = router;
