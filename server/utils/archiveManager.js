const { google } = require('googleapis');
const db = require('../database');
const fs = require('fs');
const path = require('path');

class ArchiveManager {
  constructor() {
    this.drive = null;
    this.rootFolderId = null;
  }
  
  async initialize() {
    // Setup Google Drive API client (use existing auth)
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
    
    this.drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Get or create root archive folder
    // Using root as 'root' or a specific parent if needed. 
    // In many drive configs, listing files with 'root' in parents works.
    this.rootFolderId = await this.getOrCreateFolder('Agency Hub Archives', 'root');
    
    // Create README if it doesn't exist
    const readmeExists = await this.drive.files.list({
      q: `name='README.txt' and '${this.rootFolderId}' in parents and trashed=false`,
      fields: 'files(id)'
    });
    
    if (readmeExists.data.files.length === 0) {
      await this.createArchiveReadme();
    }
    
    console.log('Archive Manager initialized. Root folder:', this.rootFolderId);
  }
  
  async getOrCreateFolder(folderName, parentId) {
    // Check if folder exists
    const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive'
    });
    
    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    }
    
    // Create folder
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };
    
    const folder = await this.drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });
    
    console.log(`Created folder: ${folderName}`);
    return folder.data.id;
  }
  
  async getArchiveFolderPath(year, month) {
    // Create year folder
    const yearFolderId = await this.getOrCreateFolder(year.toString(), this.rootFolderId);
    
    // Create month folder
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthNames[month - 1];
    const monthFolderId = await this.getOrCreateFolder(monthName, yearFolderId);
    
    return monthFolderId;
  }
  
  async createArchiveReadme() {
    const readmeContent = `
# Agency Hub Data Archives

This folder contains archived data from your Agency Hub application.

## Folder Structure

- Each year has its own folder (e.g., "2024", "2025")
- Within each year, data is organized by month
- Each month contains JSON files with archived records

## Archive Types

### campaign-sends-YYYY-MM.json
Contains all email and SMS sends from campaigns for that month.
- Includes: subject, body, send time, open time, click time
- Use for: Reviewing past campaign performance
- Restore: Can be restored to main database if needed

### analytics-summary-YYYY-MM.json
Contains aggregated campaign analytics for that month.
- Includes: daily send counts, open rates, click rates, revenue
- Use for: Historical performance analysis

## Archive Schedule

Archives run automatically on the 1st of each month at 2 AM.

- Campaign sends: Archived after 3 months
- Analytics: Archived after 12 months

## Restoring Data

You can restore archived data from the Archives section in Agency Hub.

1. Go to Archives page
2. Find the archive you want to restore
3. Click "Restore" button
4. Data will be added back to main database

## File Format

All files are standard JSON format and can be opened with any text editor or JSON viewer.

Last updated: ${new Date().toISOString()}
    `.trim();
    
    const fileMetadata = {
      name: 'README.txt',
      parents: [this.rootFolderId],
      mimeType: 'text/plain'
    };
    
    const media = {
      mimeType: 'text/plain',
      body: readmeContent
    };
    
    await this.drive.files.create({
      resource: fileMetadata,
      media: media
    });
    
    console.log('Created README.txt in archive folder');
  }
  
  async uploadArchiveFile(data, filename, year, month, metadata = {}) {
    // Get folder for this month
    const folderId = await this.getArchiveFolderPath(year, month);
    
    // Create temp directory path
    const tempDirPath = path.join(__dirname, '../../tmp'); // Changed from /temp to /tmp to follow convention
    if (!fs.existsSync(tempDirPath)) {
      fs.mkdirSync(tempDirPath, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDirPath, filename);
    
    // Write data to temp file
    fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2));
    
    const fileSize = fs.statSync(tempFilePath).size;
    
    // Upload to Drive
    const fileMetadata = {
      name: filename,
      parents: [folderId],
      description: metadata.description || `Archived data from ${year}-${month.toString().padStart(2, '0')}`
    };
    
    const media = {
      mimeType: 'application/json',
      body: fs.createReadStream(tempFilePath)
    };
    
    const file = await this.drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });
    
    // Delete temp file
    fs.unlinkSync(tempFilePath);
    
    console.log(`Uploaded archive: ${filename} (${(fileSize / 1024).toFixed(2)} KB)`);
    
    return {
      fileId: file.data.id,
      fileName: file.data.name,
      fileUrl: file.data.webViewLink,
      fileSize: fileSize
    };
  }
  
  async archiveCampaignSends(monthsOld = 3) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    console.log(`Archiving campaign sends older than ${cutoffDateStr}...`);
    
    // Get sends to archive
    const sends = await new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM campaign_sends 
            WHERE sent_at < ?
            ORDER BY sent_at ASC
        `, [cutoffDateStr], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
    
    if (sends.length === 0) {
      console.log('No sends to archive.');
      return null;
    }
    
    console.log(`Found ${sends.length} sends to archive`);
    
    // Grouping sends by month
    const sendsByMonth = {};
    sends.forEach(send => {
      const date = new Date(send.sent_at);
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!sendsByMonth[key]) {
        sendsByMonth[key] = [];
      }
      sendsByMonth[key].push(send);
    });
    
    // Archive each month
    const archiveResults = [];
    
    for (const [monthKey, monthlySends] of Object.entries(sendsByMonth)) {
      const [year, month] = monthKey.split('-').map(Number);
      
      const filename = `campaign-sends-${year}-${month.toString().padStart(2, '0')}.json`;
      
      const archiveData = {
        archived_at: new Date().toISOString(),
        date_range: {
          start: monthlySends[0].sent_at,
          end: monthlySends[monthlySends.length - 1].sent_at
        },
        total_records: monthlySends.length,
        records: monthlySends
      };
      
      // Upload to Drive
      const uploadResult = await this.uploadArchiveFile(
        archiveData,
        filename,
        year,
        month,
        {
          description: `Campaign sends archive for ${year}-${month.toString().padStart(2, '0')}`
        }
      );
      
      // Move to archive table
      for (const send of monthlySends) {
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO campaign_sends_archive (
                    campaign_id, enrollment_id, client_id, node_id, type,
                    subject, body, status, scheduled_for, sent_at, delivered_at,
                    opened_at, clicked_at, replied_at, failed_at, error_message, metadata, created_at
                ) SELECT campaign_id, enrollment_id, client_id, node_id, type,
                    subject, body, status, scheduled_for, sent_at, delivered_at,
                    opened_at, clicked_at, replied_at, failed_at, error_message, metadata, created_at
                FROM campaign_sends WHERE id = ?
            `, [send.id], function(err) {
                if (err) reject(err); else resolve();
            });
        });
      }
      
      // Delete from main table
      const sendIds = monthlySends.map(s => s.id);
      if (sendIds.length > 0) {
          await new Promise((resolve, reject) => {
              db.run(`DELETE FROM campaign_sends WHERE id IN (${sendIds.join(',')})`, (err) => {
                  if (err) reject(err); else resolve();
              });
          });
      }
      
      // Log archive
      await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO archive_log (
              archive_type, archive_date, records_archived,
              drive_folder_id, drive_file_id, drive_file_url, file_size_bytes,
              date_range_start, date_range_end
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'campaign_sends',
            new Date().toISOString().split('T')[0],
            monthlySends.length,
            folderId,
            uploadResult.fileId,
            uploadResult.fileUrl,
            uploadResult.fileSize,
            monthlySends[0].sent_at,
            monthlySends[monthlySends.length - 1].sent_at
          ], function(err) {
              if (err) reject(err); else resolve();
          });
      });
      
      archiveResults.push({
        month: monthKey,
        records: monthlySends.length,
        file: uploadResult
      });
      
      console.log(`✓ Archived ${monthlySends.length} sends for ${monthKey}`);
    }
    
    // Vacuum database to reclaim space
    db.run('VACUUM');
    
    console.log(`Archive complete. Freed space in main database.`);
    
    return archiveResults;
  }
  
  async archiveAnalytics(monthsOld = 12) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    console.log(`Archiving analytics older than ${cutoffDateStr}...`);
    
    // Get analytics to archive
    const analytics = await new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM campaign_analytics 
            WHERE date < ?
            ORDER BY date ASC
        `, [cutoffDateStr], (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
    
    if (analytics.length === 0) {
      console.log('No analytics to archive.');
      return null;
    }
    
    console.log(`Found ${analytics.length} analytics records to archive`);
    
    // Group by month
    const analyticsByMonth = {};
    analytics.forEach(record => {
      const date = new Date(record.date);
      const key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!analyticsByMonth[key]) {
        analyticsByMonth[key] = [];
      }
      analyticsByMonth[key].push(record);
    });
    
    // Archive each month
    const archiveResults = [];
    
    for (const [monthKey, monthlyAnalytics] of Object.entries(analyticsByMonth)) {
      const [year, month] = monthKey.split('-').map(Number);
      
      const filename = `analytics-summary-${year}-${month.toString().padStart(2, '0')}.json`;
      
      // Calculate monthly summary
      const summary = {
        total_sends: monthlyAnalytics.reduce((sum, a) => sum + (a.sends || 0), 0),
        total_opens: monthlyAnalytics.reduce((sum, a) => sum + (a.opened || 0), 0),
        total_clicks: monthlyAnalytics.reduce((sum, a) => sum + (a.clicked || 0), 0),
        total_conversions: monthlyAnalytics.reduce((sum, a) => sum + (a.conversions || 0), 0),
        total_revenue: monthlyAnalytics.reduce((sum, a) => sum + (a.revenue || 0), 0),
        campaigns_active: new Set(monthlyAnalytics.map(a => a.campaign_id)).size
      };
      
      const archiveData = {
        archived_at: new Date().toISOString(),
        month: monthKey,
        summary: summary,
        daily_records: monthlyAnalytics
      };
      
      // Upload to Drive
      const folderId = await this.getArchiveFolderPath(year, month);
      const uploadResult = await this.uploadArchiveFile(
        archiveData,
        filename,
        year,
        month,
        {
          description: `Analytics summary for ${year}-${month.toString().padStart(2, '0')}`
        }
      );
      
      // Keep summary, delete daily records
      await new Promise((resolve, reject) => {
          db.run(`
            DELETE FROM campaign_analytics WHERE date < ? AND date >= ?
          `, [
            `${year}-${(month + 1).toString().padStart(2, '0')}-01`,
            `${year}-${month.toString().padStart(2, '0')}-01`
          ], function(err) {
              if (err) reject(err); else resolve();
          });
      });
      
      // Log archive
      await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO archive_log (
              archive_type, archive_date, records_archived,
              drive_folder_id, drive_file_id, drive_file_url, file_size_bytes,
              date_range_start, date_range_end
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            'analytics',
            new Date().toISOString().split('T')[0],
            monthlyAnalytics.length,
            folderId,
            uploadResult.fileId,
            uploadResult.fileUrl,
            uploadResult.fileSize,
            monthlyAnalytics[0].date,
            monthlyAnalytics[monthlyAnalytics.length - 1].date
          ], function(err) {
              if (err) reject(err); else resolve();
          });
      });
      
      archiveResults.push({
        month: monthKey,
        records: monthlyAnalytics.length,
        summary: summary,
        file: uploadResult
      });
      
      console.log(`✓ Archived ${monthlyAnalytics.length} analytics records for ${monthKey}`);
    }
    
    db.run('VACUUM');
    
    console.log(`Analytics archive complete.`);
    
    return archiveResults;
  }
  
  async getArchiveHistory(limit = 50) {
    return new Promise((resolve, reject) => {
        db.all(`
          SELECT * FROM archive_log 
          ORDER BY created_at DESC 
          LIMIT ?
        `, [limit], (err, rows) => {
            if (err) reject(err); else resolve(rows || []);
        });
    });
  }
  
  async restoreFromArchive(archiveLogId) {
    // Get archive info
    const archive = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM archive_log WHERE id = ?', [archiveLogId], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
    
    if (!archive) {
      throw new Error('Archive not found');
    }
    
    console.log(`Restoring archive: ${archive.archive_type} from ${archive.archive_date}`);
    
    // Download file from Drive
    const response = await this.drive.files.get(
      { fileId: archive.drive_file_id, alt: 'media' },
      { responseType: 'stream' }
    );
    
    // Save to temp file
    const tempDirPath = path.join(__dirname, '../../tmp');
    if (!fs.existsSync(tempDirPath)) fs.mkdirSync(tempDirPath, { recursive: true });
    const tempFilePath = path.join(tempDirPath, `restore-${Date.now()}.json`);
    const dest = fs.createWriteStream(tempFilePath);
    
    await new Promise((resolve, reject) => {
      response.data
        .on('end', resolve)
        .on('error', reject)
        .pipe(dest);
    });
    
    // Read and parse
    const archiveData = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
    
    // Restore records
    if (archive.archive_type === 'campaign_sends') {
      for (const send of archiveData.records) {
        await new Promise((resolve, reject) => {
            db.run(`
              INSERT INTO campaign_sends (
                id, campaign_id, enrollment_id, client_id, node_id, type,
                subject, body, status, scheduled_for, sent_at, delivered_at,
                opened_at, clicked_at, replied_at, failed_at, error_message, metadata, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              send.id, send.campaign_id, send.enrollment_id, send.client_id, send.node_id, send.type,
              send.subject, send.body, send.status, send.scheduled_for, send.sent_at, send.delivered_at,
              send.opened_at, send.clicked_at, send.replied_at, send.failed_at, send.error_message, send.metadata, send.created_at
            ], (err) => {
                if (err) reject(err); else resolve();
            });
        });
      }
    } else if (archive.archive_type === 'analytics') {
        for (const record of archiveData.daily_records) {
            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT OR REPLACE INTO campaign_analytics (
                        campaign_id, date, sends, opens, clicks, conversions, revenue
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    record.campaign_id, record.date, record.sends, record.opens, record.clicks, record.conversions, record.revenue
                ], (err) => {
                    if (err) reject(err); else resolve();
                });
            });
        }
    }
    
    // Delete temp file
    fs.unlinkSync(tempFilePath);
    
    console.log(`✓ Restored records`);
    
    return archiveData;
  }
}

module.exports = new ArchiveManager();
