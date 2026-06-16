/* ═══════════════════════════════════════════════════════
   THE SEALED FILE CO. — Moth Hollow Tapes
   script.js — Complete game engine
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ── CONSTANTS ─────────────────────────────────────────── */
var SAVE_KEY = 'mht-save-v1';

/* ── STATE ─────────────────────────────────────────────── */
var C = null; // config

var S = {
  detectives:       [],   // array of name strings
  unlockedEvidence: [],   // array of evidence IDs
  viewedEvidence:   [],   // array of evidence IDs
  revealedPeople:   [],   // array of person IDs
  leadStates:       {},   // { leadId: 'active'|'inprogress'|'closed'|'locked' }
  leadSelections:   {},   // { leadId: { fieldId: value } }
  hintsUsed:        {},   // { leadId: number }
  findings:         [],   // array of finding strings in order
  caseSolved:       false,
  solvedDate:       null
};

/* ── AUDIO STATE ───────────────────────────────────────── */
var audio = {
  el:        null,
  currentId: null,
  playing:   false
};

/* ── ACTIVE LEAD ───────────────────────────────────────── */
var activeLead = null; // lead object currently open in detail view


/* ═══════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  fetch('config.json')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      C = cfg;
      loadSave();
      initLeadStates();
      bindNameGate();
      bindAudio();
      bindModals();

      if (S.detectives.length > 0) {
        showHub();
      } else {
        showScreen('screen-namegate');
      }
    })
    .catch(function () {
      document.body.innerHTML = '<p style="padding:2rem;font-family:monospace">Unable to load case file. Please check your connection.</p>';
    });
});


/* ═══════════════════════════════════════════════════════
   SAVE / LOAD
   ═══════════════════════════════════════════════════════ */
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}

function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      Object.assign(S, parsed);
    }
  } catch (e) {}
}

/* Ensure every lead has a state entry; never overwrite existing ones */
function initLeadStates() {
  C.leads.forEach(function (lead) {
    if (!S.leadStates[lead.id]) {
      S.leadStates[lead.id] = lead.status; // 'active' or 'locked'
    }
  });

  // Ensure Naomi always visible
  if (!S.revealedPeople.includes('naomi-vale')) {
    S.revealedPeople.push('naomi-vale');
  }
  if (!S.revealedPeople.includes('sheriff-mercer')) {
    S.revealedPeople.push('sheriff-mercer');
  }

  // Unlock start evidence for lead-01
  var lead1 = C.leads[0];
  lead1.startHereEvidence.forEach(function (id) {
    unlockEvidence(id, true);
  });
}


/* ═══════════════════════════════════════════════════════
   SCREEN MANAGEMENT
   ═══════════════════════════════════════════════════════ */
function showScreen(id) {
  ['screen-namegate', 'screen-intro', 'screen-hub', 'screen-reveal'].forEach(function (s) {
    var el = document.getElementById(s);
    if (el) el.hidden = (s !== id);
  });
}

function showHub() {
  showScreen('screen-hub');
  renderHub();
  showBoardView();
}


/* ═══════════════════════════════════════════════════════
   NAME GATE
   ═══════════════════════════════════════════════════════ */
function bindNameGate() {
  var input   = document.getElementById('nameInput');
  var btn     = document.getElementById('nameBtn');
  var addBtn  = document.getElementById('addNameBtn');
  var nameList = document.getElementById('nameList');

  function refreshBtn() {
    btn.disabled = S.detectives.length === 0 && input.value.trim() === '';
  }

  input.addEventListener('input', refreshBtn);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addCurrentName();
  });

  addBtn.addEventListener('click', function () {
    addCurrentName();
    input.focus();
  });

  btn.addEventListener('click', function () {
    addCurrentName();
    if (S.detectives.length === 0) return;
    save();
    runIntro();
  });

  function addCurrentName() {
    var name = input.value.trim();
    if (!name || S.detectives.includes(name)) { input.value = ''; return; }
    S.detectives.push(name);
    input.value = '';
    renderNameTags();
    refreshBtn();
  }

  function renderNameTags() {
    nameList.innerHTML = S.detectives.map(function (n, i) {
      return '<span class="namegate-name-tag">' + esc(n) +
        '<button onclick="removeName(' + i + ')" aria-label="Remove">×</button></span>';
    }).join('');
  }

  refreshBtn();
}

window.removeName = function (i) {
  S.detectives.splice(i, 1);
  var nameList = document.getElementById('nameList');
  nameList.innerHTML = S.detectives.map(function (n, idx) {
    return '<span class="namegate-name-tag">' + esc(n) +
      '<button onclick="removeName(' + idx + ')" aria-label="Remove">×</button></span>';
  }).join('');
  document.getElementById('nameBtn').disabled = S.detectives.length === 0;
};


/* ═══════════════════════════════════════════════════════
   CINEMATIC INTRO
   ═══════════════════════════════════════════════════════ */
function runIntro() {
  showScreen('screen-intro');

  var linesEl = document.getElementById('introLines');
  var stampEl = document.getElementById('introStamp');

  var lines = C.intro.lines.map(function (l) {
    return l.replace('[NAME]', formatDetectiveNames());
  });

  stampEl.textContent = C.intro.stampText;
  linesEl.innerHTML = lines.map(function (l) {
    return '<span class="intro-line">' + esc(l) + '</span>';
  }).join('');

  var lineEls = linesEl.querySelectorAll('.intro-line');
  var delay = 300;

  lineEls.forEach(function (el, i) {
    setTimeout(function () { el.classList.add('visible'); }, delay + i * 600);
  });

  var stampDelay = delay + lineEls.length * 500 + 700;
  setTimeout(function () { stampEl.classList.add('visible'); }, stampDelay);

  setTimeout(function () {
    showHub();
  }, stampDelay + 2600);
}


