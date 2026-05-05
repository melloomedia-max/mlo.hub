#!/usr/bin/env python3
"""
Integrate file upload section into portal.html
"""

import re

# Read the original portal.html
with open('public/portal.html', 'r') as f:
    content = f.read()

# CSS to add (before /* ─── Request Panel ──── */)
upload_css = """
    /* ─── File Upload ──────────────────────────────────────── */
    .upload-section {
      margin-top: 48px;
      background: var(--glass);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      backdrop-filter: blur(20px);
      overflow: hidden;
    }

    .upload-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--border);
    }

    .upload-head-left {
      display: flex; align-items: center; gap: 10px;
    }

    .upload-head-icon {
      width: 32px; height: 32px; border-radius: 9px;
      background: rgba(99,102,241,0.12);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
    }

    .upload-head-text {
      font-size: 14px; font-weight: 700; color: var(--text);
    }

    .upload-head-sub {
      font-size: 12px; color: var(--muted); font-weight: 400;
    }

    .upload-toggle {
      font-size: 11px; font-weight: 600; color: var(--accent-2);
      cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;
      transition: color 0.2s;
    }

    .upload-toggle:hover { color: #fff; }

    .upload-body { padding: 20px 24px 24px; }

    .upload-dropzone {
      border: 2px dashed var(--border);
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.25s var(--ease);
      background: rgba(255,255,255,0.02);
      margin-bottom: 20px;
    }

    .upload-dropzone:hover,
    .upload-dropzone.drag-over {
      border-color: var(--accent);
      background: rgba(99,102,241,0.05);
    }

    .upload-dropzone-icon {
      font-size: 42px;
      margin-bottom: 12px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));
    }

    .upload-dropzone-text {
      font-size: 14px; font-weight: 600; color: var(--text);
      margin-bottom: 4px;
    }

    .upload-dropzone-sub {
      font-size: 12px; color: var(--muted);
    }

    .upload-progress {
      display: none;
      margin-top: 12px;
    }

    .upload-progress.show {
      display: block;
    }

    .upload-progress-bar {
      width: 100%; height: 6px;
      background: rgba(255,255,255,0.06);
      border-radius: 99px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .upload-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      border-radius: 99px;
      transition: width 0.3s var(--ease);
      width: 0;
    }

    .upload-progress-text {
      font-size: 11px; color: var(--muted);
      text-align: center;
    }

    .files-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .file-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      border-radius: 10px;
      transition: all 0.2s;
    }

    .file-item:hover {
      background: rgba(255,255,255,0.05);
      border-color: var(--border-hi);
    }

    .file-item-icon {
      font-size: 24px;
      flex-shrink: 0;
      width: 32px;
      text-align: center;
    }

    .file-item-info {
      flex: 1;
      min-width: 0;
    }

    .file-item-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .file-item-meta {
      font-size: 11px;
      color: var(--faint);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .file-item-uploader {
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(45,212,191,0.12);
      color: #6ee7b7;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .file-item-uploader.staff {
      background: rgba(99,102,241,0.12);
      color: #a5b4fc;
    }

    .file-item-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .file-item-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--glass);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--muted);
      transition: all 0.2s;
      font-size: 14px;
    }

    .file-item-btn:hover {
      border-color: var(--border-hi);
      background: var(--glass-hi);
      color: var(--text);
    }

    .file-item-btn.delete {
      color: var(--rose);
    }

    .file-item-btn.delete:hover {
      background: rgba(244,63,94,0.1);
      border-color: rgba(244,63,94,0.3);
    }

    .files-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--faint);
      font-size: 13px;
    }

    #file-input {
      display: none;
    }
"""

# HTML to add (after media-area, before request-section)
upload_html = """
    <!-- File Upload -->
    <div class="upload-section anim" style="animation-delay:0.28s;" id="upload-section">
      <div class="upload-head">
        <div class="upload-head-left">
          <div class="upload-head-icon">📎</div>
          <div>
            <div class="upload-head-text">Your Files</div>
            <div class="upload-head-sub">Upload files to share with Melloo Media, or download what we've shared with you.</div>
          </div>
        </div>
        <span class="upload-toggle" id="upload-toggle" onclick="toggleUploadZone()">UPLOAD</span>
      </div>
      <div class="upload-body">
        <div id="upload-dropzone-container" style="display: none;">
          <div class="upload-dropzone" id="upload-dropzone" onclick="document.getElementById('file-input').click()">
            <div class="upload-dropzone-icon">📁</div>
            <div class="upload-dropzone-text">Drop files here or click to browse</div>
            <div class="upload-dropzone-sub">Maximum file size: 50 MB</div>
          </div>
          <input type="file" id="file-input" multiple>
          <div class="upload-progress" id="upload-progress">
            <div class="upload-progress-bar">
              <div class="upload-progress-fill" id="upload-progress-fill"></div>
            </div>
            <div class="upload-progress-text" id="upload-progress-text">Uploading...</div>
          </div>
        </div>
        <div class="files-list" id="files-list">
          <div class="files-empty">Loading files...</div>
        </div>
      </div>
    </div>
"""

