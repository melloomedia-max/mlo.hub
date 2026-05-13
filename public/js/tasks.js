let currentEditingTaskId = null; // Track which task is being edited

// Show/hide task form
async function showTaskForm(isEdit = false) {
    const title = document.querySelector('#task-form h3');
    const submitBtn = document.querySelector('#task-form button[type="submit"]');
    const clientSelect = document.getElementById('task-client-select');

    // Populate clients
    try {
        const response = await fetch(`${API_BASE}/crm/clients`);
        const clients = await response.json();
        clientSelect.innerHTML = '<option value="">Select Client (Optional)</option>' +
            clients.map(c => `<option value="${c.id}">${c.name} ${c.company ? `(${c.company})` : ''}</option>`).join('');
    } catch (e) {
        console.error('Failed to load clients for task form', e);
    }

    // Populate staff
    const staffSelect = document.getElementById('task-staff-select');
    if (staffSelect) {
        try {
            const response = await fetch(`${API_BASE}/staff`);
            if (response.ok) {
                const staff = await response.json();
                staffSelect.innerHTML = '<option value="">Assign To...</option>' +
                    staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            }
        } catch (e) {
            console.error('Failed to load staff', e);
        }
    }

    if (isEdit) {
        if (title) title.textContent = 'Edit Task';
        if (submitBtn) submitBtn.textContent = 'Save Changes';
    } else {
        if (title) title.textContent = 'Create Task';
        if (submitBtn) submitBtn.textContent = 'Create Task';
        currentEditingTaskId = null;
        const form = document.getElementById('task-form')?.querySelector('form');
        if (form) form.reset();
        if (clientSelect) clientSelect.value = ''; // Reset client selection
    }
    const taskForm = document.getElementById('task-form');
    if (taskForm) taskForm.style.display = 'block';
}

function hideTaskForm() {
    const taskForm = document.getElementById('task-form');
    if (taskForm) {
        taskForm.style.display = 'none';
        const form = taskForm.querySelector('form');
        if (form) form.reset();
    }
    currentEditingTaskId = null;
    // Reset staff dropdown if it exists
    const staffSelect = document.getElementById('task-staff-select');
    if (staffSelect) staffSelect.value = '';
}

// Load all tasks
async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/tasks`);
        const tasks = await response.json();
        displayTasks(tasks);
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Display tasks in Kanban columns
function displayTasks(tasks) {
    // Clear columns
    const listTodo = document.getElementById('list-todo');
    const listProgress = document.getElementById('list-in-progress');
    const listDone = document.getElementById('list-done');
    if (listTodo) listTodo.innerHTML = '';
    if (listProgress) listProgress.innerHTML = '';
    if (listDone) listDone.innerHTML = '';

    // Counters
    let counts = { todo: 0, 'in-progress': 0, done: 0 };
    let renderedCounts = { todo: 0, 'in-progress': 0, done: 0 };

    tasks.forEach(task => {
        const status = ['todo', 'in-progress', 'done'].includes(task.status) ? task.status : 'todo';
        counts[status]++;

        const container = document.getElementById(`list-${status}`);
        if (!container) return;

        const card = document.createElement('div');
        card.className = `task-card priority-${task.priority}`;
        card.draggable = true;
        card.ondragstart = (e) => drag(e, task.id);
        card.ondblclick = (e) => editTask(task.id);
        card.oncontextmenu = (e) => ContextMenu.attach(e, 'task', task.id, task.title);
        card.setAttribute('data-context', 'task');

        const clientBadge = task.client_name
            ? `<div class="task-client-badge" style="font-size:11px; background:#f3f4f6; padding:2px 6px; border-radius:4px; display:inline-block; margin-bottom:4px; color:#4b5563;">👤 ${task.client_name}</div>`
            : '';

        card.innerHTML = `
      <div class="task-header">
        ${clientBadge}
        <h3>${task.title}</h3>
        <button class="play-btn" onclick="event.stopPropagation(); startTimer(${task.id}, '${(task.title || "").replace(/'/g, "\\'")}')" title="Start Timer">
            ▶
        </button>
      </div>
      <p>${task.description || ''}</p>
      <div class="task-meta">
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
        ${task.due_date ? `<span class="due-date">Due: ${new Date(task.due_date).toLocaleDateString()}</span>` : ''}
        ${task.staff_name ? `<span class="staff-badge" style="font-size:11px; color:#a5b4fc; background:rgba(99,102,241,0.1); padding:2px 6px; border-radius:4px; margin-left:auto;">👤 ${task.staff_name}</span>` : ''}
      </div>
      <div class="task-actions">
        <button onclick="deleteTask(${task.id}, event)" class="delete-btn">Delete</button>
      </div>
    `;

        container.appendChild(card);
        renderedCounts[status]++;
    });

    // Mismatch Check
    ['todo', 'in-progress', 'done'].forEach(status => {
        if (counts[status] > 0 && renderedCounts[status] !== counts[status]) {
            const container = document.getElementById(`list-${status}`);
            if (container) {
                const notice = `<div class="error-notice" style="padding:15px; font-size:12px; color:#fda4af; text-align:center;">⚠️ Only ${renderedCounts[status]} of ${counts[status]} tasks rendered.</div>`;
                container.innerHTML = notice + container.innerHTML;
                console.warn(`[Tasks] Render mismatch in column ${status}: expected ${counts[status]}, got ${renderedCounts[status]}`);
            }
        }
    });

    // Update badges
    const countTodo = document.getElementById('count-todo');
    const countProgress = document.getElementById('count-in-progress');
    const countDone = document.getElementById('count-done');
    if (countTodo) countTodo.textContent = counts.todo;
    if (countProgress) countProgress.textContent = counts['in-progress'];
    if (countDone) countDone.textContent = counts.done;
}

// Edit Task Function
async function editTask(taskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks`); // Or fetch single endpoint if available. Using list for now as per prev code style.
        const tasks = await response.json();
        const task = tasks.find(t => t.id === taskId);

        if (!task) return;

        currentEditingTaskId = taskId;

        // Open form firsts to populate select
        await showTaskForm(true);

        if (taskForm) {
            const taskTitle = document.getElementById('task-title');
            const taskDesc = document.getElementById('task-description');
            const taskStatus = document.getElementById('task-status');
            const taskPriority = document.getElementById('task-priority');
            const taskDue = document.getElementById('task-due-date');
            const taskClient = document.getElementById('task-client-select');
            const staffSelect = document.getElementById('task-staff-select');

            if (taskTitle) taskTitle.value = task.title;
            if (taskDesc) taskDesc.value = task.description || '';
            if (taskStatus) taskStatus.value = task.status;
            if (taskPriority) taskPriority.value = task.priority;
            if (taskDue) taskDue.value = task.due_date || '';
            if (taskClient && task.client_id) taskClient.value = task.client_id;
            if (staffSelect && task.assigned_to) staffSelect.value = task.assigned_to;
        }

    } catch (error) {
        console.error('Error loading task for edit:', error);
        showToast('Error loading task details', 'error');
    }
}


