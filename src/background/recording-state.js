/**
 * KIRO Recorder - Recording State Manager
 * Manages the lifecycle and state of recordings.
 */

export class RecordingState {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      status: 'idle', // idle | recording | paused | stopped
      startTime: null,
      pauseTime: null,
      totalPausedDuration: 0,
      events: [],
      options: {},
      metadata: {},
    };
  }

  // ─── State Transitions ───────────────────────────────────────────────────────

  start(options = {}) {
    this.state.status = 'recording';
    this.state.startTime = Date.now();
    this.state.pauseTime = null;
    this.state.totalPausedDuration = 0;
    this.state.events = [];
    this.state.options = options;
    this.state.metadata = {
      id: `rec_${Date.now()}`,
      name: options.name || `Recording ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      browser: 'Chrome',
      extensionVersion: chrome.runtime.getManifest().version,
    };
  }

  pause() {
    if (this.state.status === 'recording') {
      this.state.status = 'paused';
      this.state.pauseTime = Date.now();
    }
  }

  resume() {
    if (this.state.status === 'paused') {
      this.state.totalPausedDuration += Date.now() - this.state.pauseTime;
      this.state.pauseTime = null;
      this.state.status = 'recording';
    }
  }

  stop() {
    if (this.state.status === 'paused') {
      this.state.totalPausedDuration += Date.now() - this.state.pauseTime;
    }

    this.state.status = 'stopped';
    this.state.metadata.stoppedAt = new Date().toISOString();
    this.state.metadata.duration = this.getDuration();
    this.state.metadata.eventCount = this.state.events.length;

    return this.getRecording();
  }

  clear() {
    this.reset();
  }

  // ─── Event Management ────────────────────────────────────────────────────────

  addEvent(event) {
    if (this.state.status !== 'recording') return;

    event.stepNumber = this.state.events.length + 1;
    event.relativeTime = this.getElapsedTime();
    this.state.events.push(event);
  }

  getEvents() {
    return [...this.state.events];
  }

  removeEvent(eventId) {
    this.state.events = this.state.events.filter((e) => e.id !== eventId);
    // Re-number steps
    this.state.events.forEach((e, i) => {
      e.stepNumber = i + 1;
    });
  }

  // ─── State Queries ───────────────────────────────────────────────────────────

  isRecording() {
    return this.state.status === 'recording';
  }

  isPaused() {
    return this.state.status === 'paused';
  }

  isStopped() {
    return this.state.status === 'stopped';
  }

  isIdle() {
    return this.state.status === 'idle';
  }

  getState() {
    return {
      status: this.state.status,
      startTime: this.state.startTime,
      duration: this.getDuration(),
      eventCount: this.state.events.length,
      metadata: this.state.metadata,
    };
  }

  getStats() {
    const events = this.state.events;
    const eventTypes = {};

    events.forEach((e) => {
      eventTypes[e.eventType] = (eventTypes[e.eventType] || 0) + 1;
    });

    return {
      totalEvents: events.length,
      duration: this.getDuration(),
      eventTypes,
      uniqueUrls: [...new Set(events.map((e) => e.tabUrl).filter(Boolean))].length,
      startTime: this.state.startTime,
      status: this.state.status,
    };
  }

  getRecording() {
    return {
      metadata: { ...this.state.metadata },
      events: [...this.state.events],
      options: { ...this.state.options },
      stats: this.getStats(),
    };
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  getDuration() {
    if (!this.state.startTime) return 0;

    const now = this.state.status === 'stopped'
      ? new Date(this.state.metadata.stoppedAt).getTime()
      : Date.now();

    return now - this.state.startTime - this.state.totalPausedDuration;
  }

  getElapsedTime() {
    if (!this.state.startTime) return 0;
    return Date.now() - this.state.startTime - this.state.totalPausedDuration;
  }
}