/* ═══════════════════════════════════════════════════════
   HUB — RENDER
   ═══════════════════════════════════════════════════════ */
function renderHub() {
  // Header
  document.getElementById('hubCaseId').textContent  = C.caseId;
  document.getElementById('hubTitle').textContent   = C.title;
  document.getElementById('hubDetective').textContent = 'Detective ' + formatDetectiveNames();

  renderProgress();
  renderBoard();
}

function renderProgress() {
  var total  = C.leads.filter(function (l) { return !l.optional; }).length;
  var closed = C.leads.filter(function (l) {
    return !l.optional && S.leadStates[l.id] === 'closed';
  }).length;
  var pct = total > 0 ? Math.round((closed / total) * 100) : 0;

  document.getElementById('hubProgressFill').style.width  = pct + '%';
  document.getElementById('hubProgressLabel').textContent = pct + '%';
}


/* ═══════════════════════════════════════════════════════
   BOARD VIEW
   ═══════════════════════════════════════════════════════ */
function showBoardView() {
  document.getElementById('view-board').hidden = false;
  document.getElementById('view-lead').hidden  = true;
  activeLead = null;
  renderBoard();
}

function renderBoard() {
  renderLeadColumns();
  renderFindings();
  renderEvidenceLocker();
  renderPeople();
  renderProgress();
}

/* ── Lead columns ─────────────────────────────────────── */
function renderLeadColumns() {
  var activeEl = document.getElementById('boardLeadsActive');
  var lockedEl = document.getElementById('boardLeadsLocked');
  var closedEl = document.getElementById('boardLeadsClosed');
  var closedLabel = document.getElementById('closedLeadsLabel');

  activeEl.innerHTML = '';
  lockedEl.innerHTML = '';
  closedEl.innerHTML = '';

  var hasActive = false, hasLocked = false, hasClosed = false;

  C.leads.forEach(function (lead, idx) {
    var state = S.leadStates[lead.id] || 'locked';
    var card  = buildLeadCard(lead, state, idx + 1);

    if (state === 'active' || state === 'inprogress') {
      activeEl.appendChild(card);
      hasActive = true;
    } else if (state === 'closed') {
      closedEl.appendChild(card);
      hasClosed = true;
    } else {
      lockedEl.appendChild(card);
      hasLocked = true;
    }
  });

  if (!hasActive) {
    activeEl.innerHTML = '<p class="board-empty-note">No active leads right now.</p>';
  }
  if (!hasLocked) {
    lockedEl.innerHTML = '';
    document.getElementById('lockedLeadsLabel').hidden = true;
  } else {
    document.getElementById('lockedLeadsLabel').hidden = false;
  }
  closedLabel.hidden = !hasClosed;
}

function buildLeadCard(lead, state, num) {
  var card = document.createElement('div');
  card.className = 'lead-card lead-card--' + state;
  card.setAttribute('data-lead-id', lead.id);

  var statusLabels = {
    active:     'NEW',
    inprogress: 'IN PROGRESS',
    locked:     'LOCKED',
    closed:     'CLOSED'
  };

  var statusLabel = statusLabels[state] || 'LOCKED';
  if (lead.optional && state === 'active') statusLabel = 'OPTIONAL';

  var footerText = state === 'closed'
    ? 'Finding recorded'
    : (lead.optional ? 'Optional lead' : 'Lead ' + num);

  card.innerHTML =
    '<div class="lead-card-top">' +
      '<span class="lead-card-num">LEAD ' + String(num).padStart(2, '0') + '</span>' +
      '<span class="lead-card-status lead-card-status--' + state +
        (lead.optional && state === 'active' ? ' lead-card-status--optional' : '') + '">' +
        statusLabel + '</span>' +
    '</div>' +
    '<div class="lead-card-title">' + esc(lead.title) + '</div>' +
    '<div class="lead-card-question">' + esc(lead.question) + '</div>' +
    '<div class="lead-card-footer">' + footerText + '</div>';

  if (state === 'active' || state === 'inprogress') {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () { openLead(lead.id); });
  }

  return card;
}

/* ── Findings ─────────────────────────────────────────── */
function renderFindings() {
  var el    = document.getElementById('boardFindings');
  var count = document.getElementById('findingsCount');
  count.textContent = S.findings.length;

  if (S.findings.length === 0) {
    el.innerHTML = '<p class="board-empty-note">No findings yet. Close your first lead to record a finding.</p>';
    return;
  }

  el.innerHTML = S.findings.map(function (f, i) {
    return '<div class="finding-item">' +
      '<span class="finding-num">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="finding-text">' + esc(f) + '</span>' +
    '</div>';
  }).join('');
}

