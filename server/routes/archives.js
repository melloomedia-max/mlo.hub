const express = require('express');
const router = express.Router();
const db = require('../database');
const archiveManager = require('../utils/archiveManager');
const { runArchiveNow } = require('../jobs/archiveScheduler');

// Get archive history
router.get('/history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const history = await archiveManager.getArchiveHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger archive
router.post('/run', async (req, res) => {
  try {
    const result = await runArchiveNow();
    res.json({
      success: true,
      message: 'Archive completed',
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Restore from archive
router.post('/restore/:id', async (req, res) => {
  try {
    const result = await archiveManager.restoreFromArchive(req.params.id);
    res.json({
      success: true,
      message: 'Archive restored',
      records_restored: result.records ? result.records.length : (result.daily_records ? result.daily_records.length : 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get archive stats
router.get('/stats', async (req, res) => {
  try {
    db.get(`
      SELECT 
        COUNT(*) as total_archives,
        SUM(records_archived) as total_records_archived,
        SUM(file_size_bytes) as total_size_bytes,
        MIN(date_range_start) as oldest_archive,
        MAX(date_range_end) as newest_archive
      FROM archive_log
    `, (err, stats) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(stats);
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
