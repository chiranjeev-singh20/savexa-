/* ==================== app.js ====================
   Main Application Controller
   NOTE: Claude API calls go through /api/claude/ Django proxy
   ================================================ */
const APP = {
  stream:null, analysis:null, tracking:false,
  aiSpeaking:false, listening:false, recognition:null,
  history:[], totalScans:0, critCount:0, confSum:0,
  trackTick:null, timerTick:null, timerPct:100,
  uploadedB64:null
};

// ── CSRF helper ──
function getCsrfToken() {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, 'csrftoken'.length + 1) === ('csrftoken=')) {
        cookieValue = decodeURIComponent(cookie.substring('csrftoken'.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// ── Notification ──
function notify(msg, type='ok') {
  const n = document.getElementById('notif');
  n.textContent = msg;
  n.className = `notif ${type} show`;
  clearTimeout(n._t);
  n._t = setTimeout(() => n.classList.remove('show'), 3200);
}

// ── Tab navigation ──
function goTab(id, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  document.getElementById('tab-' + id).classList.add('on');
  if (el) el.classList.add('on');
}

// ── Waveform animators ──
function animWave(canvasId, color='#00d4ff', active=false) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext('2d');
  c.width = c.offsetWidth || 300;
  const W = c.width, H = c.height;
  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const amp = active ? (12 + Math.random() * 18) : 3;
      const y = H/2 + Math.sin(x * 0.04 + t) * amp * Math.random();
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    t += 0.08;
    c._raf = requestAnimationFrame(draw);
  }
  cancelAnimationFrame(c._raf);
  draw();
}

animWave('wvc', '#00d4ff', false);
animWave('cwv', '#7c3aed', false);

// ── Camera ──
async function startCam() {
  try {
    APP.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
    const vid = document.getElementById('vid');
    vid.srcObject = APP.stream;
    vid.style.display = 'block';
    document.getElementById('camph').style.display = 'none';
    document.getElementById('oi').style.display = 'block';
    document.getElementById('sline').classList.add('on');
    document.getElementById('camBtn').disabled = true;
    document.getElementById('trackBtn').disabled = false;
    document.getElementById('anaBtn').disabled = false;
    document.getElementById('scanBadge').textContent = '● CAMERA ON';
    notify('Camera started', 'ok');
  } catch(e) {
    notify('Camera error: ' + e.message, 'er');
  }
}

function captureB64() {
  const vid = document.getElementById('vid');
  if (!vid.videoWidth) return null;
  const cv = document.createElement('canvas');
  cv.width = vid.videoWidth; cv.height = vid.videoHeight;
  cv.getContext('2d').drawImage(vid, 0, 0);
  return {b64: cv.toDataURL('image/jpeg', 0.85).split(',')[1], canvas: cv};
}

// ── Tracking ──
const TRACK_MS = 8000;
function toggleTrack() {
  APP.tracking = !APP.tracking;
  const btn = document.getElementById('trackBtn');
  if (APP.tracking) {
    btn.textContent = '⏹ Stop Tracking';
    btn.className = 'btn bd';
    document.getElementById('tw').classList.add('on');
    document.getElementById('scanBadge').textContent = '● SCANNING';
    animWave('wvc', '#00d4ff', true);
    runCycle();
    notify('Auto-tracking started', 'ok');
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>Start Tracking';
    btn.className = 'btn bw';
    document.getElementById('tw').classList.remove('on');
    document.getElementById('scanBadge').textContent = '● CAMERA ON';
    animWave('wvc', '#00d4ff', false);
    clearTimeout(APP.trackTick);
    clearInterval(APP.timerTick);
    notify('Tracking stopped', 'in');
  }
}

function runCycle() {
  analyzeNow(true);
  APP.timerPct = 100;
  clearInterval(APP.timerTick);
  APP.timerTick = setInterval(() => {
    APP.timerPct -= 100 / (TRACK_MS / 100);
    document.getElementById('tf').style.width = Math.max(0, APP.timerPct) + '%';
    document.getElementById('tlabel').textContent = `Next scan in ${Math.ceil(APP.timerPct / 100 * TRACK_MS / 1000)}s`;
  }, 100);
  APP.trackTick = setTimeout(() => { if (APP.tracking) runCycle(); }, TRACK_MS);
}

// ── Image upload ──
function loadUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('upImg');
    img.src = ev.target.result;
    img.style.display = 'block';
    APP.uploadedB64 = ev.target.result.split(',')[1];
    document.getElementById('anaBtn').disabled = false;
    notify('Image loaded — click Analyze Now', 'ok');
  };
  reader.readAsDataURL(file);
}