/* ── Evidence locker ──────────────────────────────────── */
function renderEvidenceLocker() {
  var el    = document.getElementById('boardEvidence');
  var count = document.getElementById('evidenceCount');

  var unlocked = C.evidence.filter(function (ev) {
    return S.unlockedEvidence.includes(ev.id);
  });

  count.textContent = unlocked.length;
  el.innerHTML = '';

  if (unlocked.length === 0) {
    el.innerHTML = '<p class="board-empty-note">No evidence unlocked yet.</p>';
    return;
  }

  unlocked.forEach(function (ev) {
    var isNew    = !S.viewedEvidence.includes(ev.id);
    var card     = document.createElement('div');
    card.className = 'ev-card' + (isNew ? ' ev-card--new' : '');
    card.setAttribute('data-ev-id', ev.id);

    card.innerHTML =
      '<span class="ev-card-icon">' + ev.icon + '</span>' +
      '<span class="ev-card-type">' + ev.type.toUpperCase() + '</span>' +
      '<br>' +
      '<span class="ev-card-name">' + esc(ev.name) + '</span>' +
      (isNew ? '<span class="ev-card-tag ev-card-tag--new">NEW</span>'
             : '<span class="ev-card-tag ev-card-tag--viewed">VIEWED</span>');

    card.addEventListener('click', function () { openEvidence(ev.id); });
    el.appendChild(card);
  });
}

/* ── People ───────────────────────────────────────────── */
function renderPeople() {
  var el    = document.getElementById('boardPeople');
  var count = document.getElementById('peopleCount');

  var revealed = C.people.filter(function (p) {
    return S.revealedPeople.includes(p.id);
  });

  count.textContent = revealed.length;
  el.innerHTML = '';

  C.people.forEach(function (person) {
    var isRevealed = S.revealedPeople.includes(person.id);
    var card       = document.createElement('div');
    card.className = 'person-card' + (isRevealed ? '' : ' person-card--locked');

    var photoHtml = isRevealed
      ? (person.photo
          ? '<img src="' + person.photo + '" alt="' + esc(person.name) + '">'
          : '👤')
      : '?';

    var nameHtml   = isRevealed ? esc(person.name)   : '[Redacted]';
    var statusHtml = isRevealed ? person.status       : 'locked';

    card.innerHTML =
      '<div class="person-photo">' + photoHtml + '</div>' +
      '<div class="person-name">'  + nameHtml  + '</div>' +
      '<span class="person-status person-status--' + statusHtml + '">' +
        statusLabel(person.status, isRevealed) +
      '</span>';

    if (isRevealed) {
      card.addEventListener('click', function () { openPersonModal(person.id); });
    }

    el.appendChild(card);
  });
}

function statusLabel(status, revealed) {
  if (!revealed) return 'CLASSIFIED';
  var map = {
    missing: 'MISSING',
    poi:     'PERSON OF INTEREST',
    witness: 'WITNESS',
    review:  'UNDER REVIEW'
  };
  return map[status] || status.toUpperCase();
}


/* ═══════════════════════════════════════════════════════
   LEAD DETAIL VIEW
   ═══════════════════════════════════════════════════════ */
function openLead(leadId) {
  var lead = C.leads.find(function (l) { return l.id === leadId; });
  if (!lead) return;

  var state = S.leadStates[lead.id];
  if (state !== 'active' && state !== 'inprogress') return;

  // Mark as in-progress
  if (state === 'active') {
    S.leadStates[lead.id] = 'inprogress';
    save();
  }

  activeLead = lead;

  document.getElementById('view-board').hidden = true;
  document.getElementById('view-lead').hidden  = false;

  renderLeadDetail(lead);
}

function renderLeadDetail(lead) {
  // Question bar
  document.getElementById('leadQuestionText').textContent = lead.question;

  // Detective note
  document.getElementById('leadNote').textContent = lead.detectiveNote;

  // Lead switcher tabs
  renderLeadSwitcher(lead.id);

  // Evidence lists
  renderLeadEvidence(lead);

  // Task
  renderTask(lead);

  // Scroll to top
  document.getElementById('view-lead').scrollTop = 0;
}

/* ── Lead switcher tabs ───────────────────────────────── */
function renderLeadSwitcher(currentId) {
  var switcher = document.getElementById('leadNavSwitcher');
  switcher.innerHTML = '';

  var otherActive = C.leads.filter(function (l) {
    var state = S.leadStates[l.id];
    return (state === 'active' || state === 'inprogress') && l.id !== currentId;
  });

  if (otherActive.length === 0) return;

  var divider = document.createElement('div');
  divider.className = 'lead-nav-divider';
  switcher.appendChild(divider);

  otherActive.forEach(function (lead) {
    var tab = document.createElement('button');
    tab.className = 'lead-nav-tab';
    tab.textContent = lead.title;
    tab.addEventListener('click', function () { openLead(lead.id); });
    switcher.appendChild(tab);
  });
}

/* Back button */
document.addEventListener('DOMContentLoaded', function () {
  // Back button bound after DOM ready, but config may not be loaded yet —
  // we bind it here and it uses activeLead at click-time
});

function bindLeadNav() {
  document.getElementById('leadNavBack').addEventListener('click', function () {
    showBoardView();
  });
}

/* ── Evidence in lead view ────────────────────────────── */
function renderLeadEvidence(lead) {
  var startEl = document.getElementById('leadStartHere');
  var allEl   = document.getElementById('leadAllEvidence');

  startEl.innerHTML = '';
  allEl.innerHTML   = '';

  var startIds = lead.startHereEvidence || [];

  // Start Here
  startIds.forEach(function (evId) {
    var ev = C.evidence.find(function (e) { return e.id === evId; });
    if (!ev) return;
    var unlocked = S.unlockedEvidence.includes(evId);
    startEl.appendChild(buildLeadEvCard(ev, true, unlocked));
  });

  // All other unlocked evidence (not in startHere)
  var otherUnlocked = C.evidence.filter(function (ev) {
    return S.unlockedEvidence.includes(ev.id) && !startIds.includes(ev.id);
  });

  if (otherUnlocked.length === 0) {
    allEl.innerHTML = '<p style="font-family:var(--font-body);font-style:italic;font-size:13px;color:var(--ink-4)">No other evidence unlocked yet.</p>';
  } else {
    otherUnlocked.forEach(function (ev) {
      allEl.appendChild(buildLeadEvCard(ev, false, true));
    });
  }
}

