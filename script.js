let config = null;
let gameState = {
  detectiveNames: [],
  viewedEvidence: [],
  unlockedEvidence: [],
  revealedEvidence: [],
  revealedSuspects: [],
  currentStage: 'start',
  completedStages: [],
  hintsUsedPerStage: {}
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
      // Migrate old single-name saves
      if (parsed.detectiveName && !parsed.detectiveNames) {
        gameState.detectiveNames = [parsed.detectiveName];
      }
      if (!gameState.hintsUsedPerStage) {
        gameState.hintsUsedPerStage = {};
      }
      return true;
    } catch (e) { return false; }
  }
  return false;
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('detective_names');
  location.reload();
}

// Format detective names: "Alex", "Alex & Sam", "Alex, Sam & Jordan"
function formatNames() {
  const names = gameState.detectiveNames;
  if (names.length === 0) return 'Detective';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' & ' + names[1];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

// "Detective X" or "Detectives X & Y"
function formatDetectiveTitle() {
  const names = gameState.detectiveNames;
  if (names.length === 0) return 'Detective';
  if (names.length === 1) return 'Detective ' + names[0];
  return 'Detectives ' + formatNames();
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
  const savedNames = localStorage.getItem('detective_names');

  if (savedNames && hasSave) {
    try {
      gameState.detectiveNames = JSON.parse(savedNames);
    } catch (e) {
      gameState.detectiveNames = [savedNames];
    }
    document.getElementById('nameGate').classList.add('hidden');
    document.getElementById('mainHub').style.display = 'block';
    setupHub();
    processAllStages();
    renderHub();
  } else {
    setupNameGate();
  }
}

// ── NAME GATE (multi-detective) ──

let pendingNames = [];

function setupNameGate() {
  const input = document.getElementById('nameInput');
  const btn = document.getElementById('nameBtn');

  input.addEventListener('input', function() {
    btn.disabled = input.value.trim().length === 0 && pendingNames.length === 0;
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (input.value.trim().length > 0) {
        if (pendingNames.length > 0) {
          addDetective();
          enterCase();
        } else {
          enterCase();
        }
      }
    }
  });
}

function addDetective() {
  var input = document.getElementById('nameInput');
  var name = input.value.trim();
  if (!name) return;
  if (pendingNames.includes(name)) return;

  pendingNames.push(name);
  input.value = '';
  input.placeholder = "Enter next detective's name";
  renderNameList();
  document.getElementById('nameBtn').disabled = false;
  input.focus();
}

function removeDetective(index) {
  pendingNames.splice(index, 1);
  renderNameList();
  var input = document.getElementById('nameInput');
  if (pendingNames.length === 0) {
    input.placeholder = 'Enter your name, Detective';
    document.getElementById('nameBtn').disabled = input.value.trim().length === 0;
  }
}

function renderNameList() {
  var list = document.getElementById('nameList');
  if (pendingNames.length === 0) {
    list.innerHTML = '';
    return;
  }
  var html = '';
  for (var i = 0; i < pendingNames.length; i++) {
    html += '<div class="name-tag"><span>Detective ' + pendingNames[i] + '</span><button class="name-tag-remove" onclick="removeDetective(' + i + ')">&times;</button></div>';
  }
  list.innerHTML = html;
}

function enterCase() {
  var input = document.getElementById('nameInput');
  var currentName = input.value.trim();

  if (currentName && !pendingNames.includes(currentName)) {
    pendingNames.push(currentName);
  }

  if (pendingNames.length === 0) return;

  gameState.detectiveNames = pendingNames.slice();
  localStorage.setItem('detective_names', JSON.stringify(gameState.detectiveNames));

  document.getElementById('nameGate').classList.add('hidden');
  document.getElementById('mainHub').style.display = 'block';

  setupHub();
  processStage('start');
  renderHub();
  saveGame();
}

// ── HUB SETUP ──

function setupHub() {
  document.getElementById('caseTitle').textContent = config.title;
  document.getElementById('caseSubtitle').textContent = config.subtitle;
  document.getElementById('caseTab').textContent = 'Case #' + config.caseId + ' \u2014 Active';
  document.getElementById('footerText').textContent =
    'Case file property of ' + config.departmentName + ' \u00b7 Unauthorized distribution prohibited';

  document.getElementById('codeInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') submitCode();
  });
}

// ── STAGE PROCESSING ──

