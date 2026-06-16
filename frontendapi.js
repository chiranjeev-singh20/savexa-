/* ============================================================
   FAidLens — frontendapi.js
   App orchestration, mock AI inference, chatbot, screen routing
   All existing function/ID contracts preserved.
   ============================================================ */
(function () {
  const { $, $$, toast, delay, smoothScroll } = window.AidUtils;
  const API_BASE_URL = 'http://127.0.0.1:8000/api';
  let selectedImageFile = null;
  const severityClassMap = {
    low: 'sev-low',
    moderate: 'sev-mid',
    high: 'sev-hi',
    critical: 'sev-hi',
  };

  function dataURLToFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  }

  async function detectInjuryFromFile(file) {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`${API_BASE_URL}/detect/`, {
      method: 'POST',
      body: formData,
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || 'Detection failed');
    }

    return json;
  }

  /* ── INJURY DATABASE (unchanged from original) ─────────────── */
  const INJURIES = [
    {
      type: '2nd-degree burn', region: 'Forearm', severity: 'Moderate', sevClass: 'sev-mid',
      confidence: 92,
      summary: 'Partial-thickness burn affecting the epidermis and dermis. Blistering likely.',
      steps: [
        { t: 'Cool the burn', d: 'Run cool (not cold) water over the area for 10–15 minutes.', x: 'Avoid ice — it can damage tissue. A cool wet cloth works if no running water is available.' },
        { t: 'Remove tight items', d: 'Gently take off jewelry or clothing near the burn before swelling starts.', x: 'Do not pull anything stuck to the burn.' },
        { t: 'Cover loosely', d: 'Use a sterile non-stick dressing or clean cloth.', x: 'Do not apply butter, toothpaste, or ointments.' },
        { t: 'Pain relief', d: 'Take an over-the-counter pain reliever if appropriate.', x: 'Consider acetaminophen or ibuprofen as directed.' },
        { t: 'Seek care if needed', d: 'See a clinician if larger than 3 inches, on face/joints, or shows infection.', x: 'Signs of infection: increased pain, redness, swelling, fever, or pus.' }
      ]
    },
    {
      type: 'Laceration', region: 'Index finger', severity: 'Minor', sevClass: 'sev-low',
      confidence: 88,
      summary: 'Shallow cut with controlled bleeding. No visible tendon involvement.',
      steps: [
        { t: 'Apply pressure', d: 'Press a clean cloth firmly for 5–10 minutes.', x: 'Elevate above the heart to reduce bleeding.' },
        { t: 'Rinse the wound', d: 'Use clean running water; remove debris gently.', x: 'Avoid hydrogen peroxide on open wounds.' },
        { t: 'Apply antiseptic', d: 'Thin layer of antibiotic ointment if available.', x: '' },
        { t: 'Bandage', d: 'Cover with a sterile adhesive bandage.', x: 'Change daily or when wet.' },
        { t: 'Watch for infection', d: 'Redness, warmth, pus, or fever — see a clinician.', x: '' }
      ]
    },
    {
      type: 'Sprain', region: 'Ankle', severity: 'Moderate', sevClass: 'sev-mid',
      confidence: 85,
      summary: 'Ligament strain with swelling. Weight-bearing limited.',
      steps: [
        { t: 'Rest', d: 'Avoid putting weight on the joint.', x: '' },
        { t: 'Ice', d: 'Apply ice 15–20 min every 2–3 hours for the first 48h.', x: 'Wrap ice in a towel.' },
        { t: 'Compress', d: 'Use an elastic bandage — snug, not tight.', x: 'Loosen if toes turn pale or numb.' },
        { t: 'Elevate', d: 'Raise the ankle above heart level when possible.', x: '' },
        { t: 'Reassess', d: 'See a clinician if no improvement in 48–72h.', x: '' }
      ]
    },
    {
      type: 'Abrasion', region: 'Knee', severity: 'Minor', sevClass: 'sev-low',
      confidence: 94,
      summary: 'Surface scrape with mild bleeding. Skin layers superficially affected.',
      steps: [
        { t: 'Clean gently', d: 'Rinse with clean water to remove dirt.', x: '' },
        { t: 'Pat dry', d: 'Use a clean cloth — do not rub.', x: '' },
        { t: 'Antibiotic ointment', d: 'Apply a thin layer.', x: '' },
        { t: 'Cover', d: 'Use a non-stick bandage.', x: '' },
        { t: 'Monitor', d: 'Replace bandage daily; watch for infection.', x: '' }
      ]
    },
    {
      type: 'Severe bleeding', region: 'Lower leg', severity: 'Severe', sevClass: 'sev-hi',
      confidence: 96,
      summary: 'Heavy bleeding requiring immediate intervention. Consider emergency services.',
      steps: [
        { t: 'Call 911', d: 'Get emergency help immediately.', x: '' },
        { t: 'Apply firm pressure', d: 'Press hard with cloth or hands.', x: 'Do not remove soaked cloth — add more on top.' },
        { t: 'Elevate', d: 'Raise the limb above the heart if no fracture suspected.', x: '' },
        { t: 'Tourniquet (last resort)', d: 'Only if bleeding cannot be controlled.', x: 'Note the time of application.' },
        { t: 'Monitor for shock', d: 'Pale, cold, rapid breathing — keep them warm and still.', x: '' }
      ]
    }
  ];

  const PHASES = ['Region detection', 'Tissue classification', 'Severity scoring', 'Generating guidance'];
  let lastDiag = null;
  let sessionStart = null;
  let sessionEvents = [];

  /* ── SCREEN ROUTING ────────────────────────────────────────── */
  function showScanScreen() {
    $('#screenHome').hidden = true;
    $('#screenScan').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Start camera automatically
    dismissBanner();
  }

  function showHomeScreen() {
    $('#screenHome').hidden = false;
    $('#screenScan').hidden = true;
    window.AidCamera.stop();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── BIND NAVIGATION ───────────────────────────────────────── */
  function bindNav() {
    // START EMERGENCY → open method choice modal
    $('#heroEmergencyBtn')?.addEventListener('click', () => {
      $('#emergencyMethodModal').hidden = false;
    });

    // CTA buttons on landing
    $('#ctaStartBtn')?.addEventListener('click', () => {
      $('#emergencyMethodModal').hidden = false;
    });

    // Back button on scan screen
    $('#btnBackHome')?.addEventListener('click', showHomeScreen);

    // Nav SOS
    $('#navSosBtn')?.addEventListener('click', openSos);
    // Single SOS FAB
    $('#sosFab')?.addEventListener('click', openSos);
  }

  /* ── CAMERA CONTROLS ────────────────────────────────────────── */
  function bindCamera() {
    $('#btnStartCam')?.addEventListener('click', () => {
      dismissBanner();
      window.AidCamera.start();
    });
    $('#btnStopCam')?.addEventListener('click', () => window.AidCamera.stop());
    $('#btnDemo')?.addEventListener('click', () => {
      dismissBanner();
      selectedImageFile = null;
      runAnalysis();
    });
    $('#btnCapture')?.addEventListener('click', async () => {
      dismissBanner();
      const dataUrl = window.AidCamera.captureFrame();
      if (!dataUrl) {
        toast('Unable to capture image. Try again.', 'error');
        return;
      }
      const file = dataURLToFile(dataUrl, 'capture.jpg');
      selectedImageFile = file;
      await runAnalysis(file);
    });
    $('#btnRescan')?.addEventListener('click', () => runAnalysis(selectedImageFile));
    $('#btnGuide')?.addEventListener('click', () => {
      const g = $('#guidance');
      g.hidden = false;
      smoothScroll('guidance');
    });
    $('#emgDismiss')?.addEventListener('click', dismissBanner);

    // File upload handler
    $('#fileUploadInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      selectedImageFile = file;
      dismissBanner();
      toast('Image loaded — analyzing…', 'info', 1600);
      await runAnalysis(file);
    });
  }

  function dismissBanner() {
    $('#emergencyBanner')?.classList.add('dismissed');
  }

  /* ── ANALYSIS ENGINE ────────────────────────────────────────── */
  async function runAnalysis(file = null) {
    const veil     = $('#analyzeVeil');
    const titleEl  = $('#analyzeTitle');
    const subEl    = $('#analyzeSub');
    const bar      = $('#analyzeBarFill');
    if (!veil) return;

    veil.hidden = false;
    titleEl.textContent = 'Analyzing image…';
    bar.style.width = '0%';

    for (let i = 0; i < PHASES.length; i++) {
      subEl.textContent = PHASES[i];
      bar.style.width = `${((i + 1) / PHASES.length) * 100}%`;
      await delay(520 + Math.random() * 380);
    }

    let diag;
    if (file) {
      try {
        const result = await detectInjuryFromFile(file);
        const guidance = result.guidance || {};
        diag = {
          type: result.injury_type || 'Unknown injury',
          region: result.region || 'Not specified',
          severity: result.severity ? `${result.severity.charAt(0).toUpperCase()}${result.severity.slice(1)}` : 'Unknown',
          sevClass: severityClassMap[result.severity] || 'sev-low',
          confidence: Math.round((result.confidence ?? 0) * 100) / 100,
          summary: guidance.summary || 'No guidance available.',
          steps: guidance.steps || [],
        };
        if (!diag.steps.length) {
          diag.steps = [{ t: 'No guidance available', d: 'No steps were returned from the backend.', x: '' }];
        }
      } catch (err) {
        console.warn('Backend detection failed:', err);
        toast('Backend detection failed. Using local fallback.', 'warn', 2800);
        diag = INJURIES[Math.floor(Math.random() * INJURIES.length)];
      }
    } else {
      diag = INJURIES[Math.floor(Math.random() * INJURIES.length)];
    }

    veil.hidden = true;
    lastDiag = diag;
    sessionStart = sessionStart || new Date();
    sessionEvents = [{ label: 'Session started', time: sessionStart, dot: 'active' }];

    renderDiagnosis(diag);
    renderGuidance(diag);
    updateScanOverlayHeader(diag);
    toast(`Detected: ${diag.type}`, 'success');
  }

  /* ── SCAN OVERLAY HEADER ────────────────────────────────────── */
  function updateScanOverlayHeader(d) {
    const header = $('#scanOverlayHeader');
    if (!header) return;
    header.hidden = false;
    const injEl  = $('#sovInjuryType');
    const sevEl  = $('#sovSeverity');
    const confEl = $('#sovConfidence');
    if (injEl)  injEl.textContent = d.type;
    if (sevEl)  { sevEl.textContent = d.severity; sevEl.className = `sev ${d.sevClass}`; }
    if (confEl) confEl.textContent = `${d.confidence}% confidence`;
  }

  /* ── RENDER DIAGNOSIS ───────────────────────────────────────── */
  function renderDiagnosis(d) {
    $('#panelSub').textContent = `Analysis complete · ${new Date().toLocaleTimeString()}`;
    const ring = $('#confRing');
    const num  = $('#confNum');
    let p = 0;
    const tick = setInterval(() => {
      p += 2;
      if (p >= d.confidence) { p = d.confidence; clearInterval(tick); }
      ring.style.setProperty('--p', p);
      num.innerHTML = `${p}<span>%</span>`;
    }, 16);

    $('#diagCard').innerHTML = `
      <div class="diag-row"><span>Injury</span><b>${d.type}</b></div>
      <div class="diag-row"><span>Region</span><b>${d.region}</b></div>
      <div class="diag-row"><span>Severity</span><span class="sev ${d.sevClass}">${d.severity}</span></div>
      <div class="diag-row" style="display:block">
        <span style="display:block;margin-bottom:6px">Summary</span>
        <b style="font-weight:500;color:var(--text-dim);font-size:13.5px;line-height:1.55">${d.summary}</b>
      </div>
    `;
    $('#diagActions').hidden = false;

    // Log session event
    sessionEvents.push({ label: `Injury detected: ${d.type}`, time: new Date(), dot: 'active' });
    sessionEvents.push({ label: `Severity: ${d.severity}`, time: new Date(), dot: d.sevClass === 'sev-hi' ? 'bad' : d.sevClass === 'sev-mid' ? 'warn' : 'done' });
    updateSummaryTimeline();
  }

  /* ── RENDER GUIDANCE ────────────────────────────────────────── */
  function renderGuidance(d) {
    $('#guideTitle').textContent = `Guidance for ${d.type}`;
    $('#guideSub').textContent = `${d.region} · ${d.severity} severity · ${d.steps.length} steps`;

    VoiceGuide.stop();

    const wrap = $('#guideSteps');
    wrap.innerHTML = `
      <div class="guide-progress">
        <div class="guide-progress-bar"><div class="guide-progress-fill" id="guideProgressFill"></div></div>
        <span class="guide-progress-label" id="guideProgressLabel">0 / ${d.steps.length} done</span>
      </div>
      ${d.steps.map((s, i) => `
        <div class="gstep" data-idx="${i}">
          <div class="gstep-num">${i + 1}</div>
          <div class="gstep-body">
            <div class="gstep-title">${s.t}</div>
            <div class="gstep-desc">${s.d}</div>
            ${s.x ? `<div class="gstep-detail">${s.x}</div>` : ''}
          </div>
          <div class="gstep-chev">›</div>
          <button class="gstep-done-btn" data-done="${i}" title="Mark as done">✓</button>
        </div>
      `).join('')}
    `;

    // Expand/collapse
    $$('.gstep', wrap).forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.gstep-done-btn')) return;
        el.classList.toggle('open');
      });
    });

    // Mark done
    $$('.gstep-done-btn', wrap).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx  = btn.dataset.done;
        const step = wrap.querySelector(`.gstep[data-idx="${idx}"]`);
        step.classList.toggle('done');
        updateProgress(d.steps.length, d.steps[idx]);
        if (step.classList.contains('done')) toast(`Step ${Number(idx) + 1} complete`, 'success', 1800);
      });
    });

    VoiceGuide.load(d.steps);
  }

  function updateProgress(total, stepObj) {
    const done = $$('.gstep.done').length;
    const pct  = Math.round((done / total) * 100);
    const fill = $('#guideProgressFill');
    const lbl  = $('#guideProgressLabel');
    if (fill) fill.style.width = pct + '%';
    if (lbl)  lbl.textContent = `${done} / ${total} done`;
    if (done === total) {
      toast('All steps complete! 🎉', 'success', 3500);
      // Show download summary button
      const dlBtn = $('#btnDownloadSummary');
      if (dlBtn) dlBtn.hidden = false;
    }
    // Update voice wave active state
    if (done > 0) $('#voiceWave')?.classList.add('active');

    // Add to session timeline
    if (stepObj) {
      sessionEvents.push({ label: `Step complete: ${stepObj.t}`, time: new Date(), dot: 'done' });
      updateSummaryTimeline();
    }
  }

  /* ── SESSION SUMMARY TIMELINE ───────────────────────────────── */
  function updateSummaryTimeline() {
    const tl = $('#summaryTimeline');
    if (!tl) return;
    tl.innerHTML = sessionEvents.map(ev => `
      <div class="sum-event">
        <div class="sum-dot ${ev.dot || ''}"></div>
        <div class="sum-text">
          <b>${ev.label}</b>
          <span>${formatTime(ev.time)}</span>
        </div>
      </div>
    `).join('');
  }

  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Download summary as plain text
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btnDownloadSummary') && lastDiag) {
      const lines = [
        'FAidLens — Session Report',
        `Generated: ${new Date().toLocaleString()}`,
        '---',
        `Injury: ${lastDiag.type}`,
        `Region: ${lastDiag.region}`,
        `Severity: ${lastDiag.severity}`,
        `Confidence: ${lastDiag.confidence}%`,
        '',
        'Steps completed:',
        ...$$('.gstep.done').map(el => `✓ ${el.querySelector('.gstep-title').textContent}`),
        '',
        'Session events:',
        ...sessionEvents.map(ev => `[${formatTime(ev.time)}] ${ev.label}`)
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'faidlens-report.txt';
      a.click(); URL.revokeObjectURL(url);
      toast('Report downloaded', 'success');
    }
  });

  /* ════════════════════════════════════════════
     VOICE GUIDE (SpeechSynthesis) — unchanged API
     ════════════════════════════════════════════ */
  const VoiceGuide = (function () {
    let steps = [], idx = 0, active = false, paused = false;

    function load(newSteps) { stop(); steps = newSteps; idx = 0; setStatus(''); }

    function play() {
      if (!steps.length) return;
      if (!window.speechSynthesis) { toast('Voice not supported in this browser', 'error'); return; }
      active = true; paused = false;
      showControls(true);
      $('#voiceWave')?.classList.add('active');
      readStep(idx);
    }

    function readStep(i) {
      if (!active || i >= steps.length) { finish(); return; }
      idx = i;
      window.speechSynthesis.cancel();
      const s   = steps[i];
      const txt = `Step ${i + 1}. ${s.t}. ${s.d}. ${s.x || ''}`;
      const utt = new SpeechSynthesisUtterance(txt);
      utt.rate  = parseFloat($('#voiceSpeed')?.value || '1');
      utt.lang  = 'en-US';

      $$('.gstep').forEach(el => el.classList.remove('speaking'));
      const el = $(`.gstep[data-idx="${i}"]`);
      if (el) { el.classList.add('speaking'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

      setStatus(`Speaking step ${i + 1} of ${steps.length}…`);
      utt.onend = () => { if (active && !paused) readStep(i + 1); };
      window.speechSynthesis.speak(utt);
    }

    function pause() {
      paused = true;
      window.speechSynthesis.pause();
      setStatus('Paused');
      $('#voicePlayBtn').hidden  = false;
      $('#voicePauseBtn').hidden = true;
      $('#voiceWave')?.classList.remove('active');
    }

    function resume() {
      paused = false;
      window.speechSynthesis.resume();
      $('#voicePlayBtn').hidden  = true;
      $('#voicePauseBtn').hidden = false;
      setStatus(`Speaking step ${idx + 1} of ${steps.length}…`);
      $('#voiceWave')?.classList.add('active');
    }

    function stop() {
      active = false; paused = false;
      window.speechSynthesis?.cancel();
      $$('.gstep').forEach(el => el.classList.remove('speaking'));
      showControls(false);
      setStatus('');
      $('#voiceWave')?.classList.remove('active');
    }

    function finish() {
      active = false;
      $$('.gstep').forEach(el => el.classList.remove('speaking'));
      showControls(false);
      setStatus('All steps read ✓');
      toast('Voice guidance complete', 'success', 2500);
      $('#voiceWave')?.classList.remove('active');
    }

    function showControls(on) {
      const play  = $('#voicePlayBtn');
      const pause = $('#voicePauseBtn');
      const stopB = $('#voiceStopBtn');
      if (!play) return;
      play.hidden  = on;
      pause.hidden = !on;
      stopB.hidden = !on;
    }

    function setStatus(msg) {
      const s = $('#voiceStatus');
      if (s) s.textContent = msg;
    }

    return { load, play, pause, resume, stop };
  })();

  /* ── VOICE TOOLBAR BINDINGS ─────────────────────────────────── */
  function bindVoice() {
    $('#voicePlayBtn')?.addEventListener('click', () => {
      if (window.speechSynthesis?.paused) VoiceGuide.resume();
      else VoiceGuide.play();
      $('#voicePlayBtn').hidden  = true;
      $('#voicePauseBtn').hidden = false;
      $('#voiceStopBtn').hidden  = false;
    });
    $('#voicePauseBtn')?.addEventListener('click', () => VoiceGuide.pause());
    $('#voiceStopBtn')?.addEventListener('click', () => VoiceGuide.stop());
  }

  /* ── SOS MODAL ───────────────────────────────────────────────── */
  function openSos()  { $('#sosModal').hidden = false; }
  function closeSos() { $('#sosModal').hidden = true; }

  function bindSos() {
    $$('[data-close]').forEach(el => el.addEventListener('click', closeSos));
    $('#sosConfirm')?.addEventListener('click', async () => {
      closeSos();
      toast('Locating you…', 'info', 1400);
      await delay(1400);
      toast('Alert sent to emergency contacts', 'success', 3500);
    });
    $('#guideSos')?.addEventListener('click', openSos);
  }

  /* ── EMERGENCY METHOD MODAL ─────────────────────────────────── */
  function bindEmergencyModal() {
    const modal = $('#emergencyMethodModal');
    if (!modal) return;

    // Close on backdrop or X
    $$('[data-close-emergency]').forEach(el => {
      el.addEventListener('click', () => { modal.hidden = true; });
    });

    // Upload option
    $('#emmUploadBtn')?.addEventListener('click', () => {
      modal.hidden = true;
      showScanScreen();
      setTimeout(() => $('#fileUploadInput')?.click(), 300);
    });

    // Camera option
    $('#emmCameraBtn')?.addEventListener('click', () => {
      modal.hidden = true;
      showScanScreen();
      setTimeout(() => window.AidCamera.start(), 300);
    });
  }

  /* ── CHATBOT ─────────────────────────────────────────────────── */
  const CHAT_KB = [
    { q: ['burn','burns','burning','scald'],
      a: '🔥 For burns: Run cool (not cold) water for 10–15 min. Remove jewelry near the burn. Cover loosely with a non-stick dressing. Do NOT apply ice, butter, or toothpaste. Seek care if the burn is large, on the face, or blistering severely.' },
    { q: ['bleed','bleeding','blood','hemorrhage'],
      a: '🩸 To stop bleeding: Apply firm direct pressure with a clean cloth for 5–10 min. Elevate the limb above the heart. Do not remove the cloth — add more on top. If bleeding is uncontrolled after 10 min, call 911 immediately.' },
    { q: ['ambulance','911','emergency','call help','dangerous','critical'],
      a: '🚑 Call an ambulance if: bleeding is uncontrolled, the person is unconscious, having trouble breathing, shows signs of shock (pale, cold, rapid breathing), or has a severe head/spinal injury. Do not hesitate — call first, then provide first aid.' },
    { q: ['hospital','nearest','closest','nearby','find hospital'],
      a: '📍 Scroll down to the Hospitals section on this page to see the 3 nearest facilities with real-time ETA. The closest is St. Mercy General (~1.2 km, ~5 min). Click "Route →" on any card for directions.' },
    { q: ['sprain','sprained','ankle','twist'],
      a: '🦶 RICE method for sprains: Rest (avoid weight), Ice (15–20 min, wrapped in cloth), Compress (elastic bandage, not too tight), Elevate (raise above heart). See a doctor if no improvement in 48–72h or if you cannot bear any weight.' },
    { q: ['cut','laceration','wound','gash'],
      a: '🩹 For cuts/lacerations: Apply pressure for 5–10 min. Rinse with clean water. Apply thin antibiotic ointment. Cover with a sterile bandage. Change daily. Get medical help if deep, won\'t stop bleeding, or shows infection signs.' },
    { q: ['step 2','explain step','what does step'],
      a: '📋 To see step details, tap on any step card in the guidance section — it expands with full instructions and clinical notes. You can also click "Read steps aloud" to have the AI read them to you.' },
    { q: ['fracture','broken','bone','break'],
      a: '🦴 Suspected fracture: Immobilize the area (do not try to straighten it). Apply ice wrapped in cloth. Elevate if possible. Call 911 or go to the ER. Do not give food/water in case surgery is needed.' },
    { q: ['shock'],
      a: '⚠️ Signs of shock: pale/cold/clammy skin, rapid weak pulse, fast breathing, confusion. Action: Lay person flat, raise legs 12 inches (unless head/spine injury). Keep warm with a blanket. Call 911. Do not give food or water.' },
    { q: ['cpr','chest compression','heart','cardiac'],
      a: '💓 CPR: Check responsiveness → Call 911 → Begin chest compressions (100–120/min, 2 inches deep, center of chest). Give rescue breaths if trained (30:2 ratio). Continue until help arrives or AED is available.' },
    { q: ['hello','hi','hey','help'],
      a: '👋 Hello! I\'m your FAidLens AI assistant. I can help with first aid guidance, explain steps, locate hospitals, or advise when to call emergency services. What do you need help with?' },
  ];

  function getChatResponse(input) {
    const lower = input.toLowerCase();
    for (const entry of CHAT_KB) {
      if (entry.q.some(kw => lower.includes(kw))) return entry.a;
    }
    return '🤔 I\'m not sure about that specific situation. For any serious or life-threatening emergency, please call 911 immediately. You can also try scanning your injury for AI-powered diagnosis, or ask me about specific injuries like burns, cuts, sprains, or bleeding.';
  }

  function openChat() {
    const modal = $('#chatModal');
    if (modal) modal.hidden = false;
  }

  function bindChat() {
    const fab   = $('#chatFab');
    const modal = $('#chatModal');
    const close = $('#chatClose');
    const input = $('#chatInput');
    const send  = $('#chatSend');
    const msgs  = $('#chatMessages');
    const mic   = $('#chatMic');
    if (!fab || !modal) return;

    fab.addEventListener('click', () => {
      modal.hidden = !modal.hidden;
    });
    close.addEventListener('click', () => { modal.hidden = true; });

    function addMessage(text, role) {
      const div = document.createElement('div');
      div.className = `chat-bubble ${role}`;
      div.textContent = text;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    async function sendMessage(text) {
      if (!text.trim()) return;
      addMessage(text, 'user');
      input.value = '';
      // Typing indicator
      const typing = document.createElement('div');
      typing.className = 'chat-bubble bot typing';
      typing.textContent = 'Thinking…';
      msgs.appendChild(typing);
      msgs.scrollTop = msgs.scrollHeight;
      await delay(700 + Math.random() * 500);
      typing.remove();
      addMessage(getChatResponse(text), 'bot');
    }

    send.addEventListener('click', () => sendMessage(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(input.value); });

    // Suggestion chips
    $$('.chat-suggest-btn', msgs).forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.dataset.q));
    });

    // Voice input via SpeechRecognition
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      let recog = null;
      mic.addEventListener('click', () => {
        if (mic.classList.contains('listening')) {
          recog?.stop();
          mic.classList.remove('listening');
          return;
        }
        recog = new SR();
        recog.lang = 'en-US';
        recog.interimResults = false;
        recog.onstart = () => mic.classList.add('listening');
        recog.onend   = () => mic.classList.remove('listening');
        recog.onresult = (e) => {
          const transcript = e.results[0][0].transcript;
          input.value = transcript;
          sendMessage(transcript);
        };
        recog.start();
      });
    } else {
      mic.title = 'Voice input not supported in this browser';
      mic.style.opacity = '0.4';
    }
  }

  /* ── INIT ───────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    bindNav();
    bindCamera();
    bindSos();
    bindVoice();
    bindEmergencyModal();
    bindChat();
  });
})();