function buildLeadEvCard(ev, isStartHere, isUnlocked) {
  var card = document.createElement('div');
  card.className = 'lead-ev-card' +
    (isStartHere ? ' lead-ev-card--starthhere' : '') +
    (ev.type === 'audio' ? ' lead-ev-card--audio' : '');

  if (!isUnlocked) {
    card.style.opacity = '0.5';
    card.style.cursor  = 'default';
  }

  card.innerHTML =
    '<span class="lead-ev-card-icon">' + ev.icon + '</span>' +
    '<span class="lead-ev-card-info">' +
      '<span class="lead-ev-card-id">' + ev.id.toUpperCase() + '</span>' +
      '<span class="lead-ev-card-name">' + esc(ev.name) + '</span>' +
    '</span>';

  if (isUnlocked) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function () { openEvidence(ev.id); });
  }

  return card;
}


/* ═══════════════════════════════════════════════════════
   TASK RENDERING
   ═══════════════════════════════════════════════════════ */
function renderTask(lead) {
  var task = lead.unlockTask;

  // Hide all task blocks
  ['task-theorySelect', 'task-evidenceSelect', 'task-suspectSelect',
   'task-codeEntry', 'task-caseReport'].forEach(function (id) {
    document.getElementById(id).hidden = true;
  });

  // Hide feedback and hints
  document.getElementById('taskFeedback').hidden = true;
  document.getElementById('taskHints').hidden    = true;

  // If lead already closed, show closed state
  if (S.leadStates[lead.id] === 'closed') {
    renderClosedTask(lead);
    return;
  }

  // Show hint state
  var hintsUsed   = S.hintsUsed[lead.id] || 0;
  var maxHints    = task.hints ? task.hints.length : 0;
  var hintBtn     = document.getElementById('taskHintBtn');
  var submitBtn   = document.getElementById('taskSubmitBtn');

  hintBtn.disabled  = hintsUsed >= maxHints;
  submitBtn.disabled = false;

  if (hintsUsed > 0) {
    showHints(lead);
  }

  hintBtn.onclick = function () { revealNextHint(lead); };
  submitBtn.onclick = function () { submitTask(lead); };

  // Render the correct task type
  switch (task.type) {
    case 'theorySelect':   renderTheorySelect(lead, task);   break;
    case 'evidenceSelect': renderEvidenceSelect(lead, task); break;
    case 'suspectSelect':  renderSuspectSelect(lead, task);  break;
    case 'codeEntry':      renderCodeEntry(lead, task);      break;
    case 'caseReport':     renderCaseReport(lead, task);     break;
  }
}

function renderClosedTask(lead) {
  var section = document.getElementById('leadTaskSection');
  section.innerHTML =
    '<div class="task-feedback task-feedback--correct" style="display:block">' +
      '<strong>Finding recorded.</strong> ' + esc(lead.onComplete.finding) +
    '</div>';
}

/* ── Theory Select ────────────────────────────────────── */
function renderTheorySelect(lead, task) {
  var block = document.getElementById('task-theorySelect');
  block.hidden = false;

  document.getElementById('theoryPrompt').textContent = task.prompt;

  var saved = (S.leadSelections[lead.id] && S.leadSelections[lead.id]['theory']) || null;
  var optEl = document.getElementById('theoryOptions');
  optEl.innerHTML = '';

  task.options.forEach(function (opt) {
    var btn = document.createElement('button');
    btn.className = 'task-option' + (saved === opt.id ? ' task-option--selected' : '');
    btn.setAttribute('data-opt-id', opt.id);
    btn.innerHTML =
      '<span class="task-option-marker"></span>' +
      '<span class="task-option-text">' + esc(opt.text) + '</span>';

    btn.addEventListener('click', function () {
      optEl.querySelectorAll('.task-option').forEach(function (b) {
        b.classList.remove('task-option--selected');
      });
      btn.classList.add('task-option--selected');
      saveSelection(lead.id, 'theory', opt.id);
    });

    optEl.appendChild(btn);
  });
}

/* ── Evidence Select ──────────────────────────────────── */
function renderEvidenceSelect(lead, task) {
  var block = document.getElementById('task-evidenceSelect');
  block.hidden = false;

  document.getElementById('evidenceSelectPrompt').textContent = task.prompt;

  var saved   = (S.leadSelections[lead.id] && S.leadSelections[lead.id]['evselect']) || [];
  var optEl   = document.getElementById('evidenceSelectOptions');
  optEl.innerHTML = '';

  task.options.forEach(function (opt) {
    var btn = document.createElement('button');
    btn.className = 'task-option task-option--checkbox' +
      (saved.includes(opt.id) ? ' task-option--selected' : '');
    btn.setAttribute('data-opt-id', opt.id);
    btn.innerHTML =
      '<span class="task-option-marker"></span>' +
      '<span class="task-option-text">' + esc(opt.text) + '</span>';

    btn.addEventListener('click', function () {
      var maxSel = task.maxSelect || 999;
      var isSel  = btn.classList.contains('task-option--selected');

      if (isSel) {
        btn.classList.remove('task-option--selected');
      } else {
        var currentSel = optEl.querySelectorAll('.task-option--selected').length;
        if (currentSel >= maxSel) {
          // Deselect oldest if at max
          optEl.querySelector('.task-option--selected').classList.remove('task-option--selected');
        }
        btn.classList.add('task-option--selected');
      }

      var newSel = Array.from(optEl.querySelectorAll('.task-option--selected'))
        .map(function (b) { return b.getAttribute('data-opt-id'); });
      saveSelection(lead.id, 'evselect', newSel);
    });

    optEl.appendChild(btn);
  });
}

