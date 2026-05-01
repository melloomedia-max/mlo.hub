const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { recommendPackage } = require('../utils/package-recommender');

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
    
    // Get package recommendation
    const recommendation = recommendPackage(req.body);
    
    // Insert into leads table
    const result = await db.run(`
      INSERT INTO leads (
        name, email, phone, company, website,
        services_interested, budget_range, timeline,
        what_building, audience, dream_outcome, references,
        source, stage, package_recommended, quoted_amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
      'new', // initial stage
      recommendation.package_name, // package_recommended
      null // quoted_amount (to be set later)
    ]);

    // Log stage history
    await db.run(`
      INSERT INTO lead_stage_history (lead_id, from_stage, to_stage, changed_at, note)
      VALUES (?, ?, ?, datetime('now'), ?)
    `, [result.lastID, null, 'new', 'Lead created via intake form']);

    res.json({
      success: true,
      leadId: result.lastID,
      message: 'Thank you! We\'ll be in touch within 24 hours.',
      recommendation: {
        package: recommendation.package_name,
        price: recommendation.details.price,
        timeline: recommendation.details.timeline,
        confidence: recommendation.confidence
      }
    });

  } catch (error) {
    console.error('Intake submission error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

module.exports = router;

// GET /api/intake/recommend - Get package recommendation for lead data
router.post('/recommend', async (req, res) => {
  try {
    const recommendation = recommendPackage(req.body);
    res.json(recommendation);
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: 'Failed to generate recommendation' });
  }
});

// GET /api/intake/packages - List all available packages
router.get('/packages', (req, res) => {
  const { PACKAGES } = require('../utils/package-recommender');
  res.json(PACKAGES);
});
