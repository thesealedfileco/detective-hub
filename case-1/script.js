/* ═══════════════════════════════════════════════════════
   THE SEALED FILE CO — Detective Hub script.js
   Case 001: The Moth Hollow Tapes
   Includes: full game engine + complete end sequence
   ═══════════════════════════════════════════════════════ */

console.log('SCRIPT LOADED v2');

var config = null;
var gameState = {
  detectiveNames: [],
  viewedEvidence: [],
  unlockedEvidence: [],
  revealedEvidence: [],
  revealedSuspects: ["naomi-vale"],
  currentStage: 'start',
  completedStages: [],
  answeredStages: [],
  hintsUsedPerStage: {},
  selectedSuspect: null,
  solutionAnswers: [],
  caseSolved: false,
  solvedDate: null,
  spectrogramUnlocked: false,
  spectrogramAnalyzed: []
};

var STORAGE_KEY = 'detective-hub-save';

function saveGame() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
}

function loadGame() {
  var saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      var parsed = JSON.parse(saved);
      gameState = Object.assign({}, gameState, parsed);
      if (parsed.detectiveName && !parsed.detectiveNames) {
        gameState.detectiveNames = [parsed.detectiveName];
      }
      if (!gameState.hintsUsedPerStage)    gameState.hintsUsedPerStage    = {};
      if (!gameState.spectrogramAnalyzed)  gameState.spectrogramAnalyzed  = [];
      if (typeof gameState.spectrogramUnlocked === 'undefined') gameState.spectrogramUnlocked = false;
      // Retroactively grant spectrogram if save predates feature
      if (gameState.caseSolved && !gameState.spectrogramUnlocked) {
        gameState.spectrogramUnlocked = true;
      }
      return true;
    } catch(e) { return false; }
  }
  return false;
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('detective_names');
  location.reload();
}

function formatNames() {
  var names = gameState.detectiveNames;
  if (!names || names.length === 0) return 'Detective';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' & ' + names[1];
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
}

function formatDetectiveTitle() {
  var names = gameState.detectiveNames;
  if (!names || names.length === 0) return 'Detective';
  if (names.length === 1) return 'Detective ' + names[0];
  return 'Detectives ' + formatNames();
}

/* ── INIT ── */

async function init() {
  try {
    var resp = await fetch('config.json');
    config   = await resp.json();
  } catch(e) {
    document.body.innerHTML = '<div style="padding:2rem;text-align:center;font-family:monospace;">Error loading case config.</div>';
    return;
  }

  var hasSave     = loadGame();
  var savedNames  = localStorage.getItem('detective_names');

  if (savedNames && hasSave) {
    try { gameState.detectiveNames = JSON.parse(savedNames); }
    catch(e) { gameState.detectiveNames = [savedNames]; }

    document.getElementById('nameGate').classList.add('hidden');

    if (gameState.caseSolved) {
      // Returning to already-solved case — go straight to hub
      document.getElementById('mainHub').style.display = 'block';
      setupHub();
      processAllStages();
      renderHub();
      // Update stamp
      var stamp = document.getElementById('headerStamp');
      if (stamp) {
        stamp.textContent   = 'CASE CLOSED';
        stamp.style.color   = '#4a7a4a';
        stamp.style.borderColor = '#4a7a4a';
      }
    } else {
      document.getElementById('mainHub').style.display = 'block';
      setupHub();
      processAllStages();
      renderHub();
    }
  } else {
    setupNameGate();
  }
}

/* ── NAME GATE ── */

var pendingNames = [];

function setupNameGate() {
  var input = document.getElementById('nameInput');
  var btn   = document.getElementById('nameBtn');

  input.addEventListener('input', function() {
    btn.disabled = input.value.trim().length === 0 && pendingNames.length === 0;
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && input.value.trim().length > 0) enterCase();
  });
}

function addDetective() {
  var input = document.getElementById('nameInput');
  var name  = input.value.trim();
  if (!name || pendingNames.includes(name)) return;
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
  if (pendingNames.length === 0) { list.innerHTML = ''; return; }
  var html = '';
  for (var i = 0; i < pendingNames.length; i++) {
    html += '<div class="name-tag"><span>Detective ' + pendingNames[i] + '</span>' +
      '<button class="name-tag-remove" onclick="removeDetective(' + i + ')">&times;</button></div>';
  }
  list.innerHTML = html;
}

function enterCase() {
  var input = document.getElementById('nameInput');
  var name  = input.value.trim();
  if (name && !pendingNames.includes(name)) pendingNames.push(name);
  if (pendingNames.length === 0) return;

  gameState.detectiveNames = pendingNames.slice();
  localStorage.setItem('detective_names', JSON.stringify(gameState.detectiveNames));

  document.getElementById('nameGate').classList.add('hidden');

  setupHub();
  processStage('start');
  saveGame();

  showPopup('caseBriefing', function() {
    if (!gameState.viewedEvidence.includes('ev-000')) {
      gameState.viewedEvidence.push('ev-000');
      saveGame();
    }
    document.getElementById('mainHub').style.display = 'block';
    renderHub();
  });
}

/* ── HUB SETUP ── */

function setupHub() {
  document.getElementById('caseTitle').textContent    = config.title;
  document.getElementById('caseSubtitle').textContent = config.subtitle;
  document.getElementById('caseTab').textContent      = 'Case #' + config.caseId + ' \u2014 Active';
  document.getElementById('footerText').textContent   =
    'Case file property of ' + config.departmentName + ' \u00b7 Unauthorized distribution prohibited';

  document.getElementById('codeInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') submitCode();
  });
}

/* ── STAGE PROCESSING ── */

function processStage(stageId) {
  var stage = config.stages.find(function(s) { return s.id === stageId; });
  if (!stage || gameState.completedStages.includes(stageId)) return;

  gameState.completedStages.push(stageId);
  gameState.currentStage = stageId;

  if (stage.unlockedEvidence) stage.unlockedEvidence.forEach(function(id) {
    if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
  });
  if (stage.revealedEvidence) stage.revealedEvidence.forEach(function(id) {
    if (!gameState.revealedEvidence.includes(id)) gameState.revealedEvidence.push(id);
  });
  if (stage.revealedSuspects) stage.revealedSuspects.forEach(function(id) {
    if (!gameState.revealedSuspects.includes(id)) gameState.revealedSuspects.push(id);
  });
  if (stage.unlockedAudio) stage.unlockedAudio.forEach(function(audio) {
    if (!gameState.unlockedEvidence.includes(audio.id)) gameState.unlockedEvidence.push(audio.id);
  });
  if (stage.unlocksOnCorrect) stage.unlocksOnCorrect.forEach(function(id) {
    if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
  });

  if (!gameState.hintsUsedPerStage[stageId]) gameState.hintsUsedPerStage[stageId] = 0;

  checkSuspectTriggers();
  saveGame();

  // Fire stage popup if configured (skip on reload — only first time)
  if (stage.popup && config.popups && config.popups[stage.popup]) {
    setTimeout(function() {
      showPopup(stage.popup, null);
    }, 400);
  }

}