/* ── Suspect Select ───────────────────────────────────── */
function renderSuspectSelect(lead, task) {
  var block = document.getElementById('task-suspectSelect');
  block.hidden = false;

  document.getElementById('suspectSelectPrompt').textContent = task.prompt || 'Who is responsible?';

  var saved = (S.leadSelections[lead.id] && S.leadSelections[lead.id]['suspect']) || null;
  var optEl = document.getElementById('suspectSelectOptions');
  optEl.innerHTML = '';

  var revealed = C.people.filter(function (p) {
    return S.revealedPeople.includes(p.id);
  });

  revealed.forEach(function (person) {
    var btn = document.createElement('button');
    btn.className = 'task-option' + (saved === person.id ? ' task-option--selected' : '');
    btn.setAttribute('data-opt-id', person.id);
    btn.innerHTML =
      '<span class="task-option-marker"></span>' +
      '<span class="task-option-text">' + esc(person.name) + ' — ' + esc(person.role) + '</span>';

    btn.addEventListener('click', function () {
      optEl.querySelectorAll('.task-option').forEach(function (b) {
        b.classList.remove('task-option--selected');
      });
      btn.classList.add('task-option--selected');
      saveSelection(lead.id, 'suspect', person.id);
    });

    optEl.appendChild(btn);
  });
}

/* ── Code Entry ───────────────────────────────────────── */
function renderCodeEntry(lead, task) {
  var block = document.getElementById('task-codeEntry');
  block.hidden = false;

  document.getElementById('codeEntryPrompt').textContent = task.prompt || 'Enter the authorization code.';

  var input = document.getElementById('codeEntryInput');
  var saved = (S.leadSelections[lead.id] && S.leadSelections[lead.id]['code']) || '';
  input.value = saved;

  input.oninput = function () {
    saveSelection(lead.id, 'code', input.value.trim());
  };

  input.onkeydown = function (e) {
    if (e.key === 'Enter') submitTask(lead);
  };
}

/* ── Case Report (multi-field, Lead 10) ───────────────── */
function renderCaseReport(lead, task) {
  var block = document.getElementById('task-caseReport');
  block.hidden = false;

  document.getElementById('caseReportPrompt').textContent = task.prompt;

  var fieldsEl = document.getElementById('caseReportFields');
  fieldsEl.innerHTML = '';

  task.fields.forEach(function (field) {
    var saved = (S.leadSelections[lead.id] && S.leadSelections[lead.id][field.id]) || null;
    var wrap  = document.createElement('div');
    wrap.className = 'task-report-field';

    var label = document.createElement('div');
    label.className = 'task-report-field-label';
    label.textContent = field.label;
    wrap.appendChild(label);

    if (field.type === 'codeEntry') {
      var input = document.createElement('input');
      input.type        = 'text';
      input.className   = 'task-code-input';
      input.placeholder = 'Enter code';
      input.value       = saved || '';
      input.style.marginTop = '6px';
      input.autocomplete    = 'off';
      input.oninput = function () {
        saveSelection(lead.id, field.id, input.value.trim());
      };
      input.onkeydown = function (e) {
        if (e.key === 'Enter') submitTask(lead);
      };
      wrap.appendChild(input);

    } else if (field.type === 'theorySelect' || field.type === 'suspectSelect') {
      var optEl = document.createElement('div');
      optEl.className = 'task-options';
      optEl.style.marginTop = '6px';

      var options = field.options || [];

      if (field.type === 'suspectSelect') {
        options = C.people
          .filter(function (p) { return S.revealedPeople.includes(p.id); })
          .map(function (p) { return { id: p.id, text: p.name + ' — ' + p.role }; });
      }

      options.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.className = 'task-option' + (saved === opt.id ? ' task-option--selected' : '');
        btn.setAttribute('data-opt-id', opt.id);
        btn.innerHTML =
          '<span class="task-option-marker"></span>' +
          '<span class="task-option-text">' + esc(opt.text) + '</span>';

        btn.addEventListener('click', function () {
          optEl.querySelectorAll('.task-option').forEach(function (b) {
            b.classList.remove('task-option--selected');
          });
          btn.classList.add('task-option--selected');
          saveSelection(lead.id, field.id, opt.id);
        });

        optEl.appendChild(btn);
      });

      wrap.appendChild(optEl);
    }

    fieldsEl.appendChild(wrap);
  });
}


/* ═══════════════════════════════════════════════════════
   TASK SUBMISSION
   ═══════════════════════════════════════════════════════ */
function submitTask(lead) {
  var task     = lead.unlockTask;
  var feedback = document.getElementById('taskFeedback');
  var correct  = false;

  switch (task.type) {
    case 'theorySelect':
      correct = checkTheory(lead, task);
      break;
    case 'evidenceSelect':
      correct = checkEvidenceSelect(lead, task);
      break;
    case 'suspectSelect':
      correct = checkSuspectSelect(lead, task);
      break;
    case 'codeEntry':
      correct = checkCode(lead, task);
      break;
    case 'caseReport':
      correct = checkCaseReport(lead, task);
      break;
  }

  if (correct) {
    onLeadComplete(lead);
  } else {
    feedback.hidden = false;
    feedback.className = 'task-feedback task-feedback--incorrect';
    feedback.textContent = 'That\'s not quite right. Review the evidence and try again — or request a hint.';
  }
}

