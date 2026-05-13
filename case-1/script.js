let config = null;
let gameState = {
  detectiveNames: [],
  viewedEvidence: [],
  unlockedEvidence: [],
  revealedEvidence: [],
  revealedSuspects: [],
  currentStage: 'start',
  completedStages: [],
  hintsUsedPerStage: {},
  selectedSuspect: null,
  solutionAnswers: [],
  caseSolved: false,
  solvedDate: null
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

// ── SOLUTION SYSTEM ──

function renderSolution() {
  var section = document.getElementById('solutionSection');
  if (!config.solution) { section.style.display = 'none'; return; }

  // Check if solution stage has been reached
  var solutionUnlocked = false;
  if (config.solution.unlockedByStage) {
    solutionUnlocked = gameState.completedStages.includes(config.solution.unlockedByStage);
  }

  // Already solved
  if (gameState.caseSolved) {
    showRevealPage();
    return;
  }

  var locked = document.getElementById('envelopeLocked');
  var unlocked = document.getElementById('envelopeUnlocked');

  if (solutionUnlocked) {
    locked.style.display = 'none';
    unlocked.style.display = 'block';
    renderSuspectSelect();
    renderSolutionQuestions();
  } else {
    locked.style.display = 'block';
    unlocked.style.display = 'none';
    var note = document.getElementById('envelopeProgress');
    note.textContent = 'Continue investigating to unlock case resolution.';
  }
}

function renderSuspectSelect() {
  var container = document.getElementById('suspectSelect');
  var html = '';

  config.suspects.forEach(function(sus) {
    if (sus.status === 'classified') return;
    if (!gameState.revealedSuspects.includes(sus.id)) return;

    var selected = gameState.selectedSuspect === sus.id ? ' selected' : '';
    html += '<div class="suspect-option' + selected + '" onclick="selectSuspect(\'' + sus.id + '\')">' +
      '<div class="suspect-option-photo">' + (sus.status === 'poi' ? '\uD83D\uDC64' : '\uD83D\uDC64') + '</div>' +
      '<div class="suspect-option-name">' + sus.name + '</div>' +
    '</div>';
  });

  container.innerHTML = html;
  checkSolutionReady();
}

function selectSuspect(id) {
  gameState.selectedSuspect = id;
  saveGame();
  renderSuspectSelect();
}

function renderSolutionQuestions() {
  var container = document.getElementById('solutionQuestions');
  if (!config.solution.questions || config.solution.questions.length === 0) {
    container.innerHTML = '';
    return;
  }

  var html = '';
  config.solution.questions.forEach(function(q, i) {
    var savedAnswer = (gameState.solutionAnswers && gameState.solutionAnswers[i]) || '';
    html += '<div class="solution-q-item">' +
      '<div class="solution-q-label">' + q.question + '</div>' +
      '<input class="solution-q-input" type="text" placeholder="' + (q.placeholder || 'Your answer...') + '" ' +
      'value="' + savedAnswer + '" oninput="saveSolutionAnswer(' + i + ', this.value)" autocomplete="off">' +
    '</div>';
  });

  container.innerHTML = html;
}

function saveSolutionAnswer(index, value) {
  if (!gameState.solutionAnswers) gameState.solutionAnswers = [];
  gameState.solutionAnswers[index] = value;
  saveGame();
  checkSolutionReady();
}

function checkSolutionReady() {
  var btn = document.getElementById('solutionSubmitBtn');
  if (!btn) return;

  var hasSuspect = !!gameState.selectedSuspect;
  var hasAnswers = true;

  if (config.solution.questions && config.solution.questions.length > 0) {
    for (var i = 0; i < config.solution.questions.length; i++) {
      if (!gameState.solutionAnswers || !gameState.solutionAnswers[i] || gameState.solutionAnswers[i].trim() === '') {
        hasAnswers = false;
        break;
      }
    }
  }

  btn.disabled = !(hasSuspect && hasAnswers);
}

function submitSolution() {
  var correctSuspect = config.solution.correctSuspect;
  var isCorrect = gameState.selectedSuspect === correctSuspect;

  // Check additional questions
  var questionsCorrect = true;
  if (config.solution.questions && config.solution.questions.length > 0) {
    config.solution.questions.forEach(function(q, i) {
      var playerAnswer = (gameState.solutionAnswers[i] || '').trim().toLowerCase();
      var accepted = q.acceptedAnswers.some(function(a) { return a.toLowerCase() === playerAnswer; });
      if (!accepted) questionsCorrect = false;
    });
  }

  if (isCorrect && questionsCorrect) {
    gameState.caseSolved = true;
    gameState.solvedDate = new Date().toISOString();
    saveGame();
    showRevealPage();
  } else {
    document.getElementById('solutionForm').style.display = 'none';
    document.getElementById('solutionWrong').style.display = 'block';
  }
}

function retrySolution() {
  gameState.selectedSuspect = null;
  gameState.solutionAnswers = [];
  saveGame();
  document.getElementById('solutionForm').style.display = 'block';
  document.getElementById('solutionWrong').style.display = 'none';
  renderSuspectSelect();
  renderSolutionQuestions();
}

function showRevealPage() {
  document.getElementById('solutionSection').style.display = 'none';
  var reveal = document.getElementById('revealPage');
  reveal.style.display = 'block';

  document.getElementById('revealTitle').textContent = config.title + ' \u2014 Case resolved';
  document.getElementById('revealCorrectMsg').textContent =
    'Excellent work, ' + formatDetectiveTitle() + '. Your findings have been verified. This case is now closed.';

  document.getElementById('revealStory').innerHTML = config.solution.revealStory || 'The full story has not been configured for this case.';

  document.getElementById('revealFooterNote').textContent =
    config.solution.finalNote || '';

  // Update the stamp at the top of the page
  var headerStamp = document.querySelector('.stamp');
  if (headerStamp) {
    headerStamp.textContent = 'CASE CLOSED';
    headerStamp.style.color = '#4a7a4a';
    headerStamp.style.borderColor = '#4a7a4a';
  }
}

// ── DOWNLOADABLE REWARDS ──

function createCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function downloadCanvas(canvas, filename) {
  var link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function downloadCertificate() {
  var c = createCanvas(1200, 800);
  var ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = '#f8f4ec';
  ctx.fillRect(0, 0, 1200, 800);

  // Border
  ctx.strokeStyle = '#d4c9b0';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 1140, 740);
  ctx.strokeStyle = '#b8a98a';
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, 1120, 720);

  // Top color strip
  var grad = ctx.createLinearGradient(40, 40, 1160, 40);
  grad.addColorStop(0, '#c47a6a');
  grad.addColorStop(0.5, '#e8d88c');
  grad.addColorStop(1, '#8cb88a');
  ctx.fillStyle = grad;
  ctx.fillRect(40, 40, 1120, 4);

  // Header
  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.textAlign = 'center';
  ctx.fillText('THE SEALED FILE CO // OFFICIAL CASE CLOSURE DOCUMENT', 600, 85);

  // Case closed stamp
  ctx.save();
  ctx.translate(600, 160);
  ctx.rotate(-0.03);
  ctx.strokeStyle = '#4a7a4a';
  ctx.lineWidth = 3;
  ctx.strokeRect(-100, -25, 200, 50);
  ctx.fillStyle = '#4a7a4a';
  ctx.font = 'bold 24px Courier';
  ctx.textAlign = 'center';
  ctx.fillText('CASE CLOSED', 0, 8);
  ctx.restore();

  // Case title
  ctx.fillStyle = '#2c2518';
  ctx.font = 'bold 28px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(config.title, 600, 240);

  // Case ID
  ctx.fillStyle = '#9a8b72';
  ctx.font = '14px Courier';
  ctx.fillText('Case File #' + config.caseId, 600, 270);

  // Divider
  ctx.strokeStyle = '#d4c9b0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(300, 300);
  ctx.lineTo(900, 300);
  ctx.stroke();

  // Certificate text
  ctx.fillStyle = '#2c2518';
  ctx.font = '16px Georgia';
  ctx.fillText('This document certifies that', 600, 350);

  // Detective name
  ctx.fillStyle = '#2a4066';
  ctx.font = 'bold 24px Georgia';
  ctx.fillText(formatDetectiveTitle(), 600, 395);

  // More text
  ctx.fillStyle = '#2c2518';
  ctx.font = '16px Georgia';
  ctx.fillText('has successfully resolved the investigation and identified', 600, 440);
  ctx.fillText('the responsible party through careful evidence analysis.', 600, 465);

  // Date
  var solvedDate = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  var dateStr = solvedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = '#6b5d48';
  ctx.font = '14px Courier';
  ctx.fillText('Date of resolution: ' + dateStr, 600, 520);

  // Divider
  ctx.strokeStyle = '#d4c9b0';
  ctx.beginPath();
  ctx.moveTo(300, 560);
  ctx.lineTo(900, 560);
  ctx.stroke();

  // Footer - two authorities
  ctx.fillStyle = '#9a8b72';
  ctx.font = '12px Courier';
  ctx.textAlign = 'left';
  ctx.fillText(config.departmentName || 'Police Department', 100, 620);
  ctx.fillText('Case Archives Division', 100, 640);

  ctx.textAlign = 'right';
  ctx.fillText('The Sealed File Co', 1100, 620);
  ctx.fillText('Recovered Files Archive', 1100, 640);

  // Signature lines
  ctx.strokeStyle = '#b8a98a';
  ctx.beginPath();
  ctx.moveTo(100, 700);
  ctx.lineTo(400, 700);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(800, 700);
  ctx.lineTo(1100, 700);
  ctx.stroke();

  ctx.fillStyle = '#9a8b72';
  ctx.font = '10px Courier';
  ctx.textAlign = 'center';
  ctx.fillText('Authorized signatory', 250, 720);
  ctx.fillText('Archive administrator', 950, 720);

  // Coffee stain
  ctx.beginPath();
  ctx.arc(1050, 150, 35, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(139,109,63,0.08)';
  ctx.lineWidth = 5;
  ctx.stroke();

  downloadCanvas(c, 'case-closure-certificate.png');
}

function downloadBadge() {
  var c = createCanvas(1080, 1920);
  var ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = '#0a0c08';
  ctx.fillRect(0, 0, 1080, 1920);

  // Scanlines
  ctx.fillStyle = 'rgba(138,154,122,0.03)';
  for (var i = 0; i < 1920; i += 4) {
    ctx.fillRect(0, i, 1080, 2);
  }

  // Vignette
  var vignette = ctx.createRadialGradient(540, 960, 200, 540, 960, 900);
  vignette.addColorStop(0, 'transparent');
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 1080, 1920);

  // Archive header
  ctx.fillStyle = '#3a4a30';
  ctx.font = '18px Courier';
  ctx.textAlign = 'center';
  ctx.fillText('THE SEALED FILE CO // ARCHIVE', 540, 200);

  // Case closed stamp
  ctx.save();
  ctx.translate(540, 500);
  ctx.rotate(-0.02);
  ctx.strokeStyle = '#6a9a5a';
  ctx.lineWidth = 4;
  ctx.strokeRect(-180, -50, 360, 100);
  ctx.fillStyle = '#6a9a5a';
  ctx.font = 'bold 48px Courier';
  ctx.fillText('CASE CLOSED', 0, 16);
  ctx.restore();

  // Case ID
  ctx.fillStyle = '#5a6a50';
  ctx.font = '24px Courier';
  ctx.fillText('CF-' + config.caseId, 540, 640);

  // Case title
  ctx.fillStyle = '#a0b890';
  ctx.font = 'bold 36px Courier';
  var titleWords = config.title.split(' ');
  var line1 = '';
  var line2 = '';
  var mid = Math.ceil(titleWords.length / 2);
  line1 = titleWords.slice(0, mid).join(' ');
  line2 = titleWords.slice(mid).join(' ');
  ctx.fillText(line1, 540, 760);
  if (line2) ctx.fillText(line2, 540, 810);

  // Solved by
  ctx.fillStyle = '#5a6a50';
  ctx.font = '20px Courier';
  ctx.fillText('RESOLVED BY', 540, 960);

  ctx.fillStyle = '#8a9a7a';
  ctx.font = 'bold 28px Courier';
  ctx.fillText(formatDetectiveTitle().toUpperCase(), 540, 1010);

  // Date
  var solvedDate = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  var dateStr = solvedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = '#3a4a30';
  ctx.font = '18px Courier';
  ctx.fillText(dateStr, 540, 1100);

  // Divider
  ctx.strokeStyle = '#2a3020';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(300, 1200);
  ctx.lineTo(780, 1200);
  ctx.stroke();

  // Bottom text
  ctx.fillStyle = '#3a4a30';
  ctx.font = '16px Courier';
  ctx.fillText('thesealedfileco.com', 540, 1700);
  ctx.font = '14px Courier';
  ctx.fillText('RECOVERED FILES ARCHIVE', 540, 1730);

  downloadCanvas(c, 'sealed-file-co-badge.png');
}