function processStage(stageId) {
  var stage = config.stages.find(function(s) { return s.id === stageId; });
  if (!stage || gameState.completedStages.includes(stageId)) return;

  gameState.completedStages.push(stageId);
  gameState.currentStage = stageId;

  if (stage.unlockedEvidence) {
    stage.unlockedEvidence.forEach(function(id) {
      if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
    });
  }
  if (stage.revealedEvidence) {
    stage.revealedEvidence.forEach(function(id) {
      if (!gameState.revealedEvidence.includes(id)) gameState.revealedEvidence.push(id);
    });
  }
  if (stage.revealedSuspects) {
    stage.revealedSuspects.forEach(function(id) {
      if (!gameState.revealedSuspects.includes(id)) gameState.revealedSuspects.push(id);
    });
  }
  if (stage.unlockedAudio) {
    stage.unlockedAudio.forEach(function(id) {
      if (!gameState.unlockedEvidence.includes('audio-' + id)) gameState.unlockedEvidence.push('audio-' + id);
    });
  }
  if (stage.unlocksOnCorrect) {
    stage.unlocksOnCorrect.forEach(function(id) {
      if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
    });
  }

  // Initialize hint counter for this question
  if (!gameState.hintsUsedPerStage[stageId]) {
    gameState.hintsUsedPerStage[stageId] = 0;
  }

  saveGame();
}

function processAllStages() {
  gameState.completedStages.forEach(function(stageId) {
    var stage = config.stages.find(function(s) { return s.id === stageId; });
    if (!stage) return;

    if (stage.unlockedEvidence) stage.unlockedEvidence.forEach(function(id) {
      if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
    });
    if (stage.revealedEvidence) stage.revealedEvidence.forEach(function(id) {
      if (!gameState.revealedEvidence.includes(id)) gameState.revealedEvidence.push(id);
    });
    if (stage.revealedSuspects) stage.revealedSuspects.forEach(function(id) {
      if (!gameState.revealedSuspects.includes(id)) gameState.revealedSuspects.push(id);
    });
    if (stage.unlockedAudio) stage.unlockedAudio.forEach(function(id) {
      if (!gameState.unlockedEvidence.includes('audio-' + id)) gameState.unlockedEvidence.push('audio-' + id);
    });
    if (stage.unlocksOnCorrect) stage.unlocksOnCorrect.forEach(function(id) {
      if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
    });
  });
}

