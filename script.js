let config = null;
let gameState = {
  detectiveName: '',
  viewedEvidence: [],
  unlockedEvidence: [],
  revealedEvidence: [],
  revealedSuspects: [],
  currentStage: 'start',
  completedStages: [],
  hintsUsed: 0,
  activeHints: []
};

const STORAGE_KEY = 'detective-hub-save';

function saveGame() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
}

function loadGame() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      gameState = { ...gameState, ...parsed };
      return true;
    } catch (e) { return false; }
  }
  return false;
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('detective_name');
  location.reload();
}

async function init() {
  try {
    const resp = await fetch('config.json');
    config = await resp.json();
  } catch (e) {
    document.body.innerHTML = '<div style="padding:2rem;text-align:center;font-family:monospace;">Error loading case config. Make sure config.json is in the same folder.</div>';
    return;
  }

  const hasSave = loadGame();
  const savedName = localStorage.getItem('detective_name');

  if (savedName && hasSave) {
    gameState.detectiveName = savedName;
    document.getElementById('nameGate').classList.add('hidden');
    document.getElementById('mainHub').style.display = 'block';
    setupHub();
    processAllStages();
    renderHub();
  } else {
    setupNameGate();
  }
}

function setupNameGate() {
  const input = document.getElementById('nameInput');
  const btn = document.getElementById('nameBtn');

  input.addEventListener('input', () => {
    btn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim().length > 0) enterCase();
  });
}

function enterCase() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return;

  gameState.detectiveName = name;
  localStorage.setItem('detective_name', name);

  document.getElementById('nameGate').classList.add('hidden');
  document.getElementById('mainHub').style.display = 'block';

  setupHub();
  processStage('start');
  renderHub();
  saveGame();
}

function setupHub() {
  document.getElementById('caseTitle').textContent = config.title;
  document.getElementById('caseSubtitle').textContent = config.subtitle;
  document.getElementById('caseTab').textContent = `Case #${config.caseId} — Active`;
  document.getElementById('footerText').textContent =
    `Case file property of ${config.departmentName} · Unauthorized distribution prohibited`;

  document.getElementById('codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCode();
  });
}

function processStage(stageId) {
  const stage = config.stages.find(s => s.id === stageId);
  if (!stage || gameState.completedStages.includes(stageId)) return;

  gameState.completedStages.push(stageId);
  gameState.currentStage = stageId;

  if (stage.unlockedEvidence) {
    stage.unlockedEvidence.forEach(id => {
      if (!gameState.unlockedEvidence.includes(id)) {
        gameState.unlockedEvidence.push(id);
      }
    });
  }

  if (stage.revealedEvidence) {
    stage.revealedEvidence.forEach(id => {
      if (!gameState.revealedEvidence.includes(id)) {
        gameState.revealedEvidence.push(id);
      }
    });
  }

  if (stage.revealedSuspects) {
    stage.revealedSuspects.forEach(id => {
      if (!gameState.revealedSuspects.includes(id)) {
        gameState.revealedSuspects.push(id);
      }
    });
  }

  if (stage.unlockedAudio) {
    stage.unlockedAudio.forEach(id => {
      if (!gameState.unlockedEvidence.includes('audio-' + id)) {
        gameState.unlockedEvidence.push('audio-' + id);
      }
    });
  }

  if (stage.unlocksOnCorrect) {
    stage.unlocksOnCorrect.forEach(id => {
      if (!gameState.unlockedEvidence.includes(id)) {
        gameState.unlockedEvidence.push(id);
      }
    });
  }

  gameState.activeHints = stage.hints || [];
  gameState.hintsUsed = 0;

  saveGame();
}