function downloadID() {
  var c = createCanvas(900, 560);
  var ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = '#f8f4ec';
  ctx.fillRect(0, 0, 900, 560);

  // Border
  ctx.strokeStyle = '#d4c9b0';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, 880, 540);

  // Top strip
  ctx.fillStyle = '#2a4066';
  ctx.fillRect(10, 10, 880, 50);

  // Header text
  ctx.fillStyle = '#f8f4ec';
  ctx.font = 'bold 16px Courier';
  ctx.textAlign = 'left';
  ctx.fillText('THE SEALED FILE CO', 30, 42);
  ctx.textAlign = 'right';
  ctx.font = '12px Courier';
  ctx.fillText('INVESTIGATOR CREDENTIALS', 870, 42);

  // Photo placeholder
  ctx.fillStyle = '#e8dfc8';
  ctx.fillRect(30, 80, 160, 200);
  ctx.strokeStyle = '#d4c9b0';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 80, 160, 200);
  ctx.fillStyle = '#9a8b72';
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('\uD83D\uDC64', 110, 200);

  // Info
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.fillText('NAME', 220, 105);
  ctx.fillStyle = '#2c2518';
  ctx.font = 'bold 20px Georgia';
  ctx.fillText(formatNames(), 220, 132);

  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.fillText('DESIGNATION', 220, 170);
  ctx.fillStyle = '#2c2518';
  ctx.font = '16px Georgia';
  ctx.fillText('Independent Investigator', 220, 194);

  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.fillText('CREDENTIAL ID', 220, 235);
  ctx.fillStyle = '#2c2518';
  ctx.font = '16px Courier';
  var credId = 'SF-' + Math.random().toString(36).substr(2, 8).toUpperCase();
  ctx.fillText(credId, 220, 258);

  // Cases cleared
  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.fillText('CLEARANCE LEVEL', 600, 105);
  ctx.fillStyle = '#4a7a4a';
  ctx.font = 'bold 28px Courier';
  ctx.fillText('LEVEL 1', 600, 138);

  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.fillText('CASES RESOLVED', 600, 185);
  ctx.fillStyle = '#2c2518';
  ctx.font = 'bold 28px Georgia';
  ctx.fillText('1', 600, 218);

  // Divider
  ctx.strokeStyle = '#d4c9b0';
  ctx.beginPath();
  ctx.moveTo(30, 310);
  ctx.lineTo(870, 310);
  ctx.stroke();

  // Cases list
  ctx.fillStyle = '#9a8b72';
  ctx.font = '11px Courier';
  ctx.fillText('RESOLVED CASE LOG', 30, 345);

  ctx.fillStyle = '#2c2518';
  ctx.font = '13px Courier';
  ctx.fillText('CF-' + config.caseId + '  ' + config.title, 30, 375);

  var solvedDate = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  var dateStr = solvedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  ctx.fillStyle = '#4a7a4a';
  ctx.font = '12px Courier';
  ctx.fillText('RESOLVED ' + dateStr, 30, 398);

  // Stamp
  ctx.save();
  ctx.translate(780, 430);
  ctx.rotate(-0.15);
  ctx.strokeStyle = 'rgba(184,58,42,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-55, -20, 110, 40);
  ctx.fillStyle = 'rgba(184,58,42,0.25)';
  ctx.font = 'bold 14px Courier';
  ctx.textAlign = 'center';
  ctx.fillText('VERIFIED', 0, 5);
  ctx.restore();

  // Bottom strip
  ctx.fillStyle = '#e8dfc8';
  ctx.fillRect(10, 490, 880, 60);
  ctx.fillStyle = '#9a8b72';
  ctx.font = '10px Courier';
  ctx.textAlign = 'left';
  ctx.fillText('This credential is issued by The Sealed File Co and the associated case archive.', 30, 515);
  ctx.fillText('Clearance level increases with each resolved case.', 30, 535);

  downloadCanvas(c, 'detective-id-card.png');
}

// Update renderHub to include solution
var originalRenderHub = renderHub;
renderHub = function() {
  originalRenderHub();
  renderSolution();
};

document.addEventListener('DOMContentLoaded', init);
