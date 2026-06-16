/* ==================== background.js ====================
   Three.js animated particle background
   ======================================================= */
(() => {
  const c = document.getElementById('bgc');
  const r = new THREE.WebGLRenderer({canvas:c, alpha:true});
  r.setPixelRatio(Math.min(window.devicePixelRatio,2));

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
  cam.position.z = 3;

  // Particle geometry
  const N = 600;
  const pos = new Float32Array(N*3);
  for(let i=0;i<N*3;i++) pos[i]=(Math.random()-.5)*12;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  const mat = new THREE.PointsMaterial({color:0x00d4ff, size:.03, transparent:true, opacity:.55});
  scene.add(new THREE.Points(geo,mat));

  // Resize handler
  function resize(){
    r.setSize(window.innerWidth,window.innerHeight);
    cam.aspect=window.innerWidth/window.innerHeight;
    cam.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize',resize);

  // Animation loop
  (function animate(){
    requestAnimationFrame(animate);
    scene.rotation.y+=.0006;
    scene.rotation.x+=.0002;
    r.render(scene,cam);
  })();
})();
