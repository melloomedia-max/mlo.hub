// Make available globally
window.showCreationForm = showCreationForm;
window.hideCreationForm = hideCreationForm;
window.toggleCreationFields = toggleCreationFields;
window.handleCreationSubmit = handleCreationSubmit;

async function showCreationForm(defaultType = 'meeting') {
    const modal = document.getElementById('creation-modal');
    const form = document.getElementById('unified-creation-form');
    const typeSelect = document.getElementById('creation-type');

    form.reset();
    if (defaultType) typeSelect.value = defaultType;

    toggleCreationFields();

    // Check Auth Status (Legacy meeting logic)
    try {
        const response = await fetch('/api/auth/status');
        const status = await response.json();
        // Handle auth warnings if needed for meetings
    } catch (e) {
        console.error('Auth check failed', e);
    }

    modal.style.display = 'flex';
}

function hideCreationForm() {
    document.getElementById('creation-modal').style.display = 'none';
}

function toggleCreationFields() {
    const type = document.getElementById('creation-type').value;
    const sections = document.querySelectorAll('.creation-section');
    const submitBtn = document.getElementById('creation-submit-btn');
    const modalTitle = document.getElementById('creation-modal-title');

    // Hide all
    sections.forEach(s => s.style.display = 'none');

    // Show relevant
    if (type === 'meeting') {
        document.querySelectorAll('.meeting-only').forEach(s => s.style.display = 'block');
        submitBtn.textContent = 'Schedule Meeting';
        modalTitle.textContent = 'Schedule Meeting';
    } else if (type === 'task') {
        document.querySelectorAll('.task-only').forEach(s => s.style.display = 'block');
        submitBtn.textContent = 'Create Task';
        modalTitle.textContent = 'Create Task';
        populateClientSelect('creation-task-client');
        populateStaffSelect('creation-task-staff');
    } else if (type === 'event') {
        document.querySelectorAll('.event-only').forEach(s => s.style.display = 'block');
        submitBtn.textContent = 'Create Event';
        modalTitle.textContent = 'Create Calendar Event';
        populateStaffSelect('creation-event-staff');
    }
}

async function populateClientSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const response = await fetch(`${API_BASE}/crm/clients`);
        const clients = await response.json();

        const currentVal = select.value;
        select.innerHTML = '<option value="">Select Client (Optional)</option>' +
            clients.map(c => `<option value="${c.first_name} ${c.last_name}">${c.first_name} ${c.last_name}</option>`).join(''); // Fixed select option text to show names properly
        select.value = currentVal;
    } catch (error) {
        console.error('Error populating clients:', error);
    }
}

async function populateStaffSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const response = await fetch(`${API_BASE}/staff`);
        if (response.ok) {
            const staff = await response.json();
            const currentVal = select.value;
            select.innerHTML = '<option value="">Assign To...</option>' + 
                staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            select.value = currentVal;
        }
    } catch (error) {
        console.error('Error populating staff:', error);
    }
}

async function handleCreationSubmit(event) {
    event.preventDefault();
    const type = document.getElementById('creation-type').value;

    if (type === 'meeting' || type === 'event') {
        await submitMeetingOrEvent(type);
    } else if (type === 'task') {
        await submitTask();
    }
}

async function submitMeetingOrEvent(type) {
    const meeting = {
        title: document.getElementById('creation-title').value,
        description: document.getElementById('creation-description').value,
        start_time: document.getElementById('creation-start').value,
        end_time: document.getElementById('creation-end').value,
        attendees: document.getElementById('creation-attendees')?.value || '',
        notify_staff_id: document.getElementById('creation-event-staff')?.value || null
    };

    let endpoint;
    if (type === 'event') {
        endpoint = '/meetings/calendar-event';
    } else {
        const useGoogleMeet = document.getElementById('creation-google-meet')?.checked;
        endpoint = useGoogleMeet ? '/meetings/google-meet' : '/meetings';
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meeting)
        });

        const data = await response.json();

        if (response.ok) {
            hideCreationForm();
            if (window.loadMeetings) loadMeetings();

            showToast(`${type === 'meeting' ? 'Meeting' : 'Event'} created — invite emails sent ✅`);

            // Show Link Modal if Meet Link exists
            if (data.meet_link) {
                showMeetingSuccessModal(data.meet_link, data.html_link);
            }
        } else {
            showToast('Error: ' + (data.error || data.message), 'error');
        }
    } catch (error) {
        console.error('Submit failed', error);
        showToast('Failed to connect to server', 'error');
    }
}

