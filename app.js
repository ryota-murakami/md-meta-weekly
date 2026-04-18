// ===================================================
// MD Meta Terminal — App logic
// ===================================================

(async function () {
  const res = await fetch('data.json?v=' + Date.now());
  if (!res.ok) {
    document.body.innerHTML = '<pre style="padding:2rem;color:#f43f5e">Failed to load data.json: ' + res.status + '</pre>';
    return;
  }
  const DATA = await res.json();
  window.MD_META = DATA; // 後方互換
  const TIER_ORDER = ['S+', 'S', 'A', 'B', 'C'];

  // ---------- init ----------
  document.getElementById('last-updated').textContent = DATA.lastUpdated;
  document.getElementById('banlist-summary').textContent = DATA.banlistSummary;

  renderSources();
  renderKPIs();
  renderUsageBars();
  renderTierList();
  renderMatchup();
  renderTrendChart();
  renderDeckGrid('all');
  bindTabs();
  bindNav();
  bindModal();
  bindTickerTime();

  // ---------- sources ----------
  function renderSources() {
    const el = document.getElementById('sources-list');
    el.innerHTML = DATA.sources
      .map(
        (s) =>
          `<li><a href="${s.url}" target="_blank" rel="noopener">${s.name} ↗</a></li>`
      )
      .join('');
  }

  // ---------- KPIs ----------
  function renderKPIs() {
    const decks = DATA.decks;
    document.getElementById('kpi-decks').textContent = decks.length;

    const topTier = decks.filter((d) => d.tier === 'S+' || d.tier === 'S');
    document.getElementById('kpi-top').textContent = topTier.length;

    const topUsage = [...decks].sort((a, b) => b.usageRate - a.usageRate)[0];
    document.getElementById('kpi-top-usage').textContent = topUsage.usageRate.toFixed(1) + '%';
    document.getElementById('kpi-top-usage-name').textContent = topUsage.nameJa;

    const topWin = [...decks].sort((a, b) => b.winRate - a.winRate)[0];
    document.getElementById('kpi-top-winrate').textContent = topWin.winRate.toFixed(1) + '%';
    document.getElementById('kpi-top-winrate-name').textContent = topWin.nameJa;
  }

  // ---------- Usage bars ----------
  function renderUsageBars() {
    const decks = [...DATA.decks].sort((a, b) => b.usageRate - a.usageRate).slice(0, 10);
    const max = decks[0].usageRate;
    const container = document.getElementById('usage-bars');
    container.innerHTML = decks
      .map((d) => {
        const pct = (d.usageRate / max) * 100;
        return `
        <div class="usage-row" data-deck="${d.id}">
          <span class="usage-row-name">${d.nameJa}</span>
          <div class="usage-row-bar">
            <div class="usage-row-fill" style="width:0%; background: linear-gradient(90deg, ${d.colors[0]}, ${d.colors[1]});"></div>
          </div>
          <span class="usage-row-value">${d.usageRate.toFixed(1)}%</span>
        </div>`;
      })
      .join('');

    // animate in
    requestAnimationFrame(() => {
      container.querySelectorAll('.usage-row').forEach((row, i) => {
        const d = decks[i];
        const pct = (d.usageRate / max) * 100;
        const fill = row.querySelector('.usage-row-fill');
        setTimeout(() => (fill.style.width = pct + '%'), i * 40);
      });
    });

    // clickable
    container.querySelectorAll('.usage-row').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openModal(row.dataset.deck));
    });
  }

  // ---------- Tier list ----------
  function renderTierList() {
    const grouped = TIER_ORDER.map((tier) => ({
      tier,
      decks: DATA.decks
        .filter((d) => d.tier === tier)
        .sort((a, b) => b.usageRate - a.usageRate),
    })).filter((g) => g.decks.length > 0);

    const container = document.getElementById('tier-list');
    container.innerHTML = grouped
      .map(
        (g) => `
      <div class="tier-row">
        <div class="tier-label" data-tier="${g.tier}">${g.tier}</div>
        <div class="tier-decks">
          ${g.decks
            .map(
              (d) => `
            <button class="tier-deck-chip" data-deck="${d.id}">
              <span class="tier-deck-dot" style="background:${d.colors[0]}"></span>
              ${d.nameJa}
              <span class="pct">${d.usageRate.toFixed(1)}%</span>
            </button>`
            )
            .join('')}
        </div>
      </div>`
      )
      .join('');

    container.querySelectorAll('.tier-deck-chip').forEach((chip) => {
      chip.addEventListener('click', () => openModal(chip.dataset.deck));
    });
  }

  // ---------- Matchup ----------
  function renderMatchup() {
    const ids = DATA.matchup.decks;
    const data = DATA.matchup.data;
    const table = document.getElementById('matchup-table');
    const n = ids.length;

    // grid-template-columns: first is row-head (160px), then n data cells
    table.style.gridTemplateColumns = `180px repeat(${n}, minmax(56px, 1fr))`;
    table.style.gridAutoRows = '36px';

    let html = '';

    // Top-left corner (empty, header row height)
    html += `<div class="matchup-cell" style="grid-column: 1; grid-row: 1; height:56px;"></div>`;

    // Column headers — horizontal short labels
    ids.forEach((id, c) => {
      const deck = DATA.decks.find((d) => d.id === id);
      const label = deck ? (deck.short || deck.nameJa) : id;
      const full = deck ? deck.nameJa : id;
      html += `<div class="matchup-cell matchup-head" style="grid-column: ${c + 2}; grid-row: 1; height:56px;" title="${full}">${label}</div>`;
    });

    // Rows
    ids.forEach((rowId, r) => {
      const deck = DATA.decks.find((d) => d.id === rowId);
      const name = deck ? deck.nameJa : rowId;
      html += `<div class="matchup-cell matchup-row-head" style="grid-column: 1; grid-row: ${r + 2};">${name}</div>`;
      ids.forEach((colId, c) => {
        const val = data[r][c];
        let cls = 'matchup-data';
        if (r === c) cls += ' mirror';
        else if (val > 55) cls += ' win';
        else if (val < 45) cls += ' loss';
        const display = r === c ? '—' : val + '%';
        // Interpolated background based on win rate (45-55 neutral, beyond is colored)
        let bg = '';
        if (r !== c) {
          const diff = val - 50;
          const alpha = Math.min(Math.abs(diff) / 12, 1);
          if (diff > 2) {
            bg = `background: color-mix(in oklab, #22c55e ${Math.round(alpha * 45)}%, var(--surface-1));`;
          } else if (diff < -2) {
            bg = `background: color-mix(in oklab, #ef4444 ${Math.round(alpha * 45)}%, var(--surface-1));`;
          }
        }
        html += `<div class="${cls}" style="grid-column: ${c + 2}; grid-row: ${r + 2}; ${bg}" title="${name} vs ${DATA.decks.find((d) => d.id === colId)?.nameJa || colId}: ${display}">${display}</div>`;
      });
    });

    table.innerHTML = html;
  }

  // ---------- Trend chart ----------
  function renderTrendChart() {
    const ctx = document.getElementById('trend-chart').getContext('2d');
    const weeks = DATA.trend.weeks.map((w) => w.slice(5).replace('-', '/'));

    // Show top 8 by current usage
    const show = [...DATA.decks]
      .filter((d) => DATA.trend.series[d.id])
      .sort((a, b) => b.usageRate - a.usageRate)
      .slice(0, 8);

    const datasets = show.map((d) => {
      const color = d.colors[0];
      return {
        label: d.nameJa,
        data: DATA.trend.series[d.id],
        borderColor: color,
        backgroundColor: hexA(color, 0.05),
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointBorderColor: '#0a0a0b',
        pointBorderWidth: 2,
        spanGaps: true,
        fill: false,
      };
    });

    new Chart(ctx, {
      type: 'line',
      data: { labels: weeks, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#9ca0ab',
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { family: 'Inter', size: 12 },
              padding: 14,
            },
          },
          tooltip: {
            backgroundColor: '#141418',
            borderColor: '#2a2b33',
            borderWidth: 1,
            titleColor: '#ededee',
            bodyColor: '#9ca0ab',
            titleFont: { family: 'JetBrains Mono', size: 11 },
            bodyFont: { family: 'Inter', size: 12 },
            padding: 10,
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + '%' : 'N/A'}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#1f2027', drawTicks: false },
            ticks: {
              color: '#5a5d67',
              font: { family: 'JetBrains Mono', size: 10 },
            },
            border: { color: '#2a2b33' },
          },
          y: {
            grid: { color: '#1f2027', drawTicks: false },
            ticks: {
              color: '#5a5d67',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: (v) => v + '%',
            },
            border: { color: '#2a2b33' },
            beginAtZero: true,
            suggestedMax: 25,
          },
        },
      },
    });
  }

  // ---------- Deck grid ----------
  function renderDeckGrid(filter) {
    const decks = DATA.decks
      .filter((d) => filter === 'all' || d.tier === filter)
      .sort((a, b) => {
        const ta = TIER_ORDER.indexOf(a.tier);
        const tb = TIER_ORDER.indexOf(b.tier);
        if (ta !== tb) return ta - tb;
        return b.usageRate - a.usageRate;
      });

    const container = document.getElementById('deck-grid');
    container.innerHTML = decks
      .map(
        (d) => `
      <article class="deck-card" data-deck="${d.id}" style="--deck-accent: ${d.colors[0]}">
        <div class="deck-card-head">
          <div>
            <div class="deck-card-title">${d.nameJa}</div>
            <div class="deck-card-sub">${d.nameEn} · ${d.type}</div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            ${trendIcon(d.trend)}
            <span class="tier-badge" data-tier="${d.tier}">${d.tier}</span>
          </div>
        </div>

        <div class="deck-stats">
          <div class="deck-stat">
            <span class="deck-stat-label">使用率</span>
            <span class="deck-stat-value">${d.usageRate.toFixed(1)}<span class="unit">%</span></span>
          </div>
          <div class="deck-stat">
            <span class="deck-stat-label">勝率</span>
            <span class="deck-stat-value">${d.winRate.toFixed(1)}<span class="unit">%</span></span>
          </div>
        </div>

        <p class="deck-summary">${d.summary}</p>

        <div class="deck-tags">
          ${d.strengths
            .slice(0, 3)
            .map((s) => `<span class="tag">✓ ${s}</span>`)
            .join('')}
        </div>
      </article>`
      )
      .join('');

    container.querySelectorAll('.deck-card').forEach((card) => {
      card.addEventListener('click', () => openModal(card.dataset.deck));
    });
  }

  function trendIcon(trend) {
    const map = {
      up: { cls: 'up', glyph: '▲', text: 'UP' },
      down: { cls: 'down', glyph: '▼', text: 'DOWN' },
      stable: { cls: 'stable', glyph: '—', text: 'STABLE' },
      new: { cls: 'new', glyph: '★', text: 'NEW' },
    };
    const t = map[trend] || map.stable;
    return `<span class="trend-icon ${t.cls}" title="${t.text}">${t.glyph}</span>`;
  }

  // ---------- Tabs ----------
  function bindTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        renderDeckGrid(tab.dataset.filter);
      });
    });
  }

  // ---------- Nav ----------
  function bindNav() {
    const items = document.querySelectorAll('.nav-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        items.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
      });
    });

    // Scroll spy
    const sections = document.querySelectorAll('.section');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            items.forEach((i) => {
              i.classList.toggle('active', i.dataset.section === id);
            });
          }
        });
      },
      { threshold: 0.3, rootMargin: '-10% 0px -50% 0px' }
    );
    sections.forEach((s) => observer.observe(s));
  }

  // ---------- Modal ----------
  function bindModal() {
    const modal = document.getElementById('deck-modal');
    modal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function openModal(deckId) {
    const d = DATA.decks.find((x) => x.id === deckId);
    if (!d) return;

    const body = document.getElementById('modal-body');
    const diffStars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

    body.innerHTML = `
      <div class="modal-header">
        <div class="modal-header-top">
          <span class="tier-badge" data-tier="${d.tier}" style="height: 28px; min-width: 36px; font-size: 13px;">${d.tier}</span>
          <div>
            <div class="modal-title">${d.nameJa}</div>
            <div class="modal-subtitle">${d.nameEn} · ${d.type} · ${d.pack}</div>
          </div>
        </div>
      </div>

      <div class="modal-grid">
        <div class="modal-stat">
          <div class="modal-stat-label">使用率</div>
          <div class="modal-stat-value" style="color:${d.colors[0]}">${d.usageRate.toFixed(1)}%</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">勝率</div>
          <div class="modal-stat-value" style="color:${d.colors[1]}">${d.winRate.toFixed(1)}%</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">運用難度</div>
          <div class="modal-stat-value" style="font-size:14px; color:#fbbf24">${diffStars(d.difficulty.play)}</div>
        </div>
        <div class="modal-stat">
          <div class="modal-stat-label">構築難度</div>
          <div class="modal-stat-value" style="font-size:14px; color:#fbbf24">${diffStars(d.difficulty.build)}</div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Archetype Overview</div>
        <p class="modal-section-body">${d.summary}</p>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">主要カード</div>
        <ul class="card-list">
          ${d.keyCards.map((c) => `<li>${c}</li>`).join('')}
        </ul>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">Pros / Cons</div>
        <div class="sw-chips">
          ${d.strengths.map((s) => `<span class="sw-chip pro">+ ${s}</span>`).join('')}
          ${d.weaknesses.map((s) => `<span class="sw-chip con">− ${s}</span>`).join('')}
        </div>
      </div>

      ${
        d.comboLinks && d.comboLinks.length
          ? `
        <div class="modal-section">
          <div class="modal-section-title">回し方・参考リンク</div>
          <div class="combo-links">
            ${d.comboLinks
              .map(
                (l) =>
                  `<a class="combo-link" href="${l.url}" target="_blank" rel="noopener">↗ ${l.label}</a>`
              )
              .join('')}
          </div>
        </div>`
          : ''
      }
    `;

    const modal = document.getElementById('deck-modal');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const modal = document.getElementById('deck-modal');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ---------- Ticker ----------
  function bindTickerTime() {
    const el = document.getElementById('ticker-text');
    const messages = [
      'LIVE · Master 1 環境',
      '新弾 ザ・フレンジー・チューニング 稼働中',
      'キラーチューン — 新環境トップ',
      'VSK9 — 後攻性能 No.1',
    ];
    let i = 0;
    setInterval(() => {
      i = (i + 1) % messages.length;
      el.style.opacity = 0;
      setTimeout(() => {
        el.textContent = messages[i];
        el.style.opacity = 1;
      }, 200);
    }, 4000);
    el.style.transition = 'opacity 200ms ease';
  }

  // ---------- utils ----------
  function hexA(hex, a) {
    if (hex.startsWith('#') && hex.length === 7) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    return hex;
  }
})();