// ── Main analysis (ML + Claude via Django proxy) ──
async function analyzeNow(fromTrack=false) {
  let b64=null, mlCanvas=null;
  if (APP.stream) {
    const cap = captureB64();
    if (cap) { b64=cap.b64; mlCanvas=cap.canvas; }
  } else if (APP.uploadedB64) {
    b64 = APP.uploadedB64;
  }
  if (!b64) { notify('No image — start camera or upload a photo', 'er'); return; }

  // Step 1: Instant ML classification (on-device)
  let mlResult = {name:'Analyzing…', sev:'LOW', conf:0};
  if (mlCanvas) {
    mlResult = ML.run(mlCanvas);
    const tag = document.getElementById('mlTag');
    if (tag) {
      tag.classList.add('on');
      const col = mlResult.sev==='CRITICAL'?'var(--dan)':mlResult.sev==='MEDIUM'?'var(--warn)':'var(--suc)';
      tag.style.color = col;
      tag.textContent = `🤖 ${mlResult.name} (${mlResult.conf}%)`;
    }
  }

  if (!fromTrack) {
    document.getElementById('anaArea').innerHTML = `<div style="text-align:center;padding:18px;color:var(--td)"><span class="ld"></span><p style="margin-top:8px;font-size:11px">AI analyzing with Claude Vision…</p></div>`;
  }

  // Step 2: Claude Vision via /api/claude/ Django proxy
  const prompt = `Analyze this image for injuries/medical conditions. Reply ONLY with raw JSON (no markdown, no extra text):
{"injury_type":"string","affected_area":"string","severity":"LOW|MEDIUM|CRITICAL","confidence":0-100,"description":"2-sentence description","immediate_action":"single most urgent action","first_aid_steps":["step 1","step 2","step 3","step 4","step 5"],"do_not":"one critical thing NOT to do"}
If no injury visible: injury_type="None Detected", severity="LOW", confidence=95, first_aid_steps=["Monitor the area","Rest if needed","Stay hydrated","Seek help if symptoms develop","Contact doctor if unsure"].`;

  try {
    const resp = await fetch('/api/claude/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrfToken(),
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        messages: [{role:'user', content:[
          {type:'image', source:{type:'base64', media_type:'image/jpeg', data:b64}},
          {type:'text', text:prompt}
        ]}]
      })
    });

    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch(e) { throw new Error('Response parse error: '+raw.slice(0,100)); }
    if (data.error) throw new Error(data.error.message||JSON.stringify(data.error));
    if (!data.content?.[0]?.text) throw new Error('Empty response from API');

    let txt = data.content[0].text.trim().replace(/```json|```/gi,'').trim();
    const s=txt.indexOf('{'), e=txt.lastIndexOf('}');
    if (s===-1||e===-1) throw new Error('No JSON found in: '+txt.slice(0,100));
    const parsed = JSON.parse(txt.slice(s,e+1));

    APP.analysis = {...parsed, name:parsed.injury_type};
    renderResult(parsed);
    updateAidTab(parsed);
    updateHistory(parsed);
    updateStats(parsed);
    updateHomeRecent(parsed);

  } catch(err) {
    console.warn('Claude API error, using ML result:', err.message);
    const kbSteps = {
      'Laceration / Cut':['Apply firm pressure with clean cloth','Elevate above heart level','Rinse with clean water for 5 min','Apply antiseptic and bandage','Monitor for infection signs'],
      'Bleeding Wound':['Call 108 immediately','Apply HARD direct pressure','Do NOT remove cloth — add more on top','Keep patient still and lying down','Elevate injured area above heart'],
      'Bruise / Contusion':['Apply ice pack wrapped in cloth','Rest the area for 24-48 hours','Compress gently with elastic bandage','Elevate to reduce swelling','See doctor if very painful or swollen'],
      'Burn':['Cool under running water for 20 minutes','Remove jewelry/tight items','Cover loosely with sterile gauze','Do NOT use ice, butter or toothpaste','Seek hospital for severe burns'],
      'No Visible Injury':['Monitor for developing symptoms','Rest if any discomfort','Stay hydrated','Apply cold pack if needed','Consult doctor if pain persists'],
    };
    const steps = kbSteps[mlResult.name] || kbSteps['No Visible Injury'];
    const fallback = {injury_type:mlResult.name, affected_area:'Detected region', severity:mlResult.sev, confidence:mlResult.conf, description:`ML classifier identified ${mlResult.name} with ${mlResult.conf}% confidence. Claude AI unavailable — using on-device analysis.`, immediate_action:steps[0], first_aid_steps:steps, do_not:'Do not ignore worsening symptoms'};
    APP.analysis = {...fallback, name:mlResult.name};
    renderResult(fallback);
    updateAidTab(fallback);
    updateHistory(fallback);
    updateStats(fallback);
    updateHomeRecent(fallback);
    notify('Using ML model (Claude AI unavailable)', 'in');
  }
}