function checkTheory(lead, task) {
  var sel = S.leadSelections[lead.id] && S.leadSelections[lead.id]['theory'];
  return sel && task.correct.includes(sel);
}

function checkEvidenceSelect(lead, task) {
  var sel = (S.leadSelections[lead.id] && S.leadSelections[lead.id]['evselect']) || [];
  if (sel.length !== task.correct.length) return false;
  return task.correct.every(function (id) { return sel.includes(id); });
}

function checkSuspectSelect(lead, task) {
  var sel = S.leadSelections[lead.id] && S.leadSelections[lead.id]['suspect'];
  return sel && task.correct.includes(sel);
}

function checkCode(lead, task) {
  var val = (S.leadSelections[lead.id] && S.leadSelections[lead.id]['code']) || '';
  return task.acceptedAnswers.some(function (a) {
    return a.toLowerCase() === val.toLowerCase().trim();
  });
}

function checkCaseReport(lead, task) {
  return task.fields.every(function (field) {
    var val = (S.leadSelections[lead.id] && S.leadSelections[lead.id][field.id]) || '';

    if (field.type === 'codeEntry') {
      return field.acceptedAnswers.some(function (a) {
        return a.toLowerCase() === val.toString().toLowerCase().trim();
      });
    } else {
      return field.acceptedAnswers.includes(val);
    }
  });
}


/* ═══════════════════════════════════════════════════════
   LEAD COMPLETE — unlock chain
   ═══════════════════════════════════════════════════════ */
function onLeadComplete(lead) {
  var oc = lead.onComplete;

  // Close lead
  S.leadStates[lead.id] = 'closed';

  // Record finding
  if (oc.finding && !S.findings.includes(oc.finding)) {
    S.findings.push(oc.finding);
  }

  // Unlock evidence
  (oc.unlockEvidence || []).forEach(function (id) { unlockEvidence(id); });

  // Unlock leads
  (oc.unlockLeads || []).forEach(function (id) {
    if (S.leadStates[id] === 'locked') {
      S.leadStates[id] = 'active';
    }
  });

  // Reveal people
  (oc.revealPeople || []).forEach(function (id) {
    if (!S.revealedPeople.includes(id)) {
      S.revealedPeople.push(id);
    }
  });

  save();

  // Show correct feedback in detail view
  var feedback = document.getElementById('taskFeedback');
  if (feedback) {
    feedback.hidden    = false;
    feedback.className = 'task-feedback task-feedback--correct';
    feedback.textContent = 'Finding recorded: ' + oc.finding;
  }

  // Disable submit
  document.getElementById('taskSubmitBtn').disabled = true;
  document.getElementById('taskHintBtn').disabled   = true;

  // Toast
  toast('Finding recorded', 'finding');

  // Announce new leads/evidence
  var newLeads = (oc.unlockLeads || []).filter(function (id) {
    return S.leadStates[id] === 'active';
  });
  if (newLeads.length > 0) {
    setTimeout(function () {
      toast(newLeads.length + ' new lead' + (newLeads.length > 1 ? 's' : '') + ' opened', 'unlock');
    }, 800);
  }

  // Trigger solution if final lead
  if (oc.triggerSolution) {
    setTimeout(function () {
      triggerSolution();
    }, 2200);
  }
}

function unlockEvidence(id, silent) {
  if (!S.unlockedEvidence.includes(id)) {
    S.unlockedEvidence.push(id);
    if (!silent) toast('Evidence unlocked: ' + getEvName(id), 'unlock');
  }
}

function getEvName(id) {
  var ev = C.evidence.find(function (e) { return e.id === id; });
  return ev ? ev.name : id;
}


/* ═══════════════════════════════════════════════════════
   HINTS
   ═══════════════════════════════════════════════════════ */
function revealNextHint(lead) {
  var task  = lead.unlockTask;
  var hints = task.hints || [];
  var used  = S.hintsUsed[lead.id] || 0;

  if (used >= hints.length) return;

  S.hintsUsed[lead.id] = used + 1;
  save();

  showHints(lead);

  var hintBtn = document.getElementById('taskHintBtn');
  if (S.hintsUsed[lead.id] >= hints.length) {
    hintBtn.disabled = true;
  }
}

function showHints(lead) {
  var task     = lead.unlockTask;
  var hints    = task.hints || [];
  var used     = S.hintsUsed[lead.id] || 0;
  var el       = document.getElementById('taskHints');
  var inner    = document.getElementById('taskHintsInner');

  if (used === 0) { el.hidden = true; return; }

  el.hidden    = false;
  inner.innerHTML = hints.slice(0, used).map(function (h, i) {
    return '<div class="task-hint-item">' +
      '<span class="task-hint-num">HINT ' + (i + 1) + '</span>' +
      esc(h) +
    '</div>';
  }).join('');
}


/* ═══════════════════════════════════════════════════════
   EVIDENCE VIEWER
   ═══════════════════════════════════════════════════════ */