function processAllStages() {
  gameState.completedStages.forEach(function(stageId) {
    var stage = config.stages.find(function(s) { return s.id === stageId; });
    if (!stage) return;
    if (stage.unlockedEvidence)  stage.unlockedEvidence.forEach(function(id)  { if (!gameState.unlockedEvidence.includes(id))  gameState.unlockedEvidence.push(id); });
    if (stage.revealedEvidence)  stage.revealedEvidence.forEach(function(id)  { if (!gameState.revealedEvidence.includes(id))  gameState.revealedEvidence.push(id); });
    if (stage.revealedSuspects)  stage.revealedSuspects.forEach(function(id)  { if (!gameState.revealedSuspects.includes(id))  gameState.revealedSuspects.push(id); });
    if (stage.unlockedAudio)     stage.unlockedAudio.forEach(function(audio)     { if (!gameState.unlockedEvidence.includes(audio.id)) gameState.unlockedEvidence.push(audio.id); });
    if (stage.unlocksOnCorrect)  stage.unlocksOnCorrect.forEach(function(id)  { if (!gameState.unlockedEvidence.includes(id))  gameState.unlockedEvidence.push(id); });
  });
}

function checkStageTriggers() {
  config.stages.forEach(function(stage) {
    if (gameState.completedStages.includes(stage.id)) return;
    var trigger = stage.triggeredBy;
    if (!trigger || trigger === 'auto') return;

    if (trigger.type === 'viewed') {
      // handle both "item" (singular) and "items" (array)
      var itemsToCheck = trigger.items || (trigger.item ? [trigger.item] : []);
      if (itemsToCheck.every(function(item) { return gameState.viewedEvidence.includes(item); })) {
        processStage(stage.id); renderHub();
      }
    }
    if (trigger.type === 'answered') {
      if (gameState.answeredStages.includes(trigger.stageId)) {
        processStage(stage.id); renderHub();
      }
    }
    if (trigger.type === 'visited') {
      if (gameState.viewedEvidence.includes(trigger.item)) {
        processStage(stage.id); renderHub();
      }
    }
    if (trigger.type === 'unlock') {
      if (gameState.unlockedEvidence.includes(trigger.item)) {
        processStage(stage.id); renderHub();
      }
    }
  });
}

function getActiveQuestionStage() {
  for (var i = 0; i < config.stages.length; i++) {
    var stage = config.stages[i];
    if (gameState.answeredStages.includes(stage.id)) continue;
    if (!gameState.completedStages.includes(stage.id)) continue;
    if (stage.acceptedAnswers && stage.hints && stage.hints.length > 0) return stage;
  }
  return null;
}

/* ── RENDERING ── */

function renderHub() {
  renderNotebook();
  renderProgress();
  renderEvidence();
  renderAudio();
  renderSuspects();
  renderHintSystem();
  renderSolution();
}

function renderNotebook() {
  var container = document.getElementById('notebook');
  var stage = config.stages.find(function(s) { return s.id === gameState.currentStage; });
  if (!stage) return;
  var name = formatNames();
  var html = '';
  if (stage.detectiveNote) {
    html += '<div class="notebook-entry detective fade-in"><div class="notebook-label">Detective notes</div>' +
      stage.detectiveNote + '</div>';
  }
  if (stage.dispatchMessage) {
    var msg = stage.dispatchMessage.replace(/\[NAME\]/g, name);
    html += '<div class="notebook-entry dispatch fade-in"><div class="notebook-label">Dispatch</div>' + msg + '</div>';
  }
  container.innerHTML = html;
}

function renderProgress() {

  // only count non-secret evidence
  var visibleEvidence = config.evidence.filter(function(ev) {

    // hide secret evidence until unlocked
    if (ev.secret &&
        !gameState.unlockedEvidence.includes(ev.id)) {
      return false;
    }

    return true;
  });

  var totalEvidence = visibleEvidence.length;

  var unlockedCount = gameState.unlockedEvidence.filter(function(id) {

    return visibleEvidence.some(function(e) {
      return e.id === id;
    });

  }).length;

  var identifiedSuspects = config.suspects.filter(function(s) {
    return gameState.revealedSuspects.includes(s.id) &&
           s.status !== 'classified';
  }).length;

  var totalSuspects = config.suspects.length;

  var questionsAnswered =
    gameState.completedStages.filter(function(stageId) {

      var s = config.stages.find(function(st) {
        return st.id === stageId;
      });

      return s && (s.acceptedAnswers || s.question);

    }).length;

  var totalQuestions =
    config.stages.filter(function(s) {
      return s.acceptedAnswers || s.question;
    }).length;

  var progress =
    Math.round((unlockedCount / totalEvidence) * 100);

  document.getElementById('evidenceCount').textContent =
    unlockedCount + '/' + totalEvidence;

  document.getElementById('suspectCount').textContent =
    identifiedSuspects + '/' + totalSuspects;

  document.getElementById('questionCount').textContent =
    questionsAnswered + '/' + totalQuestions;

  document.getElementById('progressPct').textContent =
    progress + '%';

  document.getElementById('evidenceSectionCount').textContent =
    unlockedCount + ' of ' + totalEvidence + ' unlocked';

  document.getElementById('suspectSectionCount').textContent =
    identifiedSuspects + ' of ' + totalSuspects + ' identified';
}