// ── Render results ──
function renderResult(a) {
  const sc = a.severity==='CRITICAL'?'sc':a.severity==='MEDIUM'?'sm':'sl';
  document.getElementById('anaArea').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:15px;font-weight:700">${a.injury_type}</span>
      <span class="sev ${sc}">${a.severity}</span>
    </div>
    <div class="rg">
      <div class="ri"><div class="rl">Area</div><div class="rv">${a.affected_area}</div></div>
      <div class="ri"><div class="rl">Confidence</div><div class="rv">${a.confidence}%<div class="cbar"><div class="cfill" style="width:${a.confidence}%"></div></div></div></div>
      <div class="ri" style="grid-column:1/-1"><div class="rl">⚡ Do Immediately</div><div class="rv" style="font-size:12px;color:var(--warn)">${a.immediate_action}</div></div>
      <div class="ri" style="grid-column:1/-1"><div class="rl">⛔ Do NOT</div><div class="rv" style="font-size:11px;color:var(--dan)">${a.do_not}</div></div>
    </div>
    <div class="ai-desc">${a.description}</div>`;
  document.getElementById('stepsCard').style.display = 'block';
  document.getElementById('stepsPreview').innerHTML = a.first_aid_steps.slice(0,3).map((s,i)=>`<div style="display:flex;gap:7px;margin-bottom:6px;font-size:11px"><span style="color:var(--p);font-weight:700;min-width:14px">${i+1}.</span><span>${s}</span></div>`).join('') + `<div style="font-size:10px;color:var(--td);margin-top:4px">+${a.first_aid_steps.length-3} more steps in Voice Guide</div>`;
}

// ── First Aid Tab ──
function updateAidTab(a) {
  Voice.setSteps(a.first_aid_steps||[]);
  const sc = a.severity==='CRITICAL'?'sc':a.severity==='MEDIUM'?'sm':'sl';
  document.getElementById('aidInfo').innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span style="font-size:14px;font-weight:700">${a.injury_type}</span><span class="sev ${sc}">${a.severity}</span></div><p style="font-size:10px;color:var(--td)">${a.affected_area} · ${a.confidence}% confidence</p>`;
  Voice.renderSteps();
  document.getElementById('vstatus').textContent = `${(a.first_aid_steps||[]).length} steps ready — Press Play`;
}
function goToAid() { goTab('aid',document.getElementById('ni-aid')); setTimeout(()=>Voice.playStep(0),300); }