function openEvidence(id) {
  var ev = C.evidence.find(function (e) { return e.id === id; });
  if (!ev) return;

  // Mark viewed
  if (!S.viewedEvidence.includes(id)) {
    S.viewedEvidence.push(id);
    save();
  }

  if (ev.type === 'audio') {
    playAudio(ev);
    return;
  }

  if (!ev.file) return;

  var overlay = document.getElementById('modalOverlay');
  var title   = document.getElementById('modalTitle');
  var iframe  = document.getElementById('modalIframe');

  title.textContent  = ev.id.toUpperCase() + ' — ' + ev.name;
  iframe.src         = ev.file;
  overlay.hidden     = false;

  // Refresh evidence cards to update NEW/VIEWED state
  if (document.getElementById('view-board') && !document.getElementById('view-board').hidden) {
    renderEvidenceLocker();
  }
  if (activeLead) {
    renderLeadEvidence(activeLead);
  }
}

function bindModals() {
  document.getElementById('modalClose').addEventListener('click', function () {
    document.getElementById('modalOverlay').hidden = true;
    document.getElementById('modalIframe').src     = '';
  });

  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === this) {
      this.hidden = true;
      document.getElementById('modalIframe').src = '';
    }
  });

  document.getElementById('personModalClose').addEventListener('click', function () {
    document.getElementById('personModalOverlay').hidden = true;
  });

  document.getElementById('personModalOverlay').addEventListener('click', function (e) {
    if (e.target === this) this.hidden = true;
  });

  // Lead nav back button
  document.getElementById('leadNavBack').addEventListener('click', function () {
    showBoardView();
  });

  bindMenu();
}


/* ═══════════════════════════════════════════════════════
   PERSON MODAL
   ═══════════════════════════════════════════════════════ */
function openPersonModal(personId) {
  var person  = C.people.find(function (p) { return p.id === personId; });
  var profile = C.characterProfiles && C.characterProfiles[personId];
  if (!person || !profile) return;

  var overlay = document.getElementById('personModalOverlay');
  var title   = document.getElementById('personModalTitle');
  var body    = document.getElementById('personModalBody');

  title.textContent = 'Personnel File — ' + person.name;

  var photoHtml = person.photo
    ? '<img src="' + person.photo + '" alt="' + esc(person.name) + '">'
    : '👤';

  var infoRows = (profile.basicInfo || []).map(function (r) {
    return '<div class="person-profile-info-row">' +
      '<span class="person-profile-info-label">' + esc(r.label) + '</span>' +
      '<span class="person-profile-info-value">' + esc(r.value) + '</span>' +
    '</div>';
  }).join('');

  // Statement — show only if required evidence is unlocked
  var statementHtml = '';
  if (profile.statement) {
    var req = profile.statement.requiresEvidence;
    var show = !req || S.unlockedEvidence.includes(req) || S.viewedEvidence.includes(req);
    if (show) {
      statementHtml =
        '<div class="person-profile-section">' +
          '<div class="person-profile-section-label">Statement on Record</div>' +
          '<div class="person-profile-quote">' +
            esc(profile.statement.quote) +
            '<span class="person-profile-quote-source">' + esc(profile.statement.source) + '</span>' +
          '</div>' +
        '</div>';
    }
  }

  // Evidence links — only unlocked ones
  var evLinks = (profile.evidenceLinks || [])
    .filter(function (link) { return S.unlockedEvidence.includes(link.evidenceId); })
    .map(function (link) {
      var ev = C.evidence.find(function (e) { return e.id === link.evidenceId; });
      return '<div class="person-profile-ev-link" data-ev-id="' + link.evidenceId + '">' +
        '<span>' + (ev ? ev.icon : '📋') + '</span>' +
        '<span>' +
          '<div class="person-profile-ev-name">' + esc(ev ? ev.name : link.evidenceId) + '</div>' +
          '<div class="person-profile-ev-desc">'  + esc(link.desc || '') + '</div>' +
        '</span>' +
      '</div>';
    }).join('');

  // Social links
  var socialHtml = (profile.socialLinks || []).map(function (link) {
    return '<a class="person-profile-social-btn" href="' + link.url + '" target="_blank">' +
      '<span>' + link.icon + '</span>' +
      '<span>' +
        '<div class="person-profile-social-label">' + esc(link.label) + '</div>' +
        '<div class="person-profile-social-sub">'   + esc(link.sublabel) + '</div>' +
      '</span>' +
      '<span class="person-profile-social-arrow">OPEN →</span>' +
    '</a>';
  }).join('');

  body.innerHTML =
    '<div class="person-profile">' +
      '<div class="person-profile-header">' +
        '<div class="person-profile-photo">' + photoHtml + '</div>' +
        '<div>' +
          '<div class="person-profile-name">' + esc(person.name) + '</div>' +
          '<div class="person-profile-role">' + esc(person.role) + '</div>' +
          '<div class="person-profile-fileid">' + esc(profile.fileId || '') + ' · CASE ' + C.caseId + '</div>' +
        '</div>' +
      '</div>' +
      (infoRows ? '<div class="person-profile-section"><div class="person-profile-section-label">Basic Information</div>' + infoRows + '</div>' : '') +
      '<div class="person-profile-section"><div class="person-profile-section-label">Case File Summary</div><p class="person-profile-summary">' + esc(profile.summary) + '</p></div>' +
      statementHtml +
      (evLinks ? '<div class="person-profile-section"><div class="person-profile-section-label">Associated Evidence</div>' + evLinks + '</div>' : '') +
      (socialHtml ? '<div class="person-profile-section"><div class="person-profile-section-label">Online Profiles</div>' + socialHtml + '</div>' : '') +
    '</div>';

  // Bind evidence links inside modal
  body.querySelectorAll('[data-ev-id]').forEach(function (el) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () {
      openEvidence(el.getAttribute('data-ev-id'));
    });
  });

  overlay.hidden = false;
}


/* ═══════════════════════════════════════════════════════
   AUDIO PLAYER
   ═══════════════════════════════════════════════════════ */