# JavaScript to add (before closing </script>)
upload_js = """
    // ─── File Upload ────────────────────────────────────────
    let uploadedFiles = [];
    let isUploadZoneVisible = false;

    function toggleUploadZone() {
      isUploadZoneVisible = !isUploadZoneVisible;
      const container = document.getElementById('upload-dropzone-container');
      const toggle = document.getElementById('upload-toggle');
      
      if (isUploadZoneVisible) {
        container.style.display = 'block';
        toggle.textContent = 'HIDE';
      } else {
        container.style.display = 'none';
        toggle.textContent = 'UPLOAD';
      }
    }

    // Load uploaded files
    async function loadUploadedFiles() {
      try {
        const res = await fetch(`/portal/api/${token}/files`);
        if (!res.ok) throw new Error('Failed to load files');
        const data = await res.json();
        uploadedFiles = data.files || [];
        renderUploadedFiles();
      } catch (e) {
        console.error('[Upload] Load error:', e);
        document.getElementById('files-list').innerHTML = '<div class="files-empty">Failed to load files</div>';
      }
    }

    function renderUploadedFiles() {
      const list = document.getElementById('files-list');
      
      if (!uploadedFiles.length) {
        list.innerHTML = '<div class="files-empty">No files yet. Upload files to share with Melloo Media.</div>';
        return;
      }

      list.innerHTML = uploadedFiles.map(f => {
        const icon = mimeIcon(f.mime_type);
        const size = formatSize(f.file_size);
        const date = formatDate(f.created_at);
        const isClient = f.uploaded_by_type === 'client';
        
        return `
          <div class="file-item" style="animation: fadeUp 0.3s var(--ease) both;">
            <div class="file-item-icon">${icon}</div>
            <div class="file-item-info">
              <div class="file-item-name" title="${f.file_name}">${f.file_name}</div>
              <div class="file-item-meta">
                <span>${size}</span>
                <span>·</span>
                <span>${date}</span>
                <span class="file-item-uploader ${isClient ? '' : 'staff'}">${isClient ? 'You' : 'Staff'}</span>
              </div>
            </div>
            <div class="file-item-actions">
              <a class="file-item-btn" href="${f.drive_view_link}" target="_blank" title="View">
                👁️
              </a>
              <a class="file-item-btn" href="${f.drive_download_link}" download title="Download">
                ⬇️
              </a>
              ${isClient ? `<button class="file-item-btn delete" onclick="deleteFile(${f.id})" title="Delete">🗑️</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    // File input handler
    document.getElementById('file-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      for (const file of files) {
        await uploadFile(file);
      }

      e.target.value = ''; // Reset input
      loadUploadedFiles(); // Reload list
    });

    // Drag and drop handlers
    const dropzone = document.getElementById('upload-dropzone');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => {
        dropzone.classList.remove('drag-over');
      }, false);
    });

    dropzone.addEventListener('drop', async (e) => {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        await uploadFile(file);
      }
      loadUploadedFiles();
    }, false);

    // Upload file function
    async function uploadFile(file) {
      // Validate size
      if (file.size > 50 * 1024 * 1024) {
        showToast(`❌ ${file.name} is too large (max 50 MB)`);
        return;
      }

      const progress = document.getElementById('upload-progress');
      const progressFill = document.getElementById('upload-progress-fill');
      const progressText = document.getElementById('upload-progress-text');

      progress.classList.add('show');
      progressFill.style.width = '0%';
      progressText.textContent = `Uploading ${file.name}...`;

      try {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = percent + '%';
            progressText.textContent = `Uploading ${file.name}... ${percent}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            showToast(`✅ ${file.name} uploaded successfully`);
            progressFill.style.width = '100%';
            progressText.textContent = 'Upload complete!';
            setTimeout(() => {
              progress.classList.remove('show');
            }, 2000);
          } else {
            const data = JSON.parse(xhr.responseText);
            showToast(`❌ Upload failed: ${data.error || 'Unknown error'}`);
            progress.classList.remove('show');
          }
        });

        xhr.addEventListener('error', () => {
          showToast(`❌ Upload failed: Network error`);
          progress.classList.remove('show');
        });

        xhr.open('POST', `/portal/api/${token}/upload`);
        xhr.send(formData);

      } catch (e) {
        console.error('[Upload] Error:', e);
        showToast(`❌ Upload failed: ${e.message}`);
        progress.classList.remove('show');
      }
    }

    // Delete file function
    async function deleteFile(fileId) {
      if (!confirm('Delete this file? This action cannot be undone.')) return;

      try {
        const res = await fetch(`/portal/api/${token}/files/${fileId}`, {
          method: 'DELETE'
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Delete failed');
        }

        showToast('✅ File deleted');
        loadUploadedFiles();
      } catch (e) {
        console.error('[Upload] Delete error:', e);
        showToast(`❌ ${e.message}`);
      }
    }
"""

# 1. Insert CSS before /* ─── Request Panel ──── */
content = re.sub(
    r'(    /\* ─── Request Panel ────────)',
    upload_css + r'\n\1',
    content
)

# 2. Insert HTML before first <!-- Request --> or <div class="request-section
content = re.sub(
    r'(    <!-- Request -->)',
    upload_html + '\n\1',
    content
)

# 3. Insert JS before the last </script> and after loadPortalData's success block
# First, add the call to loadUploadedFiles() at the end of loadPortalData
content = re.sub(
    r'(loadRequestHistory\(\);)',
    r'\1\n        loadUploadedFiles();',
    content
)

# Then add the upload functions before closing </script>
content = re.sub(
    r'(  </script>)(?!.*</script>)',  # Match the last </script>
    upload_js + r'\n\1',
    content,
    flags=re.DOTALL
)

# Write the modified content
with open('public/portal.html', 'w') as f:
    f.write(content)

print("✓ Successfully integrated file upload section into portal.html")
print("✓ CSS added before Request Panel styles")
print("✓ HTML added before Request section")
print("✓ JavaScript added to page script")
print("✓ loadUploadedFiles() call added to loadPortalData()")