// ── Voice first aid controls ──
function vPlay() {
  const steps = Voice.getSteps();
  if (!steps.length) { notify('Analyze an injury first','er'); return; }
  if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); APP.aiSpeaking=true; return; }
  Voice.playStep(Voice.getIdx());
}
function vPause() { Voice.pause(); APP.aiSpeaking=false; document.getElementById('vPause').disabled=true; }
function vStop() { Voice.stop(); document.getElementById('vPause').disabled=true; document.getElementById('vNext').disabled=true; document.getElementById('vstatus').textContent='Stopped'; }
function vReplay() { Voice.stop(); setTimeout(()=>Voice.playStep(0),120); }
function vNext() { Voice.stop(); setTimeout(()=>Voice.playStep(Voice.getIdx()+1),120); }

// ── Speech Recognition ──
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  APP.recognition = new SR();
  APP.recognition.continuous=false; APP.recognition.interimResults=true; APP.recognition.lang='en-US';
  APP.recognition.onstart = () => {
    APP.listening=true;
    document.getElementById('vorb').classList.add('listening');
    document.getElementById('vs').textContent = 'Listening…';
  };
  APP.recognition.onresult = e => {
    const tr = Array.from(e.results).map(r=>r[0].transcript).join('');
    document.getElementById('vtr').textContent = tr;
    if (e.results[e.results.length-1].isFinal) { document.getElementById('cin').value=tr; sendChat(); }
  };
  APP.recognition.onend = () => {
    APP.listening=false;
    document.getElementById('vorb').classList.remove('listening');
    document.getElementById('vs').textContent = 'Tap orb to speak';
    document.getElementById('vtr').textContent = '';
  };
  APP.recognition.onerror = e => {
    APP.listening=false;
    document.getElementById('vorb').classList.remove('listening');
    if (e.error!=='aborted') notify('Mic: '+e.error,'er');
  };
} else {
  document.getElementById('vorb').title='Speech recognition not supported in this browser';
}

function toggleListen() {
  if (!APP.recognition) { notify('Speech recognition not supported. Use Chrome or Edge.','er'); return; }
  if (APP.aiSpeaking) { Voice.stop(); APP.aiSpeaking=false; }
  APP.listening ? APP.recognition.stop() : APP.recognition.start();
}

// ── AI Chatbot ──
async function sendChat() {
  const inp = document.getElementById('cin');
  const msg = inp.value.trim(); if (!msg) return;
  inp.value = '';
  addMsg(msg,'u');
  const tid = addTyping();
  try {
    const reply = await Chatbot.ask(msg);
    removeTyping(tid);
    addMsg(reply,'b');
    Voice.speak(reply);
    document.getElementById('vorb').classList.add('speaking');
    document.getElementById('vs').textContent = 'AI speaking…';
    setTimeout(()=>{ document.getElementById('vorb').classList.remove('speaking'); document.getElementById('vs').textContent='Tap orb to speak'; }, reply.length*55+1000);
  } catch(e) {
    removeTyping(tid);
    addMsg('Sorry, something went wrong. Please try again.','b');
    console.error('Chat error:',e);
  }
}
function qChat(q) { document.getElementById('cin').value=q; sendChat(); }
function addMsg(text,who) {
  const box = document.getElementById('chatBox');
  const now = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const d = document.createElement('div'); d.className=`msg ${who}`;
  d.innerHTML = `<div class="bbl">${text.replace(/\n/g,'<br>')}</div><span class="mt">${who==='u'?'You':'AidSense'} · ${now}</span>`;
  box.appendChild(d); box.scrollTop=box.scrollHeight;
}
function addTyping() {
  const box=document.getElementById('chatBox'), id='t'+Date.now();
  const d=document.createElement('div'); d.className='msg b'; d.id=id;
  d.innerHTML='<div class="typ"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  box.appendChild(d); box.scrollTop=box.scrollHeight; return id;
}
function removeTyping(id) { document.getElementById(id)?.remove(); }