// Modal Helpers
function showMeetingSuccessModal(link, calendarLink) {
    const modal = document.getElementById('meeting-success-modal');
    const linkSpan = document.getElementById('created-meet-link');
    const joinBtn = document.getElementById('join-meet-btn');

    linkSpan.textContent = link;
    joinBtn.href = link;

    // Show/hide calendar link
    let calEl = document.getElementById('meet-calendar-link');
    if (!calEl) {
        calEl = document.createElement('a');
        calEl.id = 'meet-calendar-link';
        calEl.target = '_blank';
        calEl.style.cssText = 'display:block; text-align:center; font-size:12px; color:#a5b4fc; margin-top:10px; text-decoration:underline;';
        joinBtn.parentNode.insertBefore(calEl, joinBtn.nextSibling);
    }
    if (calendarLink) {
        calEl.href = calendarLink;
        calEl.textContent = '📅 View event in Google Calendar';
        calEl.style.display = 'block';
    } else {
        calEl.style.display = 'none';
    }

    modal.style.display = 'flex';
}

function closeMeetingModal() {
    document.getElementById('meeting-success-modal').style.display = 'none';
}

function copyMeetLink() {
    const link = document.getElementById('created-meet-link').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link copied to clipboard!');
    }, () => {
        showToast('Failed to copy', 'error');
    });
}

async function submitTask() {
    const task = {
        title: document.getElementById('creation-title').value,
        description: document.getElementById('creation-description').value,
        status: document.getElementById('creation-task-status').value,
        priority: document.getElementById('creation-task-priority').value,
        client_id: document.getElementById('creation-task-client').value || null,
        assigned_to: document.getElementById('creation-task-staff')?.value || null,
        due_date: document.getElementById('creation-task-due').value || null
    };

    try {
        const response = await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });

        if (response.ok) {
            hideCreationForm();
            if (window.loadTasks) loadTasks();
            showToast('Task created successfully');
        } else {
            const error = await response.json();
            showToast('Error: ' + (error.error || error.message), 'error');
        }
    } catch (error) {
        console.error('Task submit failed', error);
        showToast('Failed to connect to server', 'error');
    }
}

