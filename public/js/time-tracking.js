let activeTimer = null;
let timerInterval = null;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    checkRunningTimer();
});

async function checkRunningTimer() {
    try {
        const response = await fetch(`${API_BASE}/time/running`);
        const timer = await response.json();

        if (timer) {
            resumeTimerUI(timer);
        } else {
            document.getElementById('timer-widget').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking timer:', error);
    }
}

async function startTimer(taskId, taskTitle) {
    if (activeTimer) {
        // Stop current timer first
        await stopTimer();
    }

    try {
        const response = await fetch(`${API_BASE}/time/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task_id: taskId,
                description: `Working on: ${taskTitle}`
            })
        });

        if (response.ok) {
            const timer = await response.json();
            resumeTimerUI({ ...timer, startTime: new Date().toISOString(), taskTitle }); // optimistic title
            showToast('Timer started');
        }
    } catch (error) {
        console.error('Error starting timer:', error);
    }
}

async function stopTimer() {
    if (!activeTimer) return;

    try {
        const response = await fetch(`${API_BASE}/time/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: activeTimer.id })
        });

        if (response.ok) {
            clearInterval(timerInterval);
            activeTimer = null;
            document.getElementById('timer-widget').style.display = 'none';
            showToast('Timer stopped');
        }
    } catch (error) {
        console.error('Error stopping timer:', error);
    }
}

function resumeTimerUI(timer) {
    activeTimer = timer;
    const widget = document.getElementById('timer-widget');
    const timeDisplay = document.getElementById('timer-time');
    const taskDisplay = document.getElementById('timer-task');

    widget.style.display = 'flex';
    // If we have a task ID but no title (from page reload), we might just show "Task #ID" 
    // or fetch task details. For now, simple.
    taskDisplay.textContent = timer.description || 'Untitled Task';

    // Start ticking
    const startTime = new Date(activeTimer.start_time).getTime(); // Note: SQL dates might need Z for UTC
    // Correcting for likely TZ issues: assume server sends UTC string "YYYY-MM-DD HH:mm:ss"
    // JS Date.parse assumes local if no Z. 
    // Let's rely on relative calculation if possible, or just fix DB to store ISO.
    // In database.js we used CURRENT_TIMESTAMP. 
    // In JS:
    const start = new Date(activeTimer.start_time + (activeTimer.start_time.endsWith('Z') ? '' : 'Z')).getTime();

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const diff = now - start;
        timeDisplay.textContent = formatDuration(diff);
    }, 1000);
}

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}