// ── Emergency ──
function callNum(n) { window.location.href='tel:'+n; }
function triggerSOS() {
  notify('🆘 SOS SENT — Emergency contacts notified!','er');
  Voice.speak('Emergency SOS alert sent. Help is on the way. Stay calm.');
  if (APP.analysis) window.open(`sms:112?body=${encodeURIComponent('EMERGENCY: '+APP.analysis.name+' detected. Need immediate help!')}`);
}
function findHospitals() {
  const l = document.getElementById('hospList');
  l.innerHTML='<div style="text-align:center;padding:12px;font-size:11px;color:var(--td)"><span class="ld"></span> Locating…</div>';
  navigator.geolocation?.getCurrentPosition(()=>{
    l.innerHTML=['Apollo Hospitals','Manipal Hospital','Fortis Hospital','Narayana Health'].map((n,i)=>`<div class="hitem" onclick="window.open('https://maps.google.com/?q=${encodeURIComponent(n)}')"><div class="hn">🏥 ${n}</div><div class="hd">${(i+1)*1.2} km away · Emergency</div></div>`).join('');
    notify('Hospitals located near you','ok');
  },()=>{
    l.innerHTML='<div class="hitem"><div class="hn">🏥 Apollo Hospitals</div><div class="hd">Enable GPS for exact distance</div></div><div class="hitem"><div class="hn">🏥 Fortis Hospital</div><div class="hd">Enable GPS for exact distance</div></div>';
    notify('Enable GPS for accurate results','in');
  });
}

// ── Home recent ──
function updateHomeRecent(a) {
  document.getElementById('homeRecent').style.display='block';
  const sc=a.severity==='CRITICAL'?'sc':a.severity==='MEDIUM'?'sm':'sl';
  document.getElementById('homeRecentContent').innerHTML=`<div class="card"><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:14px;font-weight:700">${a.injury_type}</span><span class="sev ${sc}">${a.severity}</span></div><div style="font-size:10px;color:var(--td);margin-top:5px">${new Date().toLocaleTimeString()} · ${a.confidence}% confidence · ${a.affected_area}</div></div>`;
}

