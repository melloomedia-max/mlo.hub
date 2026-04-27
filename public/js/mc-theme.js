// mc-theme.js — Mission Control look-and-feel for Melloo Hub.
// Injects the macOS title bar and a money-status pill at the bottom of the sidebar.
// Runs idempotently, pure DOM, no business logic.
(function () {
  function injectTitlebar() {
    if (document.querySelector('.mc-titlebar')) return;
    const bar = document.createElement('div');
    bar.className = 'mc-titlebar';
    bar.innerHTML =
      '<div class="traffic">' +
        '<span class="dot dot-red"></span>' +
        '<span class="dot dot-yellow"></span>' +
        '<span class="dot dot-green"></span>' +
      '</div>' +
      '<div class="title">melloo Hub</div>' +
      '<div class="title-right" id="mc-clock"></div>';
    document.body.insertBefore(bar, document.body.firstChild);

    function tickClock() {
      const el = document.getElementById('mc-clock');
      if (!el) return;
      const d = new Date();
      el.textContent = d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    tickClock();
    setInterval(tickClock, 30_000);
  }

  function injectMoneyPill() {
    const header = document.querySelector('body > .container > header');
    if (!header) return;
    if (document.getElementById('mc-money-pill')) return;
    const pill = document.createElement('div');
    pill.id = 'mc-money-pill';
    pill.className = 'mc-money-pill';
    pill.innerHTML =
      '<div class="mc-money-row">' +
        '<span class="mc-money-label">Revenue</span>' +
        '<span class="mc-money-value" id="mc-money-revenue">—</span>' +
      '</div>' +
      '<div class="mc-money-row">' +
        '<span class="mc-money-label">Pending</span>' +
        '<span class="mc-money-value" id="mc-money-pending">—</span>' +
      '</div>' +
      '<div class="mc-money-row">' +
        '<span class="mc-money-label">Clients</span>' +
        '<span class="mc-money-value" id="mc-money-clients">—</span>' +
      '</div>';
    header.appendChild(pill);
    refreshMoney();
    setInterval(refreshMoney, 60_000);
  }

  async function refreshMoney() {
    try {
      const r = await fetch('/api/dashboard', { credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json();
      const fmt = (n) => '$' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setText('mc-money-revenue', fmt(d.totalRevenue));
      setText('mc-money-pending', fmt(d.pendingInvoices));
      setText('mc-money-clients', `${d.totalClients || 0} · ${d.activeClients || 0} active`);
      const pill = document.getElementById('mc-money-pill');
      if (pill && Number(d.pendingInvoices || 0) > 0) pill.classList.add('has-pending');
      else if (pill) pill.classList.remove('has-pending');
    } catch (_) { /* ignore */ }
  }

  function init() {
    injectTitlebar();
    injectMoneyPill();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
