/**
 * KIRO Recorder - Popup Controller
 * Handles recording controls, timer display, and event preview.
 */

class PopupController {
  constructor() {
    this.timerInterval = null;
    this.startTime = null;
    this.elapsedPaused = 0;
    this.initElements();
    this.attachListeners();
    this.loadState();
    this.listenForEvents();
  }

  initElements() {
    // Buttons
    this.btnStart = document.getElementById('btn-start');
    this.btnPause = document.getElementById('btn-pause');
    this.btnStop = document.getElementById('btn-stop');
    this.btnSave = document.getElementById('btn-save');
    this.btnExport = document.getElementById('btn-export');
    this.btnClear = document.getElementById('btn-clear');
    this.btnTheme = document.getElementById('btn-theme');
    this.btnDashboard = document.getElementById('btn-dashboard');
    this.btnSettings = document.getElementById('btn-settings');

    // Status
    this.statusDot = document.getElementById('status-dot');
    this.statusText = document.getElementById('status-text');
    this.timerEl = document.getElementById('timer');
    this.stepCount = document.getElementById('step-count');
    this.currentUrl = document.getElementById('current-url');
    this.activeTab = document.getElementById('active-tab');

    // Events
    this.eventsList = document.getElementById('events-list');
  }

  attachListeners() {
    this.btnStart.addEventListener('click', () => this.startRecording());
    this.btnPause.addEventListener('click', () => this.togglePause());
    this.btnStop.addEventListener('click', () => this.stopRecording());
    this.btnSave.addEventListener('click', () => this.saveRecording());
    this.btnExport.addEventListener('click', () => this.exportRecording());
    this.btnClear.addEventListener('click', () => this.clearRecording());
    this.btnTheme.addEventListener('click', () => this.toggleTheme());
    this.btnDashboard.addEventListener('click', () => this.openDashboard());
    this.btnSettings.addEventListener('click', () => this.openDashboard());
  }

  // ─── Recording Controls ──────────────────────────────────────────