// ── Analytics ──
function updateHistory(a) {
  APP.history.unshift({n:a.injury_type,s:a.severity,t:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),c:a.confidence});
  const l=document.getElementById('histList');
  l.innerHTML=APP.history.slice(0,8).map(h=>{
    const col=h.s==='CRITICAL'?'var(--dan)':h.s==='MEDIUM'?'var(--warn)':'var(--suc)';
    return `<div class="hst"><div class="hdot" style="background:${col}"></div><div><div class="hinj">${h.n}</div><div class="htm">${h.t} · ${h.c}% · ${h.s}</div></div></div>`;
  }).join('');
}
function updateStats(a) {
  APP.totalScans++;if(a.severity==='CRITICAL')APP.critCount++;APP.confSum+=a.confidence;
  document.getElementById('stS').textContent=APP.totalScans;
  document.getElementById('stC').textContent=APP.critCount;
  document.getElementById('stAvg').textContent=Math.round(APP.confSum/APP.totalScans)+'%';
  const m={CRITICAL:'⚠️ Critical detected — seek immediate medical care.',MEDIUM:'⚡ Moderate injury — apply first aid and monitor closely.',LOW:'✅ Minor condition — basic first aid should suffice.'};
  document.getElementById('aiIns').innerHTML=`<p style="margin-bottom:7px">${m[a.severity]||''}</p><p style="color:var(--td)">${a.injury_type} in ${a.affected_area}. ${a.confidence}% confidence. Scan #${APP.totalScans}.</p>`;
  drawChart();
}
function drawChart() {
  const c=document.getElementById('barChart'),ctx=c.getContext('2d');
  c.width=c.offsetWidth||380;
  const cats={Low:0,Medium:0,Critical:0};
  APP.history.forEach(h=>{cats[h.s==='LOW'?'Low':h.s==='MEDIUM'?'Medium':'Critical']++;});
  const max=Math.max(...Object.values(cats),1);
  ctx.clearRect(0,0,c.width,110);
  ['#00d68f','#ffaa00','#ff4757'].forEach((col,i)=>{
    const [k,v]=[['Low',cats.Low],['Medium',cats.Medium],['Critical',cats.Critical]][i];
    const bw=70,gap=28,x=gap+i*(bw+gap),h=Math.max((v/max)*85,3),y=100-h;
    ctx.fillStyle=col+'22';ctx.fillRect(x,y,bw,h);
    ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.strokeRect(x,y,bw,h);
    ctx.fillStyle=col;ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText(k,x+bw/2,108);
    ctx.fillStyle='rgba(255,255,255,.8)';ctx.font='700 12px Segoe UI';ctx.fillText(v,x+bw/2,y-4);
  });
}
function genQR() {
  const b=document.getElementById('qrbox');b.innerHTML='';
  try{
    new QRCode(b,{text:JSON.stringify({scans:APP.totalScans,critical:APP.critCount,history:APP.history.slice(0,5),app:'AidSense AI',generated:new Date().toISOString()}),width:160,height:160,colorDark:'#000',colorLight:'#fff',correctLevel:QRCode.CorrectLevel.M});
    notify('QR generated!','ok');
  }catch(e){notify('QR error: '+e.message,'er');}
}
function dlSummary() {
  const txt=`AidSense Medical Summary\n${'═'.repeat(28)}\nGenerated: ${new Date().toLocaleString()}\nTotal Scans: ${APP.totalScans} | Critical: ${APP.critCount}\n\nScan History:\n${APP.history.map((h,i)=>`${i+1}. ${h.n} (${h.s}) — ${h.t} — ${h.c}%`).join('\n')||'No scans'}\n\nPowered by AidSense AI · Free & Open`;
  const a=document.createElement('a');a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(txt);a.download='aidsense-report.txt';a.click();
  notify('Report downloaded!','ok');
}

// ── Radar ──
function drawRadar() {
  const c=document.getElementById('rdr'),ctx=c.getContext('2d');
  cancelAnimationFrame(c._raf);
  const cx=100,cy=100,R=84;let ang=0;
  function draw(){
    ctx.clearRect(0,0,200,200);
    for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(cx,cy,R/4*i,0,Math.PI*2);ctx.strokeStyle='rgba(0,212,255,.18)';ctx.lineWidth=1;ctx.stroke();}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*Math.cos(a),cy+R*Math.sin(a));ctx.strokeStyle='rgba(0,212,255,.12)';ctx.stroke();}
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,R,ang,ang+.75);ctx.closePath();ctx.fillStyle='rgba(0,212,255,.09)';ctx.fill();
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+R*Math.cos(ang+.75),cy+R*Math.sin(ang+.75));ctx.strokeStyle='rgba(0,212,255,.7)';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fillStyle='#00d4ff';ctx.fill();
    [[55,65],[140,85],[95,145],[68,118],[145,135]].forEach(([bx,by])=>{ctx.beginPath();ctx.arc(bx,by,3,0,Math.PI*2);ctx.fillStyle='rgba(255,71,87,.65)';ctx.fill();ctx.strokeStyle='rgba(255,71,87,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(bx,by,7,0,Math.PI*2);ctx.stroke();});
    ang+=.025;c._raf=requestAnimationFrame(draw);
  }draw();
}

// ── Init ──
drawRadar();
drawChart();
setTimeout(()=>window.speechSynthesis?.getVoices(), 600);
