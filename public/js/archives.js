async function loadArchiveHistory() {
  try {
    const response = await fetch('/api/archives/history');
    const history = await response.json();
    displayArchiveHistory(history);
  } catch (err) {
    console.error('History Load Error:', err);
  }
}

function displayArchiveHistory(history) {
  const container = document.getElementById('archive-history');
  
  if (!history || history.length === 0) {
    container.innerHTML = '<div class="empty-state" style="text-align:center; padding:40px; opacity:0.6;">No archive records found</div>';
    return;
  }
  
  container.innerHTML = `
    <div class="glass-card" style="padding: 0; overflow: hidden;">
        <table class="archive-table" style="width: 100%; border-collapse: collapse;">
          <thead style="background: rgba(255,255,255,0.03);">
            <tr>
              <th style="padding: 15px; text-align: left; font-size: 13px; opacity: 0.7;">Date Archived</th>
              <th style="padding: 15px; text-align: left; font-size: 13px; opacity: 0.7;">Type</th>
              <th style="padding: 15px; text-align: left; font-size: 13px; opacity: 0.7;">Records</th>
              <th style="padding: 15px; text-align: left; font-size: 13px; opacity: 0.7;">Date Range</th>
              <th style="padding: 15px; text-align: left; font-size: 13px; opacity: 0.7;">Size</th>
              <th style="padding: 15px; text-align: right; font-size: 13px; opacity: 0.7;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(archive => `
              <tr style="border-top: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 15px; font-size: 14px;">${new Date(archive.created_at).toLocaleDateString()}</td>
                <td style="padding: 15px; font-size: 14px;">
                    <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: ${archive.archive_type === 'campaign_sends' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)'}; color: ${archive.archive_type === 'campaign_sends' ? '#818cf8' : '#34d399'};">
                        ${archive.archive_type.replace('_', ' ')}
                    </span>
                </td>
                <td style="padding: 15px; font-size: 14px; font-weight: 500;">${archive.records_archived.toLocaleString()}</td>
                <td style="padding: 15px; font-size: 13px; opacity: 0.8;">
                  ${archive.date_range_start ? new Date(archive.date_range_start).toLocaleDateString() : 'N/A'} - 
                  ${archive.date_range_end ? new Date(archive.date_range_end).toLocaleDateString() : 'N/A'}
                </td>
                <td style="padding: 15px; font-size: 14px; opacity: 0.8;">${(archive.file_size_bytes / 1024).toFixed(1)} KB</td>
                <td style="padding: 15px; text-align: right;">
                  <div style="display: flex; gap: 8px; justify-content: flex-end;">
                      <a href="${archive.drive_file_url}" target="_blank" class="action-btn-secondary" title="View in Google Drive">
                        📂
                      </a>
                      <button onclick="restoreArchive(${archive.id})" class="action-btn-secondary" title="Restore Data to Database">
                        🔄
                      </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
    </div>
  `;
}

async function runArchiveNow(event) {
  const confirmed = await showConfirm('Confirm Manual Archive', 'This will move campaign sends older than 3 months and analytics older than 12 months to Google Drive folders. Proceed?');
  if (!confirmed) return;
  
  const button = event.currentTarget;
  const originalText = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="loader-small"></span> Archiving...';
  
  try {
    const response = await fetch('/api/archives/run', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
        showToast('Archive complete! Success ✓');
        loadArchiveStats();
        loadArchiveHistory();
    } else {
        showToast('Archive failed: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Archive failed: ' + error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function restoreArchive(archiveId) {
  const confirmed = await showConfirm('Restore Archived Data', 'Are you sure you want to restore these records back into the main database?');
  if (!confirmed) return;
  
  try {
    const response = await fetch(`/api/archives/restore/${archiveId}`, { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
        showToast(`Successfully restored ${result.records_restored} records!`);
        // We might want to refresh current views if applicable
    } else {
        showToast('Restore failed: ' + result.error, 'error');
    }
  } catch (error) {
    showToast('Restore failed: ' + error.message, 'error');
  }
}

async function loadArchiveStats() {
  try {
    const response = await fetch('/api/archives/stats');
    const stats = await response.json();
    
    document.getElementById('total-archives').textContent = stats.total_archives || 0;
    document.getElementById('total-records').textContent = stats.total_records_archived?.toLocaleString() || 0;
    
    const sizeMB = (stats.total_size_bytes / (1024 * 1024)).toFixed(2);
    document.getElementById('total-size').textContent = `${sizeMB} MB`;
  } catch (err) {
    console.error('Stats Load Error:', err);
  }
}

// Global initialization hook
window.initArchives = () => {
    loadArchiveStats();
    loadArchiveHistory();
};