function processAllStages() {
  gameState.completedStages.forEach(stageId => {
    const stage = config.stages.find(s => s.id === stageId);
    if (!stage) return;

    if (stage.unlockedEvidence) stage.unlockedEvidence.forEach(id => {
      if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
    });
    if (stage.revealedEvidence) stage.revealedEvidence.forEach(id => {
      if (!gameState.revealedEvidence.includes(id)) gameState.revealedEvidence.push(id);
    });
    if (stage.revealedSuspects) stage.revealedSuspects.forEach(id => {
      if (!gameState.revealedSuspects.includes(id)) gameState.revealedSuspects.push(id);
    });
    if (stage.unlockedAudio) stage.unlockedAudio.forEach(id => {
      if (!gameState.unlockedEvidence.includes('audio-' + id)) gameState.unlockedEvidence.push('audio-' + id);
    });
    if (stage.unlocksOnCorrect) stage.unlocksOnCorrect.forEach(id => {
      if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
    });
  });

  const lastStage = config.stages.find(s => s.id === gameState.currentStage);
  if (lastStage) {
    gameState.activeHints = lastStage.hints || [];
  }
}

function checkStageTriggers() {
  config.stages.forEach(stage => {
    if (gameState.completedStages.includes(stage.id)) return;

    const trigger = stage.triggeredBy;
    if (trigger === 'auto') return;
    if (!trigger) return;

    if (trigger.type === 'viewed') {
      const allViewed = trigger.items.every(item => gameState.viewedEvidence.includes(item));
      if (allViewed) {
        processStage(stage.id);
        renderHub();
      }
    }

    if (trigger.type === 'unlock') {
      if (gameState.unlockedEvidence.includes(trigger.item)) {
        processStage(stage.id);
        renderHub();
      }
    }
  });
}

function renderHub() {
  renderNotebook();
  renderProgress();
  renderEvidence();
  renderAudio();
  renderSuspects();
  renderHintSystem();
}

function renderNotebook() {
  const container = document.getElementById('notebook');
  const stage = config.stages.find(s => s.id === gameState.currentStage);
  if (!stage) return;

  let html = '';

  if (stage.detectiveNote) {
    const noteText = stage.detectiveNote;
    html += `
      <div class="notebook-entry detective fade-in">
        <div class="notebook-label">Detective notes</div>
        ${noteText}
      </div>`;
  }

  if (stage.dispatchMessage) {
    const msgText = stage.dispatchMessage.replace(/\[NAME\]/g, gameState.detectiveName);
    html += `
      <div class="notebook-entry dispatch fade-in">
        <div class="notebook-label">Dispatch</div>
        ${msgText}
      </div>`;
  }

  container.innerHTML = html;
  document.getElementById('detectiveName').textContent = gameState.detectiveName;
}

function renderProgress() {
  const totalEvidence = config.evidence.length;
  const unlockedCount = gameState.unlockedEvidence.filter(id =>
    config.evidence.some(e => e.id === id)
  ).length;

  const totalSuspects = config.suspects.length;
  const revealedCount = gameState.revealedSuspects.filter(id =>
    config.suspects.some(s => s.id === id && s.status !== 'classified')
  ).length + gameState.revealedSuspects.filter(id => {
    const s = config.suspects.find(sus => sus.id === id);
    return s && s.status !== 'classified';
  }).length;

  const identifiedSuspects = config.suspects.filter(s =>
    gameState.revealedSuspects.includes(s.id) && s.status !== 'classified'
  ).length;

  const questionsAnswered = gameState.completedStages.filter(stageId => {
    const s = config.stages.find(st => st.id === stageId);
    return s && (s.acceptedAnswers || s.question);
  }).length;

  const totalQuestions = config.stages.filter(s => s.acceptedAnswers || s.question).length;

  const progress = Math.round((unlockedCount / totalEvidence) * 100);

  document.getElementById('evidenceCount').textContent = `${unlockedCount}/${totalEvidence}`;
  document.getElementById('suspectCount').textContent = `${identifiedSuspects}/${totalSuspects}`;
  document.getElementById('questionCount').textContent = `${questionsAnswered}/${totalQuestions}`;
  document.getElementById('progressPct').textContent = `${progress}%`;
  document.getElementById('evidenceSectionCount').textContent = `${unlockedCount} of ${totalEvidence} unlocked`;
  document.getElementById('suspectSectionCount').textContent = `${identifiedSuspects} of ${totalSuspects} identified`;
}

