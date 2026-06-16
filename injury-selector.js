/* ============================================================
   Savexa — Injury Type Selector
   Allows users to manually select injury type from database
   ============================================================ */

(function () {
  const { $, $$, toast, delay } = window.AidUtils;
  const API_BASE_URL = 'http://127.0.0.1:8000/api';
  
  let allInjuryTypes = [];
  let currentImageFile = null;

  // Load all injury types from backend
  async function loadInjuryTypes() {
    try {
      const response = await fetch(`${API_BASE_URL}/injury-types/`);
      const data = await response.json();
      allInjuryTypes = data.injury_types || [];
      return allInjuryTypes;
    } catch (err) {
      console.warn('Could not load injury types:', err);
      return [];
    }
  }

  // Re-detect injury with manual selection
  async function redetectWithManualType(injuryType) {
    if (!currentImageFile) {
      toast('No image available for re-detection', 'error');
      return;
    }

    try {
      // Show loading state
      const veil = $('#analysisVeil');
      if (veil) veil.hidden = false;

      // Create form data with image and manual injury type
      const formData = new FormData();
      formData.append('image', currentImageFile);
      formData.append('manual_injury_type', injuryType);

      // Re-run detection
      const response = await fetch(`${API_BASE_URL}/detect/`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      
      // Hide loading
      if (veil) veil.hidden = true;

      // Render results with manual selection
      renderDiagnosis(result);
      renderGuidance(result);
      
      // Show success
      toast(`Showing guidance for ${injuryType}`, 'success', 2000);
      
    } catch (error) {
      console.error('Re-detection error:', error);
      toast('Error updating guidance: ' + error.message, 'error');
      const veil = $('#analysisVeil');
      if (veil) veil.hidden = true;
    }
  }

  // Show injury selector modal
  function showInjurySelectorModal() {
    const modal = document.createElement('div');
    modal.id = 'injurySelector';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 20px;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: #06061a;
      border: 1px solid rgba(0,210,255,0.28);
      border-radius: 16px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      padding: 30px;
      backdrop-filter: blur(24px);
    `;

    content.innerHTML = `
      <h2 style="color: #00d4ff; margin-bottom: 10px;">Select Injury Type</h2>
      <p style="color: #50608a; margin-bottom: 20px;">Choose the type of injury to get guidance</p>
      <div id="injurySelectorList" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;"></div>
      <button id="injurySelectorClose" style="
        width: 100%;
        padding: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(0,210,255,0.13);
        color: #dde6ff;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      ">Close</button>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    // Populate injury list
    const listEl = $('#injurySelectorList');
    allInjuryTypes.forEach(injury => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        padding: 12px;
        background: rgba(0,212,255,0.08);
        border: 1px solid rgba(0,210,255,0.13);
        color: #dde6ff;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 13px;
        font-weight: 600;
      `;
      btn.textContent = injury.injury_type;
      
      btn.addEventListener('mouseover', () => {
        btn.style.background = 'rgba(0,212,255,0.15)';
        btn.style.borderColor = 'rgba(0,210,255,0.28)';
      });
      
      btn.addEventListener('mouseout', () => {
        btn.style.background = 'rgba(0,212,255,0.08)';
        btn.style.borderColor = 'rgba(0,210,255,0.13)';
      });

      btn.addEventListener('click', async () => {
        modal.remove();
        await redetectWithManualType(injury.injury_type);
      });

      listEl.appendChild(btn);
    });

    // Close button
    $('#injurySelectorClose').addEventListener('click', () => modal.remove());
  }

  // Initialize
  window.InjurySelector = {
    async init() {
      await loadInjuryTypes();
      console.log('Injury selector loaded with', allInjuryTypes.length, 'injury types');
    },
    show: showInjurySelectorModal,
    getAll: () => allInjuryTypes,
    setCurrentImage: (file) => { currentImageFile = file; }
  };

  // Auto-initialize when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.InjurySelector.init());
  } else {
    window.InjurySelector.init();
  }
})();