// Drag and Drop Functions
function allowDrop(ev) {
    ev.preventDefault();
}

function drag(ev, taskId) {
    ev.dataTransfer.setData("text/plain", taskId);
    ev.target.classList.add('dragging');
}

async function drop(ev, newStatus) {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text/plain");
    const el = document.querySelector('.dragging');
    if (el) el.classList.remove('dragging');

    // Optimistic UI update could go here, but for now we'll just call the API
    await updateTaskStatusDirectly(taskId, newStatus);
}

// Direct status update (replaces toggle from before)
async function updateTaskStatusDirectly(taskId, newStatus) {
    try {
        // First get the task (inefficient, but safely gets full object for now)
        const getResponse = await fetch(`${API_BASE}/tasks`);
        const tasks = await getResponse.json();
        const task = tasks.find(t => t.id == taskId); // loose equality for string/int match

        if (!task) return;

        // Only update if status actually changed
        if (task.status === newStatus) return;

        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...task, status: newStatus })
        });

        if (response.ok) {
            loadTasks();
            showToast(`Task moved to ${newStatus.replace('-', ' ')}`);
        } else {
            showToast('Failed to move task', 'error');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showToast('Network error updating task', 'error');
    }
}

// Create or Update task
async function createTask(event) {
    event.preventDefault();

    const task = {
        title: document.getElementById('task-title')?.value || '',
        description: document.getElementById('task-description')?.value || '',
        status: document.getElementById('task-status')?.value || 'todo',
        priority: document.getElementById('task-priority')?.value || 'low',
        due_date: document.getElementById('task-due-date')?.value || '',
        client_id: document.getElementById('task-client-select')?.value || '',
        assigned_to: document.getElementById('task-staff-select')?.value || null
    };

    // Determine URL and Method based on mode
    const url = currentEditingTaskId ? `${API_BASE}/tasks/${currentEditingTaskId}` : `${API_BASE}/tasks`;
    const method = currentEditingTaskId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        });

        if (response.ok) {
            const wasEditing = !!currentEditingTaskId;
            hideTaskForm();
            loadTasks(); // Refresh list
            showToast(wasEditing ? 'Task updated' : 'Task created successfully');
        } else {
            showToast('Failed to save task', 'error');
        }
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Failed to save task', 'error');
    }
}

// Delete task
async function deleteTask(taskId, event) {
    showConfirm('Delete Task?', 'Are you sure you want to delete this task?', async () => {
        try {
            const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                loadTasks();
                showToast('Task deleted');
            } else {
                showToast('Failed to delete task', 'error');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            showToast('Failed to delete task', 'error');
        }
    }, event);
}

// Sync Google Calendar Tasks
async function syncGoogleTasks() {
    const btn = event.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '🔄 Syncing...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/tasks/sync-google`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            if (data.errors && data.errors.length > 0) {
                console.warn('Sync warnings:', data.errors);
                // Check for auth error specifically
                if (data.errors.some(e => e.includes('re-authenticate'))) {
                    showToast('Sync Incomplete: Please support Google Tasks by re-authenticating.', 'error');
                    setTimeout(() => window.location.href = '/auth/google', 2000);
                } else {
                    // Show the first error message directly so user knows what to do
                    const firstError = data.errors[0];
                    showToast(`Sync Warning: ${firstError}`, 'warning');
                }
            } else {
                showToast(data.message || 'Tasks synced successfully');
            }
            loadTasks();
        } else {
            showToast('Error syncing tasks: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Sync error:', error);
        showToast('Failed to sync tasks', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