async function loadMeetings() {
    const container = document.getElementById('meetings-list');
    if (!container) return; // Guard clause

    // Clear content completely (removes any stale artifact panels)
    container.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE}/meetings`);
        const meetings = await response.json();
        displayMeetings(meetings);
    } catch (error) {
        console.error('Error loading meetings:', error);
        container.innerHTML = '<p class="empty-state">Error loading meetings</p>';
    }
}

function displayMeetings(meetings) {
    const container = document.getElementById('meetings-list');
    if (!container) return; // Guard clause

    if (meetings.length === 0) {
        container.innerHTML = '<p class="empty-state">No meetings scheduled.</p>';
        return;
    }

    container.innerHTML = meetings.map(meeting => `
    <div class="meeting-card" 
         oncontextmenu="ContextMenu.attach(event, 'meeting', ${meeting.id}, '${(meeting.title || "").replace(/'/g, "\\'")}')"
         data-context="meeting">
      <div class="card-header" style="background:${meeting.meet_link ? 'rgba(99,102,241,0.15)' : 'transparent'}; padding: ${meeting.meet_link ? '10px' : '0'}; border-radius:10px; margin-bottom:10px; border: ${meeting.meet_link ? '1px solid rgba(99,102,241,0.25)' : 'none'};">
          <h3 style="margin:0; color: rgba(255,255,255,0.95); font-size:15px; font-weight:700;">${meeting.title}</h3>
          ${meeting.meet_link ? '<span style="font-size:12px; color:#a5b4fc; display:flex; align-items:center; gap:4px; margin-top:4px;">🎥 Google Meet</span>' : ''}
      </div>
      <p style="color:rgba(255,255,255,0.55); font-size:13px; margin-bottom:12px;">${meeting.description || ''}</p>
      <div class="meeting-time" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); padding:10px 12px; border-radius:8px; font-size:13px; color:rgba(255,255,255,0.7); margin-bottom:12px;">
        <div style="margin-bottom:4px;"><strong style="color:rgba(255,255,255,0.5); font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Start</strong><br>${new Date(meeting.start_time).toLocaleString()}</div>
        <div><strong style="color:rgba(255,255,255,0.5); font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">End</strong><br>${new Date(meeting.end_time).toLocaleString()}</div>
      </div>
      
      ${meeting.meet_link ?
            `<a href="${meeting.meet_link}" target="_blank" class="meet-link" style="display:block; text-align:center; background:linear-gradient(135deg,rgba(99,102,241,0.8),rgba(167,139,250,0.7)); color:white; text-decoration:none; padding:10px; border-radius:8px; margin-bottom:8px; font-weight:600; font-size:14px;">Join Meeting</a>
             <button onclick="checkMeetingArtifacts(${meeting.id}, this)" class="secondary-btn" style="width:100%; margin-bottom:12px; font-size:12px; padding:8px;">📄 View Details / Recordings</button>`
            : ''}
          
      ${meeting.attendees ? `<p style="font-size:12px; color:rgba(255,255,255,0.5); margin-bottom:12px;"><strong style="color:rgba(255,255,255,0.7);">Attendees:</strong> ${meeting.attendees}</p>` : ''}
      
      <button onclick="deleteMeeting(${meeting.id}, event)" class="delete-btn" style="width:100%;">Delete Meeting</button>
      <div id="artifacts-${meeting.id}" style="margin-top:10px; font-size:12px; display:none; color:rgba(255,255,255,0.7);"></div>
    </div>
  `).join('');
}

async function checkMeetingArtifacts(id, btn) {
    const container = document.getElementById(`artifacts-${id}`);
    btn.textContent = 'Checking...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/meetings/${id}/artifacts`);
        const data = await response.json();

        let html = '<div style="background:#f1f5f9; padding:10px; border-radius:4px;">';

        // Participants
        if (data.participants && data.participants.length > 0) {
            html += `<strong>Participants (${data.participants.length}):</strong><ul style="padding-left:15px; margin:5px 0;">`;
            data.participants.forEach(p => {
                html += `<li>${p.signedinUser?.displayName || 'Guest'}</li>`;
            });
            html += '</ul>';
        } else {
            html += '<p>No participant data available.</p>';
        }

        // Recordings
        if (data.recordings && data.recordings.length > 0) {
            html += `<strong style="display:block; margin-top:10px;">Recordings:</strong>`;
            data.recordings.forEach(rec => {
                let driveLink = '#';
                let fileId = '';

                if (rec.driveDestination) {
                    if (rec.driveDestination.exportUri) {
                        driveLink = rec.driveDestination.exportUri;
                    } else if (rec.driveDestination.file) {
                        // Fallback manual construction
                        fileId = rec.driveDestination.file.replace(/^files\//, ''); // Regex just in case
                        driveLink = `https://drive.google.com/file/d/${fileId}/view`;
                    }
                }

                const time = rec.startTime ? new Date(rec.startTime).toLocaleTimeString() : 'Recording';
                html += `<a href="${driveLink}" target="_blank" style="color:#d93025; display:block; margin-top:4px; text-decoration:none;">🎥 Watch Recording (${time})</a>`;
            });
        }

        if (data.note) {
            html += `<p style="font-style:italic; color:#888; margin-top:5px;">${data.note}</p>`;
        }

        html += '</div>';
        container.innerHTML = html;
        container.style.display = 'block';

    } catch (e) {
        console.error(e);
        showToast('Failed to fetch details', 'error');
    } finally {
        btn.textContent = '📄 View Details / Recordings';
        btn.disabled = false;
    }
}

async function deleteMeeting(meetingId, event) {
    showConfirm('Delete meeting?', 'Are you sure you want to delete this meeting?', async () => {
        try {
            const response = await fetch(`${API_BASE}/meetings/${meetingId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                loadMeetings();
                // Refresh calendar if available
                if (window.renderCalendar) window.renderCalendar();

                showToast('Meeting deleted');
            } else {
                showToast('Failed to delete meeting', 'error');
            }
        } catch (error) {
            console.error('delete failed', error);
        }
    }, event);
}
