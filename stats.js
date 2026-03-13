import { initUser } from './user.js';
import { fetchUserStats, resetProgress } from './db.js';

const WEEKS_TOTAL = 8;
const SENTENCES_PER_WEEK = 7;

function aggregateStats(results) {
  const byWeek = {};
  for (let w = 1; w <= WEEKS_TOTAL; w++) {
    byWeek[w] = new Set();
  }
  let totalDuration = 0;

  const secsPerWordList = [];

  results.forEach((r) => {
    if (r.week >= 1 && r.week <= WEEKS_TOTAL) {
      byWeek[r.week].add(r.sentence_index);
    }
    totalDuration += r.duration_secs || 0;
    const tw = r.total_words || 0;
    if (tw > 0 && (r.duration_secs || 0) >= 0) {
      secsPerWordList.push((r.duration_secs || 0) / tw);
    }
  });

  const totalSentences = Object.values(byWeek).reduce((sum, set) => sum + set.size, 0);
  const totalSecs = Math.round(totalDuration);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  let wordTimeAvg = 0;
  if (secsPerWordList.length > 0) {
    wordTimeAvg = secsPerWordList.reduce((a, b) => a + b, 0) / secsPerWordList.length;
  }

  return { byWeek, totalSentences, mins, secs, wordTimeAvg };
}

function formatTime(mins, secs) {
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatSecs(s) {
  return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(1)}s`;
}

function renderStats({ byWeek, totalSentences, mins, secs, wordTimeAvg }) {
  document.getElementById('statsTotal').textContent = String(totalSentences);
  document.getElementById('statsTime').textContent = formatTime(mins, secs);

  const wordTimeEl = document.getElementById('statsWordTime');
  if (wordTimeEl) {
    if (wordTimeAvg > 0) {
      wordTimeEl.textContent = formatSecs(wordTimeAvg);
      wordTimeEl.closest('.stats-word-time')?.classList.remove('hidden');
    } else {
      wordTimeEl.closest('.stats-word-time')?.classList.add('hidden');
    }
  }

  const weeksEl = document.getElementById('statsWeeks');
  weeksEl.replaceChildren();

  for (let w = 1; w <= WEEKS_TOTAL; w++) {
    const count = byWeek[w].size;
    let starsHtml = '';
    for (let i = 0; i < SENTENCES_PER_WEEK; i++) {
      starsHtml += byWeek[w].has(i)
        ? '<span class="stars-filled">★</span>'
        : '<span class="stars-empty">☆</span>';
    }
    const row = document.createElement('div');
    row.className = 'stats-week-row';
    row.innerHTML = `<span class="stats-week-label">Week ${w}</span><span class="stats-week-stars">${starsHtml}</span><span class="stats-week-count">${count}/7</span>`;
    weeksEl.appendChild(row);
  }
}

async function init() {
  initUser();
  const loading = document.getElementById('statsLoading');
  const content = document.getElementById('statsContent');
  const empty = document.getElementById('statsEmpty');

  const results = await fetchUserStats();

  loading.classList.add('hidden');

  if (results.length === 0) {
    empty.classList.remove('hidden');
    return;
  }

  const stats = aggregateStats(results);
  renderStats(stats);
  content.classList.remove('hidden');

  const resetBtn = document.getElementById('statsResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Sure you want to reset all progress?')) return;
      const ok = await resetProgress();
      if (ok) {
        window.location.href = './index.html';
      } else {
        alert('Could not reset. Try again.');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