function renderEvidence() {
  var grid = document.getElementById('evidenceGrid');
  var html = '';

  // config.evidence.forEach(function(ev) {
  config.evidence.filter(function(ev) {return ev.type !== 'audio';}).forEach(function(ev) {
    var isUnlocked = gameState.unlockedEvidence.includes(ev.id);
    var isRevealed = gameState.revealedEvidence.includes(ev.id);
    var isViewed   = gameState.viewedEvidence.includes(ev.id);
    if (!isUnlocked && !isRevealed) return;

    var cardClass = 'ev-card';
    var tagHtml   = '';
    var hintHtml  = '';

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
    var onclick = isUnlocked && (ev.file || ev.type === 'briefing') ? 'onclick="viewEvidence(\'' + ev.id + '\')"' : '';
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

function checkSuspectTriggers() {
  config.suspects.forEach(function(sus){
    if (gameState.revealedSuspects.includes(sus.id)) return;
    var t = sus.revealTrigger;
    if (!t) return;
    if (t.viewed && gameState.viewedEvidence.includes(t.viewed))
      gameState.revealedSuspects.push(sus.id);
    if (t.viewedAny && t.viewedAny.some(function(ev) {return gameState.viewedEvidence.includes(ev);}))
      gameState.revealedSuspects.push(sus.id);
    if (t.stage && gameState.completedStages.includes(t.stage))
      gameState.revealedSuspects.push(sus.id);
  });
}

function viewEvidence(id) {
  var ev = config.evidence.find(function(e) { return e.id === id; });
  if (!ev) return;

  // Briefing type replays the popup instead of opening a file
  if (ev.type === 'briefing') {
    if (!gameState.viewedEvidence.includes(id)) {
        gameState.viewedEvidence.push(id);
        saveGame();
        renderHub();
    }
    showPopup('caseBriefing', null);
    return;
  }
  if (!ev.file) return;
  window.open(ev.file, '_blank');

  if (!gameState.viewedEvidence.includes(id)) {
    gameState.viewedEvidence.push(id);
    // Check if suspect needs to be revealed
    checkSuspectTriggers();
    
    saveGame();
    checkStageTriggers();
    renderHub();
  }
}

function renderAudio() {
  var container = document.getElementById('audioList');

  var tool = config && config.spectrogramTool;
  var spectroUnlocked = gameState.spectrogramUnlocked || false;
  var eligibleIds = (tool && tool.eligibleAudio)
    ? tool.eligibleAudio
    : [];

  var analyzed = gameState.spectrogramAnalyzed || [];

  var html = '';

  // pull audio directly from evidence
  var audioEvidence = config.evidence.filter(function(ev) {
    // only audio
    if (ev.type !== 'audio') return false;
    
    // hide secret audio unless unlocked
    if (ev.secret && !gameState.unlockedEvidence.includes(ev.id)){
      return false;
    }
    return true;
  });

  audioEvidence.forEach(function(audio) {

    var isUnlocked =
      gameState.unlockedEvidence.includes(audio.id);

    if (isUnlocked) {

      var waveHtml = '';

      for (var i = 0; i < 12; i++) {
        waveHtml +=
          '<span style="height:' +
          (Math.floor(Math.random() * 16) + 5) +
          'px"></span>';
      }

      var spectroBtn = '';

      if (
        spectroUnlocked &&
        eligibleIds.includes(audio.id)
      ) {

        var isAnalyzed =
          analyzed.includes(audio.id);

        var btnClass =
          isAnalyzed
            ? 'spectro-run-btn analyzed'
            : 'spectro-run-btn';

        var btnLabel =
          isAnalyzed
            ? '✓ Analysis complete'
            : '📡 Run Spectrogram Analysis';

        spectroBtn =
          '<div style="margin-top:6px;">' +
          '<button class="' + btnClass + '" onclick="runSpectrogram(\'' + audio.id + '\')">' +
          btnLabel +
          '</button></div>';
      }

      html +=
        '<div class="audio-card" data-audio-id="' + audio.id + '">' +
          '<div class="audio-play" onclick="playAudio(\'' + audio.id + '\')">▶</div>' +
          '<div class="audio-info">' +
            '<div class="audio-title">' + audio.name + '</div>' +
            '<div class="audio-meta">' + audio.description + '</div>' +
            spectroBtn +
          '</div>' +
          '<div class="audio-wave">' + waveHtml + '</div>' +
        '</div>';

    } else {

      html +=
        '<div class="audio-card locked-audio">' +
          '<div class="audio-play" style="cursor:not-allowed;">🔒</div>' +
          '<div class="audio-info">' +
            '<div class="audio-title">' +
              audio.name.split('—')[0] +
              '— Locked</div>' +
            '<div class="audio-meta">' +
              (audio.lockedHint || 'Unlock during investigation') +
            '</div>' +
          '</div>' +
        '</div>';
    }
  });

  container.innerHTML = html;
}

var currentAudioEl = null;

function playAudio(id) {
  var audio = config.evidence.find(function(a) {
    return a.id === id && a.type === 'audio';
  });
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
    if (btn) { btn.classList.add('playing'); btn.textContent = '\u23F8'; }

    audioEl.play().catch(function() {
      if (btn) { btn.classList.remove('playing'); btn.textContent = '\u25B6'; }
    });
    audioEl.addEventListener('ended', function() {
      if (btn) { btn.classList.remove('playing'); btn.textContent = '\u25B6'; }
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
  var statusLabels = {
    victim:     'Victim',
    missing:    'Missing',
    review:     'Under review',
    classified: 'Classified',
    locked:     'Classified'
  };
 
  config.suspects.forEach(function(sus) {
    if (!gameState.revealedSuspects.includes(sus.id)) return;
 
    var isClassified = sus.status === 'classified' || sus.status === 'locked';
    var cardClass    = 'sus-card' + (isClassified ? ' locked-sus' : '');
    var photoContent = sus.photo
      ? '<img src="' + sus.photo + '" alt="' + sus.name + '">'
      : (isClassified ? '?' : sus.initial || '\uD83D\uDC64');
    // Only add onclick if character has a profile in config AND not classified
    var hasProfile = config.characterProfiles && config.characterProfiles[sus.id];
    var clickAttr  = (!isClassified && hasProfile)
      ? 'onclick="openCharacterPage(\'' + sus.id + '\')"'
      : '';
    var hintHtml   = (!isClassified && hasProfile)
      ? '<div class="sus-card-hint">Open file →</div>'
      : '';
 
    html += '<div class="' + cardClass + '" ' + clickAttr + '>' +
      '<div class="sus-photo">' + photoContent + '</div>' +
      '<div class="sus-name">' + (isClassified ? '[Redacted]' : sus.name) + '</div>' +
      '<div class="sus-role">' + (isClassified ? '—' : sus.role) + '</div>' +
      '<span class="sus-status ' + sus.status + '">' + (statusLabels[sus.status] || sus.status) + '</span>' +
      hintHtml +
    '</div>';
  });
 
  grid.innerHTML = html;
}

function openCharacterPage(suspectId) {
  window.location.href = '/case-1/character.html?id=' + suspectId;
}

/* ── HINT SYSTEM ── */

function renderHintSystem() {
  var hintBtn    = document.getElementById('hintBtn');
  var hintCountEl = document.getElementById('hintCount');
  var activeStage = getActiveQuestionStage();

  if (!activeStage || !activeStage.hints || activeStage.hints.length === 0) {
    hintCountEl.textContent = '';
    hintBtn.textContent = 'No active question right now';
    hintBtn.classList.add('disabled');
    return;
  }

  var stageId   = activeStage.id;
  var used      = gameState.hintsUsedPerStage[stageId] || 0;
  var remaining = activeStage.hints.length - used;

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
  var used    = gameState.hintsUsedPerStage[stageId] || 0;
  if (used >= activeStage.hints.length) return;

  var hintBox = document.getElementById('hintBox');
  hintBox.textContent = activeStage.hints[used];
  hintBox.classList.add('visible');

  gameState.hintsUsedPerStage[stageId] = used + 1;
  saveGame();
  renderHintSystem();
}

/* ── SUBMIT SYSTEM ── */

function submitCode() {
  var input    = document.getElementById('codeInput');
  var feedback = document.getElementById('feedback');
  var val      = input.value.trim();
  if (!val) return;

  var valLower   = val.toLowerCase();
  var nameDisplay = formatDetectiveTitle();
  var matched    = false;

  // 1. Phone numbers
  var cleanNumber  = val.replace(/[\s\-\(\)]/g, '');
  var phoneNumbers = config.phoneNumbers || {};
  var phoneKeys    = Object.keys(phoneNumbers);

  for (var p = 0; p < phoneKeys.length; p++) {
    var number      = phoneKeys[p];
    var phoneConfig = phoneNumbers[number];
    var cleanConfigNum = number.replace(/[\s\-\(\)]/g, '');
    if (cleanNumber === cleanConfigNum || cleanNumber === cleanConfigNum.replace('555', '')) {
      feedback.className  = 'feedback visible correct';
      feedback.textContent = '\uD83D\uDCDE Incoming call\u2026 connecting to ' + phoneConfig.description + '. Check your audio evidence, ' + nameDisplay + '.';

      if (phoneConfig.playsAudio) {

        // find the matching audio evidence entry
        var audioEvidence = config.evidence.find(function(ev) {
          return ev.type === 'audio' &&
                ev.file === phoneConfig.playsAudio;
        });

        // unlock the evidence ID
        if (audioEvidence) {

          if (!gameState.unlockedEvidence.includes(audioEvidence.id)) {
            gameState.unlockedEvidence.push(audioEvidence.id);
          }

          saveGame();
          renderHub();
          checkStageTriggers();

        }

        // play voicemail
        var voicemail = new Audio(phoneConfig.playsAudio);
        voicemail.play().catch(function() {});
      }

      input.value = '';
      return;
    }
  }

  // 2. Passwords
  config.stages.forEach(function(stage) {
    if (matched) return;
    if (!gameState.completedStages.includes(stage.id)) return;
    if (!stage.passwordUnlocks) return;

    stage.passwordUnlocks.forEach(function(pw) {
      if (matched) return;
      if (pw.password.toLowerCase() === valLower) {
        matched = true;
        feedback.className  = 'feedback visible correct';
        feedback.textContent = '\u2713 Authorization code accepted. Restricted files unlocked, ' + nameDisplay + '.';
        pw.unlocksEvidence.forEach(function(id) {
          if (!gameState.unlockedEvidence.includes(id)) gameState.unlockedEvidence.push(id);
        });
        saveGame();
        renderHub();
      }
    });
  });

  if (matched) { input.value = ''; return; }

  // 3. Stage answers
  config.stages.forEach(function(stage) {
    if (matched) return;
    if (gameState.answeredStages.includes(stage.id)) return;
    if (!gameState.completedStages.includes(stage.id)) return;
    if (!stage.acceptedAnswers) return;

    var isMatch = stage.acceptedAnswers.some(function(ans) {
      return ans.toLowerCase() === valLower;
    });

    if (isMatch) {
      matched = true;
      feedback.className  = 'feedback visible correct';
      feedback.textContent = '\u2713 New evidence unlocked! Check your evidence locker, ' + nameDisplay + '.';

      if (!gameState.answeredStages.includes(stage.id)) gameState.answeredStages.push(stage.id);
      processStage(stage.id);
      checkStageTriggers();
      renderHub();
      document.getElementById('hintBox').classList.remove('visible');
    }
  });

  if (!matched) {
    feedback.className  = 'feedback visible wrong';
    feedback.textContent = "\u2717 That doesn\u2019t match anything in the case file. Keep investigating, or request a hint.";
  }

  input.value = '';
}

/* ── SOLUTION SYSTEM ── */

function renderSolution() {
  var section = document.getElementById('solutionSection');
  if (!config.solution) { section.style.display = 'none'; return; }

  if (gameState.caseSolved) { section.style.display = 'none'; return; }

  var solutionUnlocked = false;
  if (config.solution.visibleAtStage) {
    solutionUnlocked = gameState.completedStages.includes(config.solution.visibleAtStage);
  }
  if (gameState.completedStages.includes('stage-6-final')) solutionUnlocked = true;

  var locked   = document.getElementById('envelopeLocked');
  var unlocked = document.getElementById('envelopeUnlocked');

  if (solutionUnlocked) {
    locked.style.display   = 'none';
    unlocked.style.display = 'block';
    renderSuspectSelect();
    renderFinalQuestions();
  } else {
    locked.style.display   = 'block';
    unlocked.style.display = 'none';
    document.getElementById('envelopeProgress').textContent = 'Continue investigating to unlock case resolution.';
  }
}

function renderSuspectSelect() {
  var container = document.getElementById('suspectSelect');
  var html = '';
  config.suspects.forEach(function(sus) {
    if (sus.status === 'classified' || sus.status === 'locked') return;
    if (!gameState.revealedSuspects.includes(sus.id)) return;
    var selected = gameState.selectedSuspect === sus.id ? ' selected' : '';
    html += '<div class="suspect-option' + selected + '" onclick="selectSuspect(\'' + sus.id + '\')">' +
      '<div class="suspect-option-photo">\uD83D\uDC64</div>' +
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

function renderFinalQuestions() {
  var container = document.getElementById('solutionQuestions');
  if (!config.stages) return;
  var finalStage = config.stages.find(function(s) { return s.id === 'stage-6-final'; });
  if (!finalStage || !finalStage.finalQuestions) { container.innerHTML = ''; return; }

  var html = '';
  finalStage.finalQuestions.forEach(function(q, i) {
    if (q.type === 'multipleChoice') {
      html += '<div class="solution-q-item"><div class="solution-q-label">' + q.prompt + '</div>';
      q.options.forEach(function(opt, j) {
        var sel = (gameState.solutionAnswers[i] == j) ? ' selected' : '';
        html += '<div class="final-option' + sel + '" onclick="selectFinalAnswer(' + i + ',' + j + ')">' + opt + '</div>';
      });
      html += '</div>';
    }
    if (q.type === 'topicSelect') {
      html += '<div class="solution-q-item"><div class="solution-q-label">' + q.prompt + '</div><div class="topic-grid">';
      q.topics.forEach(function(topic, j) {
        var sel = (gameState.solutionAnswers[i] == j) ? ' selected' : '';
        html += '<div class="topic-card' + sel + '" onclick="selectFinalAnswer(' + i + ',' + j + ')">' + topic + '</div>';
      });
      html += '</div></div>';
    }
    if (q.type === 'typeIn') {
      var savedVal = gameState.solutionAnswers[i] || '';
      html += '<div class="solution-q-item">' +
        '<div class="solution-q-label">' + q.prompt + '</div>' +
        '<input class="solution-q-input" type="text" placeholder="Your answer..." ' +
        'value="' + savedVal + '" oninput="saveFinalAnswer(' + i + ', this.value)" autocomplete="off">' +
      '</div>';
    }
  });

  container.innerHTML = html;
  checkSolutionReady();
}

function selectFinalAnswer(qIdx, aIdx) {
  if (!gameState.solutionAnswers) gameState.solutionAnswers = [];
  gameState.solutionAnswers[qIdx] = aIdx;
  saveGame();
  renderFinalQuestions();
}

function saveFinalAnswer(qIdx, value) {
  if (!gameState.solutionAnswers) gameState.solutionAnswers = [];
  gameState.solutionAnswers[qIdx] = value;
  saveGame();
  checkSolutionReady();
}

function checkSolutionReady() {
  var btn = document.getElementById('solutionSubmitBtn');
  if (!btn) return;
  var hasSuspect  = !!gameState.selectedSuspect;
  var finalStage  = config.stages.find(function(s) { return s.id === 'stage-6-final'; });
  var hasAnswers  = true;
  if (finalStage && finalStage.finalQuestions) {
    finalStage.finalQuestions.forEach(function(q, i) {
      var ans = gameState.solutionAnswers[i];
      if (ans === undefined || ans === null || ans === '') hasAnswers = false;
    });
  }
  btn.disabled = !(hasSuspect && hasAnswers);
}

function submitSolution() {
  var finalStage = config.stages.find(function(s) { return s.id === 'stage-6-final'; });
  if (!finalStage || !finalStage.finalQuestions) return;

  var allCorrect = true;

  if (gameState.selectedSuspect !== config.solution.correctSuspect) allCorrect = false;

  finalStage.finalQuestions.forEach(function(q, i) {
    var playerAnswer = gameState.solutionAnswers[i];
    if (q.type === 'multipleChoice' || q.type === 'topicSelect') {
      if (playerAnswer !== q.correctIndex) allCorrect = false;
    }
    if (q.type === 'typeIn') {
      var lower = (playerAnswer || '').toString().trim().toLowerCase();
      var match = q.acceptedAnswers.some(function(a) { return a.toLowerCase() === lower; });
      if (!match) allCorrect = false;
    }
  });

  if (allCorrect) {
    gameState.caseSolved  = true;
    gameState.solvedDate  = new Date().toISOString();
    saveGame();
    showRevealPage(); // → triggers cinematic
  } else {
    document.getElementById('solutionForm').style.display  = 'none';
    document.getElementById('solutionWrong').style.display = 'block';
  }
}

function retrySolution() {
  gameState.selectedSuspect  = null;
  gameState.solutionAnswers  = [];
  saveGame();
  document.getElementById('solutionForm').style.display  = 'block';
  document.getElementById('solutionWrong').style.display = 'none';
  renderSuspectSelect();
  renderFinalQuestions();
}

/* ═══════════════════════════════════════════════════════
   END SEQUENCE
   ═══════════════════════════════════════════════════════ */

/* ── STEP 1: CINEMATIC ── */

function showRevealPage() {
  document.getElementById('solutionSection').style.display = 'none';
  document.getElementById('mainHub').style.display = 'none';
  runCinematic();
}

function runCinematic() {
  var overlay = document.getElementById('cinematicOverlay');
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';

  var canvas  = document.getElementById('cinematicCanvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  var ctx = canvas.getContext('2d');

  // Collect evidence names player has seen
  var evidenceNames = [];
  if (config && config.evidence) {
    config.evidence.forEach(function(ev) {
      if (gameState.viewedEvidence.includes(ev.id) || gameState.unlockedEvidence.includes(ev.id)) {
        evidenceNames.push(ev.name);
      }
    });
  }
  if (evidenceNames.length < 5) {
    evidenceNames = [
      'Missing Person Report','911 Call Transcript','Witness Statement — Evelyn Pike',
      'Station Phone Records','Station Maintenance Memo','Lena Hart — Blog Archive',
      'Therapy Session Notes','Internal Station Complaint','Forest Search Photos',
      'Incident Report — RESTRICTED','TAPE-003 — Voss Interview Recording'
    ];
  }

  // Pin nodes for red string
  var nodes = [
    {x:0.12,y:0.18},{x:0.45,y:0.08},{x:0.78,y:0.25},
    {x:0.88,y:0.55},{x:0.62,y:0.72},{x:0.30,y:0.80},{x:0.08,y:0.62}
  ];

  var startTime    = null;
  var totalDuration = 5200;
  var stampTime     = 3800;
  var stampDone     = false;

  // Initial black fill
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function frame(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var t = Math.min(elapsed / totalDuration, 1);
    var W = canvas.width, H = canvas.height;

    // Persistent dark overlay (motion blur effect)
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(0, 0, W, H);

    // Scanlines
    ctx.fillStyle = 'rgba(160,176,144,0.015)';
    for (var sl = 0; sl < H; sl += 4) { ctx.fillRect(0, sl, W, 1); }

    // Red string — draws progressively over first 2.4s
    var strProgress = Math.min(elapsed / 2400, 1);
    if (strProgress > 0 && nodes.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(184,58,42,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(nodes[0].x * W, nodes[0].y * H);
      var maxNode = strProgress * (nodes.length - 1);
      for (var ni = 1; ni < nodes.length; ni++) {
        if (ni > maxNode) break;
        var prevX = nodes[ni-1].x * W, prevY = nodes[ni-1].y * H;
        var curX  = nodes[ni].x * W,   curY  = nodes[ni].y * H;
        var cpx   = (prevX + curX) / 2;
        var cpy   = (prevY + curY) / 2 + 14;
        ctx.quadraticCurveTo(cpx, cpy, curX, curY);
      }
      ctx.stroke();

      // Pins
      var pinCount = Math.ceil(maxNode);
      for (var pi = 0; pi < Math.min(pinCount, nodes.length); pi++) {
        ctx.beginPath();
        ctx.arc(nodes[pi].x * W, nodes[pi].y * H, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(196,74,58,0.88)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(nodes[pi].x * W, nodes[pi].y * H, 7, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(196,74,58,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Flashing evidence names
    if (elapsed < stampTime - 200) {
      var nameInterval = 300;
      var nameIdx      = Math.floor(elapsed / nameInterval) % evidenceNames.length;
      var nameAge      = (elapsed % nameInterval) / nameInterval;
      var nameOpacity  = nameAge < 0.45 ? nameAge / 0.45 : (nameAge > 0.7 ? (1 - nameAge) / 0.3 : 1);

      var seed = nameIdx * 2.618;
      var xPos = ((seed * 6.3) % 0.7 + 0.1) * W;
      var yPos = ((seed * 3.9) % 0.65 + 0.18) * H;

      ctx.save();
      ctx.globalAlpha = nameOpacity * 0.65;
      ctx.font = '12px "Courier Prime", Courier, monospace';
      ctx.fillStyle = '#d4c9b0';
      ctx.fillText(evidenceNames[nameIdx].toUpperCase(), xPos, yPos);
      // Ghost card bg
      ctx.globalAlpha = nameOpacity * 0.07;
      ctx.fillStyle = '#b8a98a';
      var tw = ctx.measureText(evidenceNames[nameIdx].toUpperCase()).width;
      ctx.fillRect(xPos - 6, yPos - 14, tw + 12, 22);
      ctx.restore();
    }

    // ── SECRET: ARCHIVE COPY 02 flash at ~3.15s (blink-and-miss) ──
    if (elapsed > 3120 && elapsed < 3260) {
      var af = elapsed < 3175 ? (elapsed - 3120) / 55 : (3260 - elapsed) / 85;
      ctx.save();
      ctx.globalAlpha = af * 0.5;
      ctx.font = '10px "Courier Prime", Courier, monospace';
      ctx.fillStyle = '#c8bfb0';
      ctx.fillText('ARCHIVE COPY 02', W - 148, H - 24);
      ctx.restore();
    }

    // Vignette
    var vig = ctx.createRadialGradient(W/2, H/2, W*0.18, W/2, H/2, W*0.72);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Trigger stamp slam
    if (elapsed >= stampTime && !stampDone) {
      stampDone = true;
      document.getElementById('cinematicStamp').classList.add('slam');
    }

    if (elapsed < totalDuration) {
      requestAnimationFrame(frame);
    } else {
      // Hold 400ms then fade to reveal page
      setTimeout(function() {
        overlay.style.transition = 'opacity 0.75s ease';
        overlay.style.opacity    = '0';
        setTimeout(function() {
          overlay.style.display    = 'none';
          overlay.style.opacity    = '1';
          overlay.style.transition = '';
          // Reset stamp for next time
          document.getElementById('cinematicStamp').classList.remove('slam');
          showFullRevealPage();
        }, 800);
      }, 420);
    }
  }

  requestAnimationFrame(frame);
}

// DEV shortcut
function devTriggerCinematic() {
  document.getElementById('mainHub').style.display = 'none';
  runCinematic();
}

/* ── STEP 2: REVEAL PAGE ── */

/* revealCharacters data lives in config.json under "revealCharacters" */

function showFullRevealPage() {
  var page = document.getElementById('revealFullpage');
  page.style.display = 'block';
  page.scrollTop = 0;

  document.getElementById('revealFpTitle').textContent =
    (config ? config.title : 'The Moth Hollow Tapes') + ' \u2014 Case Resolved';

  document.getElementById('revealFpCaseId').textContent =
    'Case File #' + (config ? config.caseId : 'WHL-1998-001');

  var solvedDate = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  var dateStr    = solvedDate.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  document.getElementById('revealFpSolvedBy').textContent =
    'Resolved by ' + formatDetectiveTitle() + ' \u2014 ' + dateStr;

  var storyText = (config && config.solution && config.solution.caseClosedText)
    ? config.solution.caseClosedText
    : 'The full case resolution has not been configured.';
  document.getElementById('revealFpStory').textContent = storyText;

  // Characters — driven by config.revealCharacters
  var container = document.getElementById('revealFpCharacters');
  var html = '';
  var chars = (config && config.revealCharacters) ? config.revealCharacters : [];
  chars.forEach(function(char) {
    html += '<div class="reveal-fp-char">' +
      '<div class="reveal-fp-char-icon">' + char.icon + '</div>' +
      '<div class="reveal-fp-char-body">' +
        '<div class="reveal-fp-char-name">' + char.name + '</div>' +
        '<div class="reveal-fp-char-role">' + char.role + '</div>' +
        '<div class="reveal-fp-char-verdict">' + char.verdict + '</div>' +
        '<span class="reveal-fp-char-status ' + char.status + '">' + char.statusLabel + '</span>' +
      '</div>' +
    '</div>';
  });
  container.innerHTML = html;

  var finalNote = (config && config.finalNote)
    ? config.finalNote
    : 'This file has been archived.';
  document.getElementById('revealFpFinalNote').textContent = finalNote;
}

/* ── STEP 3: RETURN TO HUB ── */

function returnToHub() {
  var page = document.getElementById('revealFullpage');
  page.style.transition = 'opacity 0.5s ease';
  page.style.opacity    = '0';

  setTimeout(function() {
    page.style.display    = 'none';
    page.style.opacity    = '1';
    page.style.transition = '';

    document.getElementById('mainHub').style.display = 'block';

    var stamp = document.getElementById('headerStamp');
    if (stamp) {
      stamp.textContent       = 'CASE CLOSED';
      stamp.style.color       = '#4a7a4a';
      stamp.style.borderColor = '#4a7a4a';
    }

    renderHub();

    // Spectrogram notification
    if (config && config.spectrogramTool && config.spectrogramTool.unlocksAfterReveal) {
      if (!gameState.spectrogramUnlocked) {
        gameState.spectrogramUnlocked = true;
        saveGame();
        setTimeout(showSpectroNotification, 900);
      }
    }
  }, 520);
}

/* ── SPECTROGRAM ── */

function showSpectroNotification() {
  var notif  = document.getElementById('spectroNotification');
  var textEl = document.getElementById('spectroNotifText');
  var msg    = (config && config.spectrogramTool && config.spectrogramTool.notificationText)
    ? config.spectrogramTool.notificationText
    : 'NEW TOOL UNLOCKED \u2014 Spectrogram Analyzer added to your evidence kit.';
  textEl.textContent = msg;
  notif.style.display = 'block';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      notif.classList.add('visible');
    });
  });
}

function dismissSpectroNotification() {
  var notif = document.getElementById('spectroNotification');
  notif.classList.remove('visible');
  setTimeout(function() { notif.style.display = 'none'; }, 520);
}

function runSpectrogram(audioId) {
  var tool = config && config.spectrogramTool;
  if (!tool) return;

  document.getElementById('spectroModalLabel').textContent = tool.resultLabel || 'Spectrogram Analysis';
  document.getElementById('spectroModalImg').src           = tool.resultImage  || '';
  document.getElementById('spectroModalBg').style.display  = 'flex';

  if (!gameState.spectrogramAnalyzed) gameState.spectrogramAnalyzed = [];
  if (!gameState.spectrogramAnalyzed.includes(audioId)) {
    gameState.spectrogramAnalyzed.push(audioId);
    saveGame();
    renderAudio();
  }
}

function closeSpectroModal() {
  document.getElementById('spectroModalBg').style.display = 'none';
  document.getElementById('spectroModalImg').src = '';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeSpectroModal();
});

/* ═══════════════════════════════════════════════════════
   DOWNLOADABLE REWARDS (unchanged from original)
   ═══════════════════════════════════════════════════════ */

function createCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
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
  ctx.fillStyle = '#f8f4ec'; ctx.fillRect(0,0,1200,800);
  ctx.strokeStyle = '#d4c9b0'; ctx.lineWidth = 2; ctx.strokeRect(30,30,1140,740);
  ctx.strokeStyle = '#b8a98a'; ctx.lineWidth = 1; ctx.strokeRect(40,40,1120,720);
  var grad = ctx.createLinearGradient(40,40,1160,40);
  grad.addColorStop(0,'#c47a6a'); grad.addColorStop(0.5,'#e8d88c'); grad.addColorStop(1,'#8cb88a');
  ctx.fillStyle = grad; ctx.fillRect(40,40,1120,4);
  ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.textAlign = 'center';
  ctx.fillText('THE SEALED FILE CO // OFFICIAL CASE CLOSURE DOCUMENT',600,85);
  ctx.save(); ctx.translate(600,160); ctx.rotate(-0.03);
  ctx.strokeStyle = '#4a7a4a'; ctx.lineWidth = 3; ctx.strokeRect(-100,-25,200,50);
  ctx.fillStyle = '#4a7a4a'; ctx.font = 'bold 24px Courier'; ctx.textAlign = 'center';
  ctx.fillText('CASE CLOSED',0,8); ctx.restore();
  ctx.fillStyle = '#2c2518'; ctx.font = 'bold 28px Georgia'; ctx.textAlign = 'center';
  ctx.fillText(config.title,600,240);
  ctx.fillStyle = '#9a8b72'; ctx.font = '14px Courier';
  ctx.fillText('Case File #' + config.caseId,600,270);
  ctx.strokeStyle = '#d4c9b0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(300,300); ctx.lineTo(900,300); ctx.stroke();
  ctx.fillStyle = '#2c2518'; ctx.font = '16px Georgia'; ctx.fillText('This document certifies that',600,350);
  ctx.fillStyle = '#2a4066'; ctx.font = 'bold 24px Georgia'; ctx.fillText(formatDetectiveTitle(),600,395);
  ctx.fillStyle = '#2c2518'; ctx.font = '16px Georgia';
  ctx.fillText('has successfully resolved the investigation and identified',600,440);
  ctx.fillText('the responsible party through careful evidence analysis.',600,465);
  var solvedDate = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  var dateStr    = solvedDate.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  ctx.fillStyle = '#6b5d48'; ctx.font = '14px Courier';
  ctx.fillText('Date of resolution: ' + dateStr,600,520);
  ctx.strokeStyle = '#d4c9b0';
  ctx.beginPath(); ctx.moveTo(300,560); ctx.lineTo(900,560); ctx.stroke();
  ctx.fillStyle = '#9a8b72'; ctx.font = '12px Courier';
  ctx.textAlign = 'left'; ctx.fillText(config.departmentName || 'Police Department',100,620);
  ctx.fillText('Case Archives Division',100,640);
  ctx.textAlign = 'right'; ctx.fillText('The Sealed File Co',1100,620);
  ctx.fillText('Recovered Files Archive',1100,640);
  ctx.strokeStyle = '#b8a98a';
  ctx.beginPath(); ctx.moveTo(100,700); ctx.lineTo(400,700); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(800,700); ctx.lineTo(1100,700); ctx.stroke();
  ctx.fillStyle = '#9a8b72'; ctx.font = '10px Courier'; ctx.textAlign = 'center';
  ctx.fillText('Authorized signatory',250,720); ctx.fillText('Archive administrator',950,720);
  ctx.beginPath(); ctx.arc(1050,150,35,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(139,109,63,0.08)'; ctx.lineWidth = 5; ctx.stroke();
  downloadCanvas(c,'case-closure-certificate.png');
}

function downloadBadge() {
  var c = createCanvas(1080,1920); var ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0c08'; ctx.fillRect(0,0,1080,1920);
  ctx.fillStyle = 'rgba(138,154,122,0.03)';
  for (var i=0;i<1920;i+=4) { ctx.fillRect(0,i,1080,2); }
  var vig = ctx.createRadialGradient(540,960,200,540,960,900);
  vig.addColorStop(0,'transparent'); vig.addColorStop(1,'rgba(0,0,0,0.4)');
  ctx.fillStyle = vig; ctx.fillRect(0,0,1080,1920);
  ctx.fillStyle = '#3a4a30'; ctx.font = '18px Courier'; ctx.textAlign = 'center';
  ctx.fillText('THE SEALED FILE CO // ARCHIVE',540,200);
  ctx.save(); ctx.translate(540,500); ctx.rotate(-0.02);
  ctx.strokeStyle = '#6a9a5a'; ctx.lineWidth = 4; ctx.strokeRect(-180,-50,360,100);
  ctx.fillStyle = '#6a9a5a'; ctx.font = 'bold 48px Courier'; ctx.fillText('CASE CLOSED',0,16); ctx.restore();
  ctx.fillStyle = '#5a6a50'; ctx.font = '24px Courier'; ctx.fillText('CF-' + config.caseId,540,640);
  ctx.fillStyle = '#a0b890'; ctx.font = 'bold 36px Courier';
  var words = config.title.split(' '); var mid = Math.ceil(words.length/2);
  ctx.fillText(words.slice(0,mid).join(' '),540,760);
  if (words.length > mid) ctx.fillText(words.slice(mid).join(' '),540,810);
  ctx.fillStyle = '#5a6a50'; ctx.font = '20px Courier'; ctx.fillText('RESOLVED BY',540,960);
  ctx.fillStyle = '#8a9a7a'; ctx.font = 'bold 28px Courier';
  ctx.fillText(formatDetectiveTitle().toUpperCase(),540,1010);
  var sd = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  ctx.fillStyle = '#3a4a30'; ctx.font = '18px Courier';
  ctx.fillText(sd.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}),540,1100);
  ctx.strokeStyle = '#2a3020'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(300,1200); ctx.lineTo(780,1200); ctx.stroke();
  ctx.fillStyle = '#3a4a30'; ctx.font = '16px Courier'; ctx.fillText('thesealedfileco.com',540,1700);
  ctx.font = '14px Courier'; ctx.fillText('RECOVERED FILES ARCHIVE',540,1730);
  downloadCanvas(c,'sealed-file-co-badge.png');
}

function downloadID() {
  var c = createCanvas(900,560); var ctx = c.getContext('2d');
  ctx.fillStyle = '#f8f4ec'; ctx.fillRect(0,0,900,560);
  ctx.strokeStyle = '#d4c9b0'; ctx.lineWidth = 2; ctx.strokeRect(10,10,880,540);
  ctx.fillStyle = '#2a4066'; ctx.fillRect(10,10,880,50);
  ctx.fillStyle = '#f8f4ec'; ctx.font = 'bold 16px Courier'; ctx.textAlign = 'left';
  ctx.fillText('THE SEALED FILE CO',30,42);
  ctx.textAlign = 'right'; ctx.font = '12px Courier'; ctx.fillText('INVESTIGATOR CREDENTIALS',870,42);
  ctx.fillStyle = '#e8dfc8'; ctx.fillRect(30,80,160,200);
  ctx.strokeStyle = '#d4c9b0'; ctx.lineWidth = 1; ctx.strokeRect(30,80,160,200);
  ctx.fillStyle = '#9a8b72'; ctx.font = '48px Arial'; ctx.textAlign = 'center'; ctx.fillText('\uD83D\uDC64',110,200);
  ctx.textAlign = 'left'; ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.fillText('NAME',220,105);
  ctx.fillStyle = '#2c2518'; ctx.font = 'bold 20px Georgia'; ctx.fillText(formatNames(),220,132);
  ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.fillText('DESIGNATION',220,170);
  ctx.fillStyle = '#2c2518'; ctx.font = '16px Georgia'; ctx.fillText('Independent Investigator',220,194);
  ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.fillText('CREDENTIAL ID',220,235);
  ctx.fillStyle = '#2c2518'; ctx.font = '16px Courier';
  ctx.fillText('SF-' + Math.random().toString(36).substr(2,8).toUpperCase(),220,258);
  ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.fillText('CLEARANCE LEVEL',600,105);
  ctx.fillStyle = '#4a7a4a'; ctx.font = 'bold 28px Courier'; ctx.fillText('LEVEL 1',600,138);
  ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.fillText('CASES RESOLVED',600,185);
  ctx.fillStyle = '#2c2518'; ctx.font = 'bold 28px Georgia'; ctx.fillText('1',600,218);
  ctx.strokeStyle = '#d4c9b0'; ctx.beginPath(); ctx.moveTo(30,310); ctx.lineTo(870,310); ctx.stroke();
  ctx.fillStyle = '#9a8b72'; ctx.font = '11px Courier'; ctx.textAlign = 'left'; ctx.fillText('RESOLVED CASE LOG',30,345);
  ctx.fillStyle = '#2c2518'; ctx.font = '13px Courier';
  ctx.fillText('CF-' + config.caseId + '  ' + config.title,30,375);
  var sd2 = gameState.solvedDate ? new Date(gameState.solvedDate) : new Date();
  ctx.fillStyle = '#4a7a4a'; ctx.font = '12px Courier';
  ctx.fillText('RESOLVED ' + sd2.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}),30,398);
  ctx.save(); ctx.translate(780,430); ctx.rotate(-0.15);
  ctx.strokeStyle = 'rgba(184,58,42,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(-55,-20,110,40);
  ctx.fillStyle = 'rgba(184,58,42,0.25)'; ctx.font = 'bold 14px Courier'; ctx.textAlign = 'center';
  ctx.fillText('VERIFIED',0,5); ctx.restore();
  ctx.fillStyle = '#e8dfc8'; ctx.fillRect(10,490,880,60);
  ctx.fillStyle = '#9a8b72'; ctx.font = '10px Courier'; ctx.textAlign = 'left';
  ctx.fillText('This credential is issued by The Sealed File Co and the associated case archive.',30,515);
  ctx.fillText('Clearance level increases with each resolved case.',30,535);
  downloadCanvas(c,'detective-id-card.png');
}

/* ── POPUP SYSTEM ── */

function showPopup(popupKey, onDismiss) {
  var popup = config.popups && config.popups[popupKey];
  if (!popup) { if (onDismiss) onDismiss(); return; }

  var name = formatNames();
  var body = popup.body
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  // Address player by name in the case briefing
  var greeting = popupKey === 'caseBriefing'
    ? '<p class="popup-greeting">Detective ' + name + ',</p>'
    : '';

  var overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.innerHTML =
    '<div class="popup-box">' +
      '<div class="popup-header">' + popup.header + '</div>' +
      '<div class="popup-body">' +
        greeting +
        '<p>' + body + '</p>' +
      '</div>' +
      '<button class="popup-dismiss" onclick="dismissPopup(this)">' +
        popup.dismissText +
      '</button>' +
    '</div>';

  // Store callback so dismiss can call it
  overlay._onDismiss = onDismiss;
  document.body.appendChild(overlay);
}

function dismissPopup(btn) {
  var overlay = btn.closest('.popup-overlay');
  var cb = overlay._onDismiss;
  overlay.remove();
  if (cb) cb();
}

/* ── DEV ── */

function devSkipStage() {
  var nextStage = null;
  for (var i = 0; i < config.stages.length; i++) {
    if (!gameState.completedStages.includes(config.stages[i].id)) {
      nextStage = config.stages[i]; break;
    }
  }
  if (!nextStage) { alert('All stages complete!'); return; }
  if (!gameState.viewedEvidence.includes('hw-001')) gameState.viewedEvidence.push('hw-001');
  processStage(nextStage.id);
  checkStageTriggers();
  renderHub();
  saveGame();
  console.log('DEV: Skipped to ' + nextStage.id);
}

// Addition
function handleCharOverlayClick(e) {
  if (e.target === document.getElementById('charModalOverlay')) closeCharacterModal();
}

/* ── CHARACTER MODAL ENGINE ── */
 
function openCharacterModal(suspectId) {
  var sus = config.suspects.find(function(s) { return s.id === suspectId; });
  var profile = config.characterProfiles && config.characterProfiles[suspectId];
  if (!sus || !profile) return;
 
  var overlay = document.getElementById('charModalOverlay');
  if (!overlay) return;
 
  // Build strip colors based on status
  var stripColors = {
    suspect: ['#b83a2a','#b83a2a','#9a7b2e'],
    victim:  ['#b83a2a','#9a7b2e','#2a4066'],
    review:  ['#7a6b50','#7a6b50','#d4c9b0'],
    missing: ['#2a4066','#9a7b2e','#7a6b50']
  };
  var colors = stripColors[sus.status] || stripColors.review;
 
  var statusLabels = { victim:'Victim', missing:'Missing', review:'Under review' };
 
  // Header photo
  var photoHtml = sus.photo
    ? '<img src="' + sus.photo + '" alt="' + sus.name + '">'
    : (sus.initial || '\uD83D\uDC64');
 
  // ── Body sections ──
  var bodySections = '';
 
  // 1. Basic Info — always shown
  if (profile.basicInfo && profile.basicInfo.length) {
    var infoRows = profile.basicInfo.map(function(r) {
      return '<div class="cmp-info-row">' +
        '<span class="cmp-info-label">' + r.label + '</span>' +
        '<span class="cmp-info-value">' + r.value + '</span>' +
        '</div>';
    }).join('');
    bodySections += section('Basic Information', '<div class="cmp-info-grid">' + infoRows + '</div>');
  }
 
  // 2. Case file summary — always shown (static pre-game facts only)
  if (profile.summary) {
    bodySections += section('Case File Summary',
      '<p class="cmp-summary">' + profile.summary + '</p>');
  }
 
  // 3. Statement on record — only when source evidence is unlocked
  if (profile.statement && isEvidenceVisible(profile.statement.requiresEvidence)) {
    bodySections += section('Statement on Record',
      '<div class="cmp-quote">' + profile.statement.quote.replace(/\n/g,'<br>') +
      '<span class="cmp-quote-source">' + profile.statement.source + '</span>' +
      '</div>');
  }
 
  // 4. Associated evidence — only unlocked items, nothing locked or hidden
  var visibleEvLinks = (profile.evidenceLinks || []).filter(function(link) {
    return gameState.unlockedEvidence.includes(link.evidenceId);
  });
  if (visibleEvLinks.length) {
    var linksHtml = visibleEvLinks.map(function(link) {
      var ev = config.evidence.find(function(e) { return e.id === link.evidenceId; });
      var href  = (ev && ev.file) ? ev.file : '#';
      var icon  = link.icon || (ev ? ev.icon : '📋');
      var name  = link.name || (ev ? ev.name : link.evidenceId);
      var desc  = link.desc || (ev ? ev.description : '');
      var badge = link.badge || 'doc';
      return '<a class="cmp-ev-link" href="' + href + '" target="_blank" onclick="markViewed(\'' + link.evidenceId + '\')">' +
        '<span class="cmp-ev-icon">' + icon + '</span>' +
        '<span class="cmp-ev-content">' +
          '<span class="cmp-ev-id">' + link.evidenceId.toUpperCase() + '</span>' +
          '<span class="cmp-ev-name">' + name + '</span>' +
          '<span class="cmp-ev-desc">' + desc + '</span>' +
        '</span>' +
        '<span class="cmp-ev-badge badge-' + badge + '">' + badge.toUpperCase() + '</span>' +
      '</a>';
    }).join('');
    bodySections += section('Associated Evidence', '<div class="cmp-ev-list">' + linksHtml + '</div>');
  }
 
  // 5. Social / external profiles — always shown if defined, no gate
  if (profile.socialLinks && profile.socialLinks.length) {
    var socialHtml = profile.socialLinks.map(function(link) {
      return '<a class="cmp-social-btn" href="' + link.url + '" target="_blank">' +
        '<span class="cmp-social-btn-icon">' + link.icon + '</span>' +
        '<span>' +
          '<span class="cmp-social-btn-label">' + link.label + '</span>' +
          '<span class="cmp-social-btn-sub">' + link.sublabel + '</span>' +
        '</span>' +
        '<span class="cmp-social-btn-arrow">OPEN →</span>' +
      '</a>';
    }).join('');
    bodySections += section('Online Profiles', '<div class="cmp-social-links">' + socialHtml + '</div>');
  }
 
  // ── Assemble ──
  var stripHtml = colors.map(function(c) { return '<span style="background:' + c + '"></span>'; }).join('');
 
  document.getElementById('charModalOverlay').querySelector('.char-modal').innerHTML =
    '<div class="char-modal-strip">' + stripHtml + '</div>' +
 
    '<div class="char-modal-header">' +
      '<div class="char-modal-photo">' + photoHtml + '</div>' +
      '<div class="char-modal-name-block">' +
        '<span class="char-modal-status ' + sus.status + '">' + (statusLabels[sus.status] || 'Under review') + '</span>' +
        '<div class="char-modal-name">' + sus.name + '</div>' +
        '<div class="char-modal-role">' + sus.role + '</div>' +
        '<div class="char-modal-fileid">' + (profile.fileId || sus.id.toUpperCase()) + ' &nbsp;·&nbsp; CASE ' + config.caseId + '</div>' +
      '</div>' +
      '<button class="char-modal-close" onclick="closeCharacterModal()">✕ CLOSE</button>' +
    '</div>' +
 
    '<div class="char-modal-body">' + bodySections + '</div>' +
 
    '<div class="char-modal-footer">' +
      '<span>' + (profile.footerRef || 'FILE: ' + sus.id.toUpperCase()) + '</span>' +
      '<span>THE SEALED FILE CO</span>' +
    '</div>';
 
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
 
/* Helper: build a section block */
function section(label, contentHtml) {
  return '<div class="cmp-section">' +
    '<div class="cmp-label">' + label + '</div>' +
    contentHtml +
  '</div>';
}
 
/* Helper: check if evidence is accessible to the player.
   Pass null/undefined to mean "always show". Pass a string or array. */
function isEvidenceVisible(requiresEvidence) {
  if (!requiresEvidence) return true;
  if (Array.isArray(requiresEvidence)) {
    // All items must be unlocked
    return requiresEvidence.every(function(id) {
      return gameState.unlockedEvidence.includes(id);
    });
  }
  return gameState.unlockedEvidence.includes(requiresEvidence);
}
 
/* Helper: mark evidence as viewed when opened from modal (triggers stage checks) */
function markViewed(evidenceId) {
  if (!gameState.viewedEvidence.includes(evidenceId)) {
    gameState.viewedEvidence.push(evidenceId);
    checkSuspectTriggers();
    saveGame();
    checkStageTriggers();
    renderHub();
  }
}
 
function closeCharacterModal() {
  var overlay = document.getElementById('charModalOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}
 
// Close on overlay click or Escape
// (Add this to your existing DOMContentLoaded listener, or add a second one)
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeCharacterModal();
});

/* ── BOOT ── */
document.addEventListener('DOMContentLoaded', init);