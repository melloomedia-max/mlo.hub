const cron = require('node-cron');
const archiveManager = require('../utils/archiveManager');

function startArchiveScheduler() {
  // Initialize archive manager
  archiveManager.initialize().catch(err => {
    console.error('Failed to initialize archive manager:', err);
  });
  
  // Run monthly on 1st of month at 2 AM
  cron.schedule('0 2 1 * *', async () => {
    console.log('Running monthly archive job...');
    
    try {
      // Archive campaign sends older than 3 months
      const sendsResult = await archiveManager.archiveCampaignSends(3);
      
      if (sendsResult) {
        console.log(`✓ Archived campaign sends for ${sendsResult.length} month(s)`);
      }
      
      // Archive analytics older than 12 months
      const analyticsResult = await archiveManager.archiveAnalytics(12);
      
      if (analyticsResult) {
        console.log(`✓ Archived analytics for ${analyticsResult.length} month(s)`);
      }
      
      console.log('Monthly archive job complete.');
    } catch (error) {
      console.error('Archive job failed:', error);
    }
  });
  
  // Also allow manual trigger
  console.log('Archive scheduler started. Monthly archives run on 1st at 2 AM.');
}

// Manual trigger function
async function runArchiveNow() {
  console.log('Running manual archive...');
  
  await archiveManager.initialize();
  
  const sendsResult = await archiveManager.archiveCampaignSends(3);
  const analyticsResult = await archiveManager.archiveAnalytics(12);
  
  return {
    sends: sendsResult,
    analytics: analyticsResult
  };
}

module.exports = { 
  startArchiveScheduler,
  runArchiveNow
};
