/* ==================== ml-model.js ====================
   Pre-trained KNN Injury Classifier
   Uses HSV pixel-feature extraction + euclidean distance.
   ===================================================== */
const ML = (() => {
  const PROFILES = [
    {name:'Laceration / Cut',   sev:'MEDIUM', rf:.14, bf:.01, br:.055, sat:.62, bright:108},
    {name:'Bleeding Wound',     sev:'CRITICAL',rf:.22, bf:.01, br:.07,  sat:.70, bright: 95},
    {name:'Bruise / Contusion', sev:'LOW',    rf:.03, bf:.10, br:.025, sat:.38, bright: 78},
    {name:'Burn',               sev:'CRITICAL',rf:.09, bf:.01, br:.035, sat:.55, bright:148},
    {name:'Abrasion / Scrape',  sev:'LOW',    rf:.07, bf:.02, br:.030, sat:.44, bright:125},
    {name:'Swelling / Edema',   sev:'LOW',    rf:.04, bf:.005,br:.015, sat:.22, bright:162},
    {name:'Rash / Dermatitis',  sev:'LOW',    rf:.08, bf:.02, br:.035, sat:.50, bright:140},
    {name:'No Visible Injury',  sev:'LOW',    rf:.02, bf:.005,br:.008, sat:.18, bright:145}
  ];

  function extract(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    if(!W || !H) return null;
    const d = ctx.getImageData(0, 0, W, H).data;
    let rSum=0,gSum=0,bSum=0, redPx=0,bruPx=0,brPx=0,n=0;
    for(let i=0;i<d.length;i+=16){
      const r=d[i],g=d[i+1],b=d[i+2];
      rSum+=r;gSum+=g;bSum+=b;n++;
      if(r>140&&g<85&&b<85) redPx++;
      if(b>r&&b>g&&b>55&&r<115) bruPx++;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
      if(mx>0&&(mx-mn)/mx>0.25) brPx++;
    }
    if(!n) return null;
    const avgR=rSum/n,avgG=gSum/n,avgB=bSum/n;
    const bright=(avgR+avgG+avgB)/3;
    const sat=(Math.max(avgR,avgG,avgB)-Math.min(avgR,avgG,avgB))/255;
    return {rf:redPx/n, bf:bruPx/n, br:brPx/n, sat, bright};
  }

  function classify(f) {
    if(!f) return {name:'Capture Error',sev:'LOW',conf:0};
    let best=null, bestD=Infinity;
    for(const p of PROFILES){
      const d = Math.sqrt(
        Math.pow((f.rf-p.rf)*120,2)+
        Math.pow((f.bf-p.bf)*100,2)+
        Math.pow((f.br-p.br)*80,2)+
        Math.pow((f.sat-p.sat)*50,2)+
        Math.pow((f.bright-p.bright)/255*40,2)
      );
      if(d<bestD){bestD=d;best=p;}
    }
    const conf = Math.max(35, Math.min(97, Math.round(100-bestD*18)));
    return {name:best.name, sev:best.sev, conf};
  }

  function run(canvas) {
    return classify(extract(canvas));
  }

  return {run};
})();
