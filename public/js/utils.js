// ── Shared Confirm Modal ────────────────────────────────────────────────────
// showConfirm(title, message, callback?, event?)
//   • If callback is provided  → calls callback() on confirm (legacy style)
//   • Always returns a Promise → can also be used with await
// ───────────────────────────────────────────────────────────────────────────
function showConfirm(title, message, callback, event, confirmText = 'Yes, Delete', isDestructive = true) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-icon').textContent = isDestructive ? '🗑️' : '📧';
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').innerHTML = message.replace(/\n/g, '<br>');

        // Clone yes-button to wipe any previous listeners
        const oldYes = document.getElementById('confirm-yes-btn');
        const newYes = oldYes.cloneNode(true);
        oldYes.parentNode.replaceChild(newYes, oldYes);

        // Update Button Text & Style
        newYes.textContent = confirmText;
        if (!isDestructive) {
            newYes.style.background = 'rgba(99, 102, 241, 0.2)'; // Indigo/Primary
            newYes.style.borderColor = 'rgba(99, 102, 241, 0.45)';
            newYes.style.color = '#a5b4fc';
        } else {
            // Reset to danger style
            newYes.style.background = 'rgba(244, 63, 94, 0.2)';
            newYes.style.borderColor = 'rgba(244, 63, 94, 0.45)';
            newYes.style.color = '#fda4af';
        }

        // Clone cancel-button too
        const oldCancel = newYes.nextElementSibling;
        if (oldCancel) {
            const newCancel = oldCancel.cloneNode(true);
            oldCancel.parentNode.replaceChild(newCancel, oldCancel);
            newCancel.onclick = () => { closeConfirmModal(); resolve(false); };
        }

        newYes.onclick = () => {
            closeConfirmModal();
            if (callback) callback();
            resolve(true);
        };

        modal.style.display = 'flex';
        // Timestamp so the backdrop-click guard knows the modal just opened
        modal.dataset.openedAt = Date.now();
    });
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').style.display = 'none';
}

// Close modals when clicking directly on the dark backdrop (not the card)
window.addEventListener('click', function (event) {
    // Confirm modal
    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal && event.target === confirmModal) {
        const openedAt = parseInt(confirmModal.dataset.openedAt || 0);
        if (Date.now() - openedAt > 200) {
            closeConfirmModal();
        }
    }

    // Creation modal (meetings/tasks/events)
    const creationModal = document.getElementById('creation-modal');
    if (creationModal && event.target === creationModal) {
        if (typeof hideCreationForm === 'function') hideCreationForm();
    }
});

window.showConfirm = showConfirm;
window.closeConfirmModal = closeConfirmModal;

/**
 * Formats a phone number string into (XXX) XXX-XXXX
 * @param {string} phoneStr 
 * @returns {string}
 */
function formatPhone(phoneStr) {
    if (!phoneStr) return '';
    // Clean digits
    let cleaned = ('' + phoneStr).replace(/\D/g, '');
    
    // If it starts with 1 and is 11 digits, strip the 1 for formatting
    if (cleaned.length === 11 && cleaned[0] === '1') {
        cleaned = cleaned.substring(1);
    }
    
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
        return '(' + match[1] + ') ' + match[2] + '-' + match[3];
    }
    // If it doesn't match 10 digits exactly, return original
    return phoneStr;
}

window.formatPhone = formatPhone;

// Auth guard - stub until login system is built
function checkGlobalAuth() {
    const session = localStorage.getItem('mlo_session');
    if (!session) {
        // Not blocking yet - just log for now
        console.info('Auth check: no session found (non-blocking)');
    }
}
window.checkGlobalAuth = checkGlobalAuth;