  async startRecording() {
    const response = await this.sendMessage('START_RECORDING', {});
    if (response.success) {
      this.updateUI('recording');
      this.startTimer();

      // Also directly tell the active tab to start recording
      // (backup in case broadcast from background doesn't reach it)
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'RECORDING_STARTED' }).catch(() => {});
        }
      } catch (e) {}
    }
  }

  async togglePause() {
    const state = await this.sendMessage('GET_STATE');
    if (state.state.status === 'recording') {
      const resp = await this.sendMessage('PAUSE_RECORDING');
      if (resp.success) {
        this.updateUI('paused');
        this.pauseTimer();
      }
    } else if (state.state.status === 'paused') {
      const resp = await this.sendMessage('RESUME_RECORDING');
      if (resp.success) {
        this.updateUI('recording');
        this.resumeTimer();
      }
    }
  }

  async stopRecording() {
    const response = await this.sendMessage('STOP_RECORDING');
    if (response.success) {
      this.updateUI('stopped');
      this.stopTimer();
    }
  }

  async saveRecording() {
    const response = await this.sendMessage('EXPORT_RECORDING', {});
    if (response.success && response.recording) {
      const blob = new Blob(
        [JSON.stringify(response.recording, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const name = `kiro_recording_${Date.now()}.json`;
      await chrome.downloads.download({ url, filename: name, saveAs: true });
      URL.revokeObjectURL(url);
    }
  }

  async exportRecording() {
    this.openDashboard();
  }

  async clearRecording() {
    const response = await this.sendMessage('CLEAR_RECORDING');
    if (response.success) {
      this.updateUI('idle');
      this.resetTimer();
      this.eventsList.innerHTML = '<li class="empty-state">No events recorded yet</li>';
      this.stepCount.textContent = '0';
    }
  }

  // ─── UI Updates ────────────────────────────────────────────────────

  updateUI(status) {
    this.statusDot.className = `dot ${status}`;

    const labels = { idle: 'Idle', recording: 'Recording', paused: 'Paused', stopped: 'Stopped' };
    this.statusText.textContent = labels[status] || status;

    // Button states
    const isIdle = status === 'idle';
    const isRecording = status === 'recording';
    const isPaused = status === 'paused';
    const isStopped = status === 'stopped';

    this.btnStart.disabled = isRecording || isPaused;
    this.btnPause.disabled = isIdle || isStopped;
    this.btnStop.disabled = isIdle || isStopped;
    this.btnSave.disabled = isIdle;
    this.btnExport.disabled = isIdle;
    this.btnClear.disabled = isIdle;

    // Update pause button text
    this.btnPause.innerHTML = isPaused
      ? '<span class="btn-icon">&#9654;</span> Resume'
      : '<span class="btn-icon">&#10074;&#10074;</span> Pause';
  }

  // ─── Timer ─────────────────────────────────────────────────────────

  startTimer() {
    this.startTime = Date.now();
    this.elapsedPaused = 0;
    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }

  pauseTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.elapsedPaused += Date.now() - this.startTime;
    }
  }

  resumeTimer() {
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetTimer() {
    this.stopTimer();
    this.timerEl.textContent = '00:00:00';
    this.startTime = null;
    this.elapsedPaused = 0;
  }

  updateTimer() {
    const elapsed = Date.now() - this.startTime + this.elapsedPaused;
    const secs = Math.floor(elapsed / 1000);
    const h = String(Math.floor(secs / 3600)).padStart(2, '0');
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    this.timerEl.textContent = `${h}:${m}:${s}`;
  }

  // ─── State Loading ─────────────────────────────────────────────────

  async loadState() {
    try {
      const stateResp = await this.sendMessage('GET_STATE');
      if (stateResp.success) {
        const state = stateResp.state;
        this.updateUI(state.status);
        this.stepCount.textContent = state.eventCount || 0;

        if (state.status === 'recording' || state.status === 'paused') {
          this.startTime = Date.now() - state.duration;
          if (state.status === 'recording') {
            this.timerInterval = setInterval(() => this.updateTimer(), 1000);
          }
          this.updateTimer();
        }
      }

      // Load active tab info
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        this.currentUrl.textContent = tab.url || '-';
        this.activeTab.textContent = tab.title || '-';
      }

      // Load recent events
      const eventsResp = await this.sendMessage('GET_EVENTS');
      if (eventsResp.success && eventsResp.events.length > 0) {
        this.renderEvents(eventsResp.events.slice(-5));
      }
    } catch (e) {
      console.warn('[KIRO] State load error:', e);
    }
  }

  // ─── Events Display ────────────────────────────────────────────────

  listenForEvents() {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'EVENT_RECORDED') {
        this.addEventToList(message.payload);
        const count = parseInt(this.stepCount.textContent) + 1;
        this.stepCount.textContent = count;
      }
    });
  }

  addEventToList(event) {
    const empty = this.eventsList.querySelector('.empty-state');
    if (empty) empty.remove();

    const li = document.createElement('li');
    li.innerHTML = `
      <span class="event-type">${event.eventType}</span>
      <span class="event-target">${this.getEventLabel(event)}</span>
    `;
    this.eventsList.prepend(li);

    // Keep max 10 items
    while (this.eventsList.children.length > 10) {
      this.eventsList.removeChild(this.eventsList.lastChild);
    }
  }

  renderEvents(events) {
    this.eventsList.innerHTML = '';
    events.reverse().forEach((e) => this.addEventToList(e));
  }

  getEventLabel(event) {
    if (event.locators?.id) return `#${event.locators.id}`;
    if (event.locators?.name) return `[name=${event.locators.name}]`;
    if (event.locators?.tagName) return `<${event.locators.tagName}>`;
    if (event.tabUrl) return event.tabUrl.substring(0, 30);
    return event.eventType;
  }

  // ─── Theme ─────────────────────────────────────────────────────────

  toggleTheme() {
    const body = document.body;
    const isDark = !body.hasAttribute('data-theme');
    if (isDark) {
      body.setAttribute('data-theme', 'light');
    } else {
      body.removeAttribute('data-theme');
    }
  }

  // ─── Dashboard ─────────────────────────────────────────────────────

  openDashboard() {
    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT }).catch(() => {
      // Side panel may not be supported, open in new tab
      chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
    });
  }

  // ─── Messaging ─────────────────────────────────────────────────────

  sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
