/* ==================== chatbot.js ====================
   Free AI chatbot:
   1. Django proxy → Claude API (/api/claude/)
   2. Medical knowledge base fallback (works offline)
   =================================================== */
const Chatbot = (() => {
  // Offline medical knowledge base
  const KB = [
    {pat:/cut|lacerat|wound|slash/i, resp:`For cuts/lacerations:\n1. Apply firm pressure with clean cloth for 10 min\n2. Rinse under clean running water\n3. Apply antiseptic and cover with bandage\n4. Seek help if bleeding doesn't stop or wound is deep.`},
    {pat:/bleed|hemorrhage/i, resp:`To stop bleeding:\n1. Apply direct pressure — don't remove cloth\n2. Elevate the injured area above heart level\n3. Apply ice pack wrapped in cloth\n4. Call 108 if bleeding is severe or from an artery.`},
    {pat:/burn|scald/i, resp:`For burns:\n1. Cool under running water for 20 minutes (NOT ice)\n2. Remove jewelry near burn\n3. Cover loosely with sterile gauze\n⛔ Do NOT use butter, toothpaste, or ice\nCall 108 for severe burns.`},
    {pat:/chok|suffocate|airway/i, resp:`For choking:\n1. Give 5 firm back blows between shoulder blades\n2. Give 5 abdominal thrusts (Heimlich maneuver)\n3. Alternate until object is expelled\n4. If unconscious, start CPR and call 108 immediately.`},
    {pat:/cpr|cardiac|heart stop|not breath/i, resp:`CPR Steps:\n1. Check safety & responsiveness\n2. Call 112 for help\n3. Give 30 chest compressions (hard & fast, center of chest)\n4. Give 2 rescue breaths\n5. Repeat 30:2 until help arrives.`},
    {pat:/fracture|broken bone|snap/i, resp:`For suspected fractures:\n1. Immobilize the area — do NOT try to straighten\n2. Apply ice wrapped in cloth to reduce swelling\n3. Keep elevated if possible\n4. Go to ER or call 108 for major fractures.`},
    {pat:/sprain|twist|ankle/i, resp:`For sprains — RICE method:\n1. Rest — stop activity\n2. Ice — 20 min every 2 hours\n3. Compress — elastic bandage\n4. Elevate — above heart level\nSee doctor if severe pain or can't bear weight.`},
    {pat:/allerg|anaphylax|swollen throat/i, resp:`Allergic reaction:\n1. Give EpiPen if available\n2. Call 112 immediately for severe reactions\n3. Lay flat with legs raised\n4. If breathing stops, start CPR\n⚠️ Anaphylaxis is life-threatening — act fast.`},
    {pat:/poison|swallow|toxic/i, resp:`For poisoning:\n1. Call 112 or Poison Control immediately\n2. Don't induce vomiting unless instructed\n3. Note what was swallowed and how much\n4. Keep the person calm and still.`},
    {pat:/head|concuss|skull/i, resp:`For head injuries:\n1. Keep still — don't move if spine injury suspected\n2. Apply gentle pressure to bleeding wounds\n3. Monitor for: confusion, vomiting, unequal pupils\n4. Call 108 if unconscious or symptoms worsen.`},
    {pat:/shock/i, resp:`For shock:\n1. Lay person flat, elevate legs 12 inches\n2. Keep warm with blanket\n3. Don't give food or water\n4. Call 108 immediately — shock is life-threatening.`},
    {pat:/fever|temperature/i, resp:`For high fever:\n1. Apply cool (not cold) damp cloths to forehead\n2. Stay hydrated — sip water frequently\n3. Take paracetamol if available\n4. Seek care if fever >103°F (39.4°C) or in children.`},
  ];

  function kbAnswer(q){
    for(const k of KB) if(k.pat.test(q)) return k.resp;
    return null;
  }

  let history=[];

  // Get CSRF token from cookie (Django requirement)
  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  async function ask(msg) {
    history.push({role:'user',content:msg});
    // Try Django proxy → Claude API
    try {
      const body={
        model:'claude-sonnet-4-20250514',
        max_tokens:300,
        system:`You are AidSense, a concise AI medical emergency assistant. Current injury context: ${APP.analysis?`${APP.analysis.name} (${APP.analysis.sev})`:'none scanned'}. Reply in under 90 words, use numbered steps for procedures. Always recommend professional help for serious injuries.`,
        messages:history
      };
      const resp = await fetch('/api/claude/', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body:JSON.stringify(body)
      });
      const text = await resp.text();
      let data;
      try{data=JSON.parse(text);}catch(e){throw new Error('Bad JSON: '+text.slice(0,80));}
      if(data.error) throw new Error(data.error.message||JSON.stringify(data.error));
      if(!data.content?.[0]?.text) throw new Error('No content in response');
      const reply=data.content[0].text;
      history.push({role:'assistant',content:reply});
      document.getElementById('llmStatus').innerHTML='<span class="sd"></span>Claude AI Active';
      return reply;
    } catch(err) {
      console.warn('Claude API unavailable, using knowledge base:', err.message);
      const kb = kbAnswer(msg);
      const reply = kb || `For "${msg}": Please consult a healthcare professional or call 112. For immediate first aid questions, I recommend checking the First Aid tab for step-by-step guidance.`;
      history.push({role:'assistant',content:reply});
      document.getElementById('llmStatus').innerHTML='<span class="sd" style="background:var(--warn)"></span>Offline KB Mode';
      return reply;
    }
  }

  return {ask};
})();