function checkStageTriggers() {
  config.stages.forEach(function(stage) {
    if (gameState.completedStages.includes(stage.id)) return;

    var trigger = stage.triggeredBy;
    if (trigger === 'auto') return;
    if (!trigger) return;

    if (trigger.type === 'viewed') {
      var allViewed = trigger.items.every(function(item) { return gameState.viewedEvidence.includes(item); });
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

// Find the next unanswered question stage (for hints)
function getActiveQuestionStage() {
  for (var i = 0; i < config.stages.length; i++) {
    var stage = config.stages[i];
    if (gameState.completedStages.includes(stage.id)) continue;
    if (stage.acceptedAnswers && stage.hints && stage.hints.length > 0) {
      return stage;
    }
  }
  return null;
}

// ── RENDERING ──

function renderHub() {
  renderNotebook();
  renderProgress();
  renderEvidence();
  renderAudio();
  renderSuspects();
  renderHintSystem();
}

function renderNotebook() {
  var container = document.getElementById('notebook');
  var stage = config.stages.find(function(s) { return s.id === gameState.currentStage; });
  if (!stage) return;

  var nameDisplay = formatNames();
  var html = '';

  if (stage.detectiveNote) {
    html += '<div class="notebook-entry detective fade-in"><div class="notebook-label">Detective notes</div>' + stage.detectiveNote + '</div>';
  }

  if (stage.dispatchMessage) {
    var msgText = stage.dispatchMessage.replace(/\[NAME\]/g, nameDisplay);
    html += '<div class="notebook-entry dispatch fade-in"><div class="notebook-label">Dispatch</div>' + msgText + '</div>';
  }

  container.innerHTML = html;
}

function renderProgress() {
  var totalEvidence = config.evidence.length;
  var unlockedCount = gameState.unlockedEvidence.filter(function(id) {
    return config.evidence.some(function(e) { return e.id === id; });
  }).length;

  var identifiedSuspects = config.suspects.filter(function(s) {
    return gameState.revealedSuspects.includes(s.id) && s.status !== 'classified';
  }).length;
  var totalSuspects = config.suspects.length;

  var questionsAnswered = gameState.completedStages.filter(function(stageId) {
    var s = config.stages.find(function(st) { return st.id === stageId; });
    return s && (s.acceptedAnswers || s.question);
  }).length;
  var totalQuestions = config.stages.filter(function(s) { return s.acceptedAnswers || s.question; }).length;

  var progress = Math.round((unlockedCount / totalEvidence) * 100);

  document.getElementById('evidenceCount').textContent = unlockedCount + '/' + totalEvidence;
  document.getElementById('suspectCount').textContent = identifiedSuspects + '/' + totalSuspects;
  document.getElementById('questionCount').textContent = questionsAnswered + '/' + totalQuestions;
  document.getElementById('progressPct').textContent = progress + '%';
  document.getElementById('evidenceSectionCount').textContent = unlockedCount + ' of ' + totalEvidence + ' unlocked';
  document.getElementById('suspectSectionCount').textContent = identifiedSuspects + ' of ' + totalSuspects + ' identified';
}

function renderEvidence() {
  var grid = document.getElementById('evidenceGrid');
  var html = '';

  config.evidence.forEach(function(ev) {
    var isUnlocked = gameState.unlockedEvidence.includes(ev.id);
    var isRevealed = gameState.revealedEvidence.includes(ev.id);
    var isViewed = gameState.viewedEvidence.includes(ev.id);
    var isHidden = !isUnlocked && !isRevealed;

    if (isHidden) return;

    var cardClass = 'ev-card';
    var tagHtml = '';
    var hintHtml = '';

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
      hintHtml = ev.lockHint ? '<div class="ev-lock-hint">' + ev.lockHint + '</div>' : '';
    }

    var icon = isUnlocked ? ev.icon : '\uD83D\uDD12';
    var name = isUnlocked || isRevealed ? ev.name : '???';
    var desc = isUnlocked ? ev.description : (isRevealed ? ev.description : 'Classified');
    var type = isUnlocked || isRevealed ? ev.type : 'unknown';

    var onclick = isUnlocked && ev.file ? 'onclick="viewEvidence(\'' + ev.id + '\')"' : '';

    html += '<div class="' + cardClass + '" ' + onclick + ' data-id="' + ev.id + '">' +
      tagHtml +
      '<span class="ev-icon">' + icon + '</span>' +
      '<div class="ev-type">' + type + '</div>' +
      '<div class="ev-name">' + name + '</div>' +
      '<div class="ev-desc">' + desc + '</div>' +
      hintHtml +
      '</div>';
  });

  grid.innerHTML = html;
}

function viewEvidence(id) {
  var ev = config.evidence.find(function(e) { return e.id === id; });
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
  var container = document.getElementById('audioList');
  var html = '';

  config.audio.forEach(function(audio) {
    var isUnlocked = gameState.unlockedEvidence.includes('audio-' + audio.id);

    if (isUnlocked) {
      var waveHtml = '';
      for (var i = 0; i < 12; i++) {
        waveHtml += '<span style="height:' + (Math.floor(Math.random() * 16) + 5) + 'px"></span>';
      }

      html += '<div class="audio-card" data-audio-id="' + audio.id + '">' +
        '<div class="audio-play" onclick="playAudio(\'' + audio.id + '\')">\u25B6</div>' +
        '<div class="audio-info"><div class="audio-title">' + audio.title + '</div>' +
        '<div class="audio-meta">' + audio.meta + '</div></div>' +
        '<div class="audio-wave">' + waveHtml + '</div></div>';
    } else {
      html += '<div class="audio-card locked-audio">' +
        '<div class="audio-play" style="cursor:not-allowed;">\uD83D\uDD12</div>' +
        '<div class="audio-info"><div class="audio-title">' + audio.title.split('\u2014')[0] + '\u2014 Locked</div>' +
        '<div class="audio-meta">' + (audio.lockHint || 'Unlock during investigation') + '</div></div></div>';
    }
  });

  container.innerHTML = html;
}

var currentAudioEl = null;

function playAudio(id) {
  var audio = config.audio.find(function(a) { return a.id === id; });
  if (!audio) return;

  var btn = document.querySelector('[data-audio-id="' + id + '"] .audio-play');

  if (currentAudioEl) {
    currentAudioEl.pause();
    currentAudioEl = null;
    document.querySelectorAll('.audio-play.playing').forEach(function(el) {
      el.classList.remove('playing');
      el.textContent = '\u25B6';
    });
  }

  if (audio.file) {
    var audioEl = new Audio(audio.file);
    currentAudioEl = audioEl;
    btn.classList.add('playing');
    btn.textContent = '\u23F8';

    audioEl.play().catch(function() {
      btn.classList.remove('playing');
      btn.textContent = '\u25B6';
    });

    audioEl.addEventListener('ended', function() {
      btn.classList.remove('playing');
      btn.textContent = '\u25B6';
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
  var grid = document.getElementById('suspectGrid');
  var html = '';

  config.suspects.forEach(function(sus) {
    var isRevealed = gameState.revealedSuspects.includes(sus.id);
    if (!isRevealed) return;

    var isClassified = sus.status === 'classified';
    var cardClass = 'sus-card';
    if (isClassified) cardClass += ' locked-sus';

    var photoContent = sus.photo
      ? '<img src="' + sus.photo + '" alt="' + sus.name + '">'
      : (isClassified ? '?' : '\uD83D\uDC64');

    var pinHtml = sus.status === 'poi' ? '<div class="sus-pin"></div>' : '';

    var statusLabels = {
      poi: 'Person of interest',
      review: 'Under review',
      cleared: 'Cleared',
      classified: 'Classified'
    };

    html += '<div class="' + cardClass + '"><div class="sus-photo">' +
      photoContent + pinHtml +
      '</div><div class="sus-name">' + (isClassified ? '[Redacted]' : sus.name) + '</div>' +
      '<div class="sus-role">' + sus.role + '</div>' +
      '<span class="sus-status ' + sus.status + '">' + (statusLabels[sus.status] || sus.status) + '</span></div>';
  });

  grid.innerHTML = html;
}

// ── HINT SYSTEM (3 hints per question) ──

function renderHintSystem() {
  var hintBtn = document.getElementById('hintBtn');
  var hintCountEl = document.getElementById('hintCount');
  var activeStage = getActiveQuestionStage();

  if (!activeStage || !activeStage.hints || activeStage.hints.length === 0) {
    hintCountEl.textContent = '';
    hintBtn.textContent = 'No active question right now';
    hintBtn.classList.add('disabled');
    return;
  }

  var stageId = activeStage.id;
  var used = gameState.hintsUsedPerStage[stageId] || 0;
  var total = activeStage.hints.length;
  var remaining = total - used;

  hintCountEl.textContent = remaining > 0
    ? remaining + ' hint' + (remaining !== 1 ? 's' : '') + ' remaining'
    : 'No hints left for this question';

  if (remaining <= 0) {
    hintBtn.textContent = 'No more hints for this question';
    hintBtn.classList.add('disabled');
  } else {
    hintBtn.textContent = 'Stuck on the case? Request a hint...';
    hintBtn.classList.remove('disabled');
  }
}

function showHint() {
  var activeStage = getActiveQuestionStage();
  if (!activeStage || !activeStage.hints) return;

  var stageId = activeStage.id;
  var used = gameState.hintsUsedPerStage[stageId] || 0;

  if (used >= activeStage.hints.length) return;

  var hintBox = document.getElementById('hintBox');
  hintBox.textContent = activeStage.hints[used];
  hintBox.classList.add('visible');

  gameState.hintsUsedPerStage[stageId] = used + 1;
  saveGame();
  renderHintSystem();
}

// ── SUBMIT SYSTEM ──

function submitCode() {
  var input = document.getElementById('codeInput');
  var feedback = document.getElementById('feedback');
  var val = input.value.trim();

  if (!val) return;

  var valLower = val.toLowerCase();
  var nameDisplay = formatDetectiveTitle();

  // Check phone numbers
  var cleanNumber = val.replace(/[\s\-\(\)]/g, '');
  var phoneNumbers = config.phoneNumbers || {};
  var phoneKeys = Object.keys(phoneNumbers);

  for (var p = 0; p < phoneKeys.length; p++) {
    var number = phoneKeys[p];
    var phoneConfig = phoneNumbers[number];
    var cleanConfigNum = number.replace(/[\s\-\(\)]/g, '');
    if (cleanNumber === cleanConfigNum || cleanNumber === cleanConfigNum.replace('555', '')) {
      feedback.className = 'feedback visible correct';
      feedback.textContent = '\uD83D\uDCDE Incoming call... connecting to ' + phoneConfig.description + '. Check your audio evidence, ' + nameDisplay + '.';

      if (phoneConfig.playsAudio) {
        var audioId = phoneConfig.playsAudio;
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
  var matched = false;
  config.stages.forEach(function(stage) {
    if (gameState.completedStages.includes(stage.id)) return;
    if (!stage.acceptedAnswers) return;

    var isMatch = stage.acceptedAnswers.some(function(ans) { return ans.toLowerCase() === valLower; });
    if (isMatch) {
      matched = true;
      feedback.className = 'feedback visible correct';
      feedback.textContent = '\u2713 New evidence unlocked! Check your evidence locker, ' + nameDisplay + '.';

      processStage(stage.id);
      renderHub();

      document.getElementById('hintBox').classList.remove('visible');
    }
  });

  if (!matched) {
    feedback.className = 'feedback visible wrong';
    feedback.textContent = "\u2717 That doesn't match anything in the case file. Keep investigating, or request a hint.";
  }

  input.value = '';
}

document.addEventListener('DOMContentLoaded', init);
