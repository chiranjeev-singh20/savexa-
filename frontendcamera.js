/* Camera lifecycle */
window.AidCamera = (function () {
  const { $, toast } = window.AidUtils;
  let stream = null;

  async function start() {
    const video = $('#camVideo');
    const empty = $('#camEmpty');
    const overlay = $('#camOverlay');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      video.srcObject = stream;
      empty.hidden = true;
      overlay.hidden = false;
      $('#btnCapture').disabled = false;
      $('#camStatus').textContent = 'Camera active — frame the affected area';
      toast('Camera started', 'success');
      return true;
    } catch (err) {
      console.warn('Camera error:', err);
      toast('Camera unavailable — try the demo image', 'error');
      return false;
    }
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    const video = $('#camVideo');
    if (video) video.srcObject = null;
    $('#camEmpty').hidden = false;
    $('#camOverlay').hidden = true;
    $('#btnCapture').disabled = true;
  }

  function captureFrame() {
    const video = $('#camVideo');
    const canvas = $('#camCanvas');
    if (!video || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  return { start, stop, captureFrame, isActive: () => !!stream };
})();