function bindAudio() {
  audio.el = document.getElementById('audioEl');

  document.getElementById('audioPlay').addEventListener('click', function () {
    if (audio.playing) {
      audio.el.pause();
    } else {
      audio.el.play();
    }
  });

  document.getElementById('audioRewind').addEventListener('click', function () {
    audio.el.currentTime = Math.max(0, audio.el.currentTime - 10);
  });

  document.getElementById('audioFwd').addEventListener('click', function () {
    audio.el.currentTime = Math.min(audio.el.duration || 0, audio.el.currentTime + 10);
  });

  document.getElementById('audioClose').addEventListener('click', function () {
    audio.el.pause();
    audio.el.src = '';
    document.getElementById('audioPlayer').hidden = true;
    audio.playing   = false;
    audio.currentId = null;
  });

  document.getElementById('audioProgressBar').addEventListener('click', function (e) {
    if (!audio.el.duration) return;
    var rect = this.getBoundingClientRect();
    var pct  = (e.clientX - rect.left) / rect.width;
    audio.el.currentTime = pct * audio.el.duration;
  });

  audio.el.addEventListener('play',  function () {
    audio.playing = true;
    document.getElementById('audioPlay').textContent = '⏸';
  });

  audio.el.addEventListener('pause', function () {
    audio.playing = false;
    document.getElementById('audioPlay').textContent = '▶';
  });

  audio.el.addEventListener('ended', function () {
    audio.playing = false;
    document.getElementById('audioPlay').textContent = '▶';
  });

  audio.el.addEventListener('timeupdate', function () {
    if (!audio.el.duration) return;
    var pct = (audio.el.currentTime / audio.el.duration) * 100;
    document.getElementById('audioProgressFill').style.width = pct + '%';
    document.getElementById('audioTime').textContent =
      formatTime(audio.el.currentTime) + ' / ' + formatTime(audio.el.duration);
  });
}

function playAudio(ev) {
  var player = document.getElementById('audioPlayer');

  if (audio.currentId === ev.id && audio.playing) {
    audio.el.pause();
    return;
  }

  audio.currentId = ev.id;
  audio.el.src    = ev.file;
  audio.el.play();

  document.getElementById('audioLabel').textContent = ev.name;
  document.getElementById('audioMeta').textContent  = ev.description || '';
  player.hidden = false;
}

function formatTime(s) {
  if (isNaN(s)) return '0:00';
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}


/* ═══════════════════════════════════════════════════════
   SOLUTION / REVEAL
   ═══════════════════════════════════════════════════════ */
function triggerSolution() {
  S.caseSolved  = true;
  S.solvedDate  = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  save();

  showScreen('screen-reveal');
  renderReveal();
}

function renderReveal() {
  var sol = C.solution;

  document.getElementById('revealTitle').textContent    = C.title;
  document.getElementById('revealCaseId').textContent   = 'Case ' + C.caseId + ' — ' + C.setting;
  document.getElementById('revealSolvedBy').textContent =
    'Closed by Detective ' + formatDetectiveNames() + ' — ' + (S.solvedDate || '');
  document.getElementById('revealCaseRef').textContent  =
    'FILE: ' + C.caseId + ' / STATUS: CLOSED';

  document.getElementById('revealStory').textContent    = sol.revealStory;

  // Findings
  var findingsEl = document.getElementById('revealFindings');
  findingsEl.innerHTML = S.findings.map(function (f) {
    return '<li>' + esc(f) + '</li>';
  }).join('');

  // Character fates
  var fatesEl = document.getElementById('revealFates');
  fatesEl.innerHTML = (sol.characterFates || []).map(function (fate) {
    var person = C.people.find(function (p) { return p.id === fate.personId; });
    return '<div class="reveal-fate-row">' +
      '<span class="reveal-fate-name">' + esc(person ? person.name : fate.personId) + '</span>' +
      '<span class="reveal-fate-text">'  + esc(fate.fate) + '</span>' +
    '</div>';
  }).join('');
}


/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
function toast(msg, type) {
  var container = document.getElementById('toastContainer');
  var el        = document.createElement('div');
  el.className  = 'toast toast--' + (type || 'info');
  el.textContent = msg;
  container.appendChild(el);

  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      el.classList.add('visible');
    });
  });

  setTimeout(function () {
    el.classList.remove('visible');
    setTimeout(function () { el.remove(); }, 300);
  }, 3000);
}


/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDetectiveNames() {
  if (!S.detectives || S.detectives.length === 0) return 'Detective';
  if (S.detectives.length === 1) return S.detectives[0];
  if (S.detectives.length === 2) return S.detectives[0] + ' & ' + S.detectives[1];
  return S.detectives.slice(0, -1).join(', ') + ' & ' + S.detectives[S.detectives.length - 1];
}

function saveSelection(leadId, key, value) {
  if (!S.leadSelections[leadId]) S.leadSelections[leadId] = {};
  S.leadSelections[leadId][key] = value;
  save();
}


function bindMenu() {
  var menuBtn      = document.getElementById('hubMenuBtn');
  var menuDropdown = document.getElementById('hubMenuDropdown');
  var resetBtn     = document.getElementById('hubResetBtn');

  menuBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    menuDropdown.hidden = !menuDropdown.hidden;
  });

  // Close when clicking anywhere else
  document.addEventListener('click', function () {
    menuDropdown.hidden = true;
  });

  resetBtn.addEventListener('click', function () {
    if (confirm('Reset the game? All progress will be lost and cannot be recovered.')) {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  });
}