function renderEvidence() {
  const grid = document.getElementById('evidenceGrid');
  let html = '';

  config.evidence.forEach(ev => {
    const isUnlocked = gameState.unlockedEvidence.includes(ev.id);
    const isRevealed = gameState.revealedEvidence.includes(ev.id);
    const isViewed = gameState.viewedEvidence.includes(ev.id);
    const isHidden = !isUnlocked && !isRevealed;

    if (isHidden) return;

    let cardClass = 'ev-card';
    let tagHtml = '';
    let hintHtml = '';

    if (isUnlocked) {
      if (isViewed) {
        cardClass += ' viewed';
        tagHtml = '<span class="ev-tag read">Viewed</span>';
      } else {
        cardClass += ' new-evidence';
        tagHtml = '<span class="ev-tag new">New</span>';
      }
    } else {
      cardClass += ' locked';
      hintHtml = ev.lockHint ? `<div class="ev-lock-hint">${ev.lockHint}</div>` : '';
    }

    const icon = isUnlocked ? ev.icon : '🔒';
    const name = isUnlocked || isRevealed ? ev.name : '???';
    const desc = isUnlocked ? ev.description : (isRevealed ? ev.description : 'Classified');
    const type = isUnlocked || isRevealed ? ev.type : 'unknown';

    const onclick = isUnlocked && ev.file ? `onclick="viewEvidence('${ev.id}')"` : '';

    html += `
      <div class="${cardClass}" ${onclick} data-id="${ev.id}">
        ${tagHtml}
        <span class="ev-icon">${icon}</span>
        <div class="ev-type">${type}</div>
        <div class="ev-name">${name}</div>
        <div class="ev-desc">${desc}</div>
        ${hintHtml}
      </div>`;
  });

  grid.innerHTML = html;
}

function viewEvidence(id) {
  const ev = config.evidence.find(e => e.id === id);
  if (!ev || !ev.file) return;

  if (!gameState.viewedEvidence.includes(id)) {
    gameState.viewedEvidence.push(id);
    saveGame();
    checkStageTriggers();
    renderHub();
  }

  window.open(ev.file, '_blank');
}

function renderAudio() {
  const container = document.getElementById('audioList');
  let html = '';

  config.audio.forEach(audio => {
    const isUnlocked = gameState.unlockedEvidence.includes('audio-' + audio.id);

    if (isUnlocked) {
      const waveHtml = Array.from({length: 12}, () =>
        `<span style="height:${Math.floor(Math.random() * 16) + 5}px"></span>`
      ).join('');

      html += `
        <div class="audio-card" data-audio-id="${audio.id}">
          <div class="audio-play" onclick="playAudio('${audio.id}')">▶</div>
          <div class="audio-info">
            <div class="audio-title">${audio.title}</div>
            <div class="audio-meta">${audio.meta}</div>
          </div>
          <div class="audio-wave">${waveHtml}</div>
        </div>`;
    } else {
      html += `
        <div class="audio-card locked-audio">
          <div class="audio-play" style="cursor:not-allowed;">🔒</div>
          <div class="audio-info">
            <div class="audio-title">${audio.title.split('—')[0]}— Locked</div>
            <div class="audio-meta">${audio.lockHint || 'Unlock during investigation'}</div>
          </div>
        </div>`;
    }
  });

  container.innerHTML = html;
}

let currentAudioEl = null;

function playAudio(id) {
  const audio = config.audio.find(a => a.id === id);
  if (!audio) return;

  const btn = document.querySelector(`[data-audio-id="${id}"] .audio-play`);

  if (currentAudioEl) {
    currentAudioEl.pause();
    currentAudioEl = null;
    document.querySelectorAll('.audio-play.playing').forEach(el => {
      el.classList.remove('playing');
      el.textContent = '▶';
    });
  }

  if (audio.file) {
    const audioEl = new Audio(audio.file);
    currentAudioEl = audioEl;
    btn.classList.add('playing');
    btn.textContent = '⏸';

    audioEl.play().catch(() => {
      btn.classList.remove('playing');
      btn.textContent = '▶';
    });

    audioEl.addEventListener('ended', () => {
      btn.classList.remove('playing');
      btn.textContent = '▶';
      currentAudioEl = null;
    });
  }

  if (!gameState.viewedEvidence.includes(id)) {
    gameState.viewedEvidence.push(id);
    saveGame();
    checkStageTriggers();
  }
}

