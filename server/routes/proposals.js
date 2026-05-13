const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { generateProposal, formatProposalMarkdown } = require('../utils/proposal-generator');

// POST /api/proposals/generate - Generate proposal from lead data
router.post('/generate', async (req, res) => {
  try {
    const { leadId, options } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID required' });
    }
    
    const db = getDb();
    const lead = await db.get('SELECT * FROM leads WHERE id = $1', [leadId]);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Generate proposal
    const proposal = generateProposal(lead, options || {});
    
    // Save proposal to database
    const result = await db.run(`
      INSERT INTO proposals (
        lead_id, proposal_number, content, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `, [
      leadId,
      proposal.meta.proposalNumber,
      JSON.stringify(proposal),
      'draft',
      proposal.meta.expiresAt
    ]);
    
    res.json({
      success: true,
      proposalId: result.lastID,
      proposal
    });
    
  } catch (error) {
    console.error('Proposal generation error:', error);
    res.status(500).json({ error: 'Failed to generate proposal' });
  }
});

// GET /api/proposals/:id - Get proposal by ID
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const proposal = await db.get('SELECT * FROM proposals WHERE id = $1', [req.params.id]);
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    res.json({
      ...proposal,
      content: JSON.parse(proposal.content)
    });
    
  } catch (error) {
    console.error('Proposal fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

// GET /api/proposals/:id/markdown - Get proposal as markdown
router.get('/:id/markdown', async (req, res) => {
  try {
    const db = getDb();
    const proposal = await db.get('SELECT content FROM proposals WHERE id = $1', [req.params.id]);
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    const proposalData = JSON.parse(proposal.content);
    const markdown = formatProposalMarkdown(proposalData);
    
    res.type('text/markdown').send(markdown);
    
  } catch (error) {
    console.error('Markdown export error:', error);
    res.status(500).json({ error: 'Failed to export markdown' });
  }
});

// POST /api/proposals/:id/send - Mark proposal as sent
router.post('/:id/send', async (req, res) => {
  try {
    const db = getDb();
    
    await db.run(`
      UPDATE proposals 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.params.id]);
    
    // Update lead with proposal_sent_at
    const proposal = await db.get('SELECT lead_id FROM proposals WHERE id = $1', [req.params.id]);
    if (proposal) {
      await db.run(`
        UPDATE leads
        SET proposal_sent_at = CURRENT_TIMESTAMP, stage = 'proposal'
        WHERE id = ?
      `, [proposal.lead_id]);
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Proposal send error:', error);
    res.status(500).json({ error: 'Failed to mark proposal as sent' });
  }
});

module.exports = router;
