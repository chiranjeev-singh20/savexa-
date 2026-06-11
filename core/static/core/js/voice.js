/* ==================== voice.js ====================
   Web Speech API — 100% free, browser-native
   SpeechSynthesis for TTS / SpeechRecognition for STT
   =================================================== */
const Voice = (() => {
  const synth = window.speechSynthesis;
  let vSpeaking=false, voiceSteps=[], stepIdx=0;

  function speak(text, onEnd) {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate=.9; u.pitch=1.05;
    const voices=synth.getVoices();
    const fem=voices.find(v=>/(female|samantha|karen|victoria|google uk english female)/i.test(v.name));
    if(fem) u.voice=fem;
    u.onstart=()=>{vSpeaking=true; APP.aiSpeaking=true;};
    u.onend=()=>{vSpeaking=false; APP.aiSpeaking=false; if(onEnd)onEnd();};
    u.onerror=()=>{vSpeaking=false; APP.aiSpeaking=false;};
    synth.speak(u);
  }

  function stop(){synth.cancel();vSpeaking=false;APP.aiSpeaking=false;}
  function pause(){synth.pause();}
  function resume(){synth.resume();}

  function setSteps(steps){voiceSteps=steps;stepIdx=0;}
  function playStep(i){
    if(!voiceSteps.length)return;
    if(i>=voiceSteps.length){
      APP.aiSpeaking=false;
      document.getElementById('vstatus').textContent='✓ All steps complete';
      renderSteps();return;
    }
    stepIdx=i;
    renderSteps();
    document.getElementById('vstatus').textContent=`▶ Step ${i+1} of ${voiceSteps.length}`;
    document.getElementById('vPause').disabled=false;
    document.getElementById('vStop').disabled=false;
    document.getElementById('vNext').disabled=false;
    speak(`Step ${i+1}. ${voiceSteps[i]}`, ()=>playStep(i+1));
  }

  function renderSteps(){
    const el=document.getElementById('stepsList');
    if(!voiceSteps.length){el.innerHTML='<div class="noinj"><p>No steps yet.</p></div>';return;}
    el.innerHTML=voiceSteps.map((s,i)=>`
      <div class="si ${i===stepIdx?'act':i<stepIdx?'done':''}">
        <div class="snum">${i<stepIdx?'✓':i+1}</div>
        <div class="stxt">${s}</div>
      </div>`).join('');
  }

  return {speak,stop,pause,resume,setSteps,playStep,renderSteps,getIdx:()=>stepIdx,getSteps:()=>voiceSteps};
})();