function renderSuspects() {
  const grid = document.getElementById('suspectGrid');
  let html = '';

  config.suspects.forEach(sus => {
    const isRevealed = gameState.revealedSuspects.includes(sus.id);
    if (!isRevealed) return;

    const isClassified = sus.status === 'classified';
    let cardClass = 'sus-card';
    if (isClassified) cardClass += ' locked-sus';

    const photoContent = sus.photo
      ? `<img src="${sus.photo}" alt="${sus.name}">`
      : (isClassified ? '?' : '👤');

    const pinHtml = sus.status === 'poi' ? '<div class="sus-pin"></div>' : '';

    const statusLabels = {
      poi: 'Person of interest',
      review: 'Under review',
      cleared: 'Cleared',
      classified: 'Classified'
    };

    html += `
      <div class="${cardClass}">
        <div class="sus-photo">
          ${photoContent}
          ${pinHtml}
        </div>
        <div class="sus-name">${isClassified ? '[Redacted]' : sus.name}</div>
        <div class="sus-role">${sus.role}</div>
        <span class="sus-status ${sus.status}">${statusLabels[sus.status] || sus.status}</span>
      </div>`;
  });

  grid.innerHTML = html;
}

function renderHintSystem() {
  const hintBtn = document.getElementById('hintBtn');
  const hintCount = document.getElementById('hintCount');
  const maxHints = gameState.activeHints.length;
  const remaining = maxHints - gameState.hintsUsed;

  hintCount.textContent = remaining > 0
    ? `${remaining} hint${remaining !== 1 ? 's' : ''} remaining`
    : 'No hints available';

  if (remaining <= 0 || maxHints === 0) {
    hintBtn.textContent = maxHints === 0 ? 'No hints for this stage' : 'No more hints available';
    hintBtn.classList.add('disabled');
  } else {
    hintBtn.textContent = 'Stuck on the case? Request a hint...';
    hintBtn.classList.remove('disabled');
  }
}

function showHint() {
  if (gameState.hintsUsed >= gameState.activeHints.length) return;

  const hintBox = document.getElementById('hintBox');
  hintBox.textContent = gameState.activeHints[gameState.hintsUsed];
  hintBox.classList.add('visible');
  gameState.hintsUsed++;
  saveGame();
  renderHintSystem();
}

function submitCode() {
  const input = document.getElementById('codeInput');
  const feedback = document.getElementById('feedback');
  const val = input.value.trim();

  if (!val) return;

  const valLower = val.toLowerCase();

  // Check phone numbers
  const cleanNumber = val.replace(/[\s\-\(\)]/g, '');
  for (const [number, phoneConfig] of Object.entries(config.phoneNumbers || {})) {
    const cleanConfigNum = number.replace(/[\s\-\(\)]/g, '');
    if (cleanNumber === cleanConfigNum || cleanNumber === cleanConfigNum.replace('555', '')) {
      feedback.className = 'feedback visible correct';
      feedback.textContent = `📞 Incoming call... connecting to ${phoneConfig.description}. Check your audio evidence, Detective ${gameState.detectiveName}.`;

      if (phoneConfig.playsAudio) {
        const audioId = phoneConfig.playsAudio;
        if (!gameState.unlockedEvidence.includes('audio-' + audioId)) {
          gameState.unlockedEvidence.push('audio-' + audioId);
          saveGame();
          renderHub();
        }
      }

      input.value = '';
      return;
    }
  }

  // Check all stages for matching answers
  let matched = false;
  config.stages.forEach(stage => {
    if (gameState.completedStages.includes(stage.id)) return;
    if (!stage.acceptedAnswers) return;

    const isMatch = stage.acceptedAnswers.some(ans => ans.toLowerCase() === valLower);
    if (isMatch) {
      matched = true;
      feedback.className = 'feedback visible correct';
      feedback.textContent = `✓ New evidence unlocked! Check your evidence locker, Detective ${gameState.detectiveName}.`;

      processStage(stage.id);
      renderHub();

      document.getElementById('hintBox').classList.remove('visible');
    }
  });

  if (!matched) {
    feedback.className = 'feedback visible wrong';
    feedback.textContent = "✗ That doesn't match anything in the case file. Keep investigating, or request a hint.";
  }

  input.value = '';
}

document.addEventListener('DOMContentLoaded', init);
