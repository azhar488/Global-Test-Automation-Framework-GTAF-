/**
 * KIRO Recorder - Storage Manager
 * Handles persistent storage for recordings, projects, and settings.
 */

export class StorageManager {
  constructor() {
    this.defaultSettings = {
      screenshotEnabled: true,
      screenshotQuality: 80,
      autoSave: true,
      autoSync: false,
      defaultExportFormat: 'json',
      theme: 'dark',
      recordingSpeed: 'normal',
      aiEndpoint: '',
      aiApiKey: '',
      ignoredDomains: [],
      ignoredElements: [],
      networkMonitoring: true,
      consoleMonitoring: true,
      performanceMonitoring: true,
      maskPasswords: true,
    };
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  async getSettings() {
    const result = await chrome.storage.local.get('settings');
    return { ...this.defaultSettings, ...result.settings };
  }

  async saveSettings(settings) {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await chrome.storage.local.set({ settings: updated });
    return { success: true, settings: updated };
  }

  async initializeDefaults() {
    const existing = await chrome.storage.local.get('settings');
    if (!existing.settings) {
      await chrome.storage.local.set({ settings: this.defaultSettings });
    }
    // Initialize empty projects and recordings
    const projects = await chrome.storage.local.get('projects');
    if (!projects.projects) {
      await chrome.storage.local.set({ projects: [] });
    }
    const recordings = await chrome.storage.local.get('recordings');
    if (!recordings.recordings) {
      await chrome.storage.local.set({ recordings: [] });
    }
  }

  // ─── Recordings ──────────────────────────────────────────────────────────────

  async saveRecording(recording) {
    const result = await chrome.storage.local.get('recordings');
    const recordings = result.recordings || [];

    // Check for existing recording with same ID
    const existingIndex = recordings.findIndex((r) => r.metadata.id === recording.metadata.id);
    if (existingIndex >= 0) {
      recordings[existingIndex] = recording;
    } else {
      recordings.push(recording);
    }

    await chrome.storage.local.set({ recordings });
    return { success: true, id: recording.metadata.id };
  }

  async getRecordings() {
    const result = await chrome.storage.local.get('recordings');
    return result.recordings || [];
  }

  async getRecording(id) {
    const recordings = await this.getRecordings();
    return recordings.find((r) => r.metadata.id === id) || null;
  }

  async deleteRecording(id) {
    const result = await chrome.storage.local.get('recordings');
    const recordings = (result.recordings || []).filter((r) => r.metadata.id !== id);
    await chrome.storage.local.set({ recordings });
    return { success: true };
  }

  // ─── Projects ────────────────────────────────────────────────────────────────

  async saveProject(project) {
    const result = await chrome.storage.local.get('projects');
    const projects = result.projects || [];

    if (!project.id) {
      project.id = `proj_${Date.now()}`;
      project.createdAt = new Date().toISOString();
    }
    project.updatedAt = new Date().toISOString();

    const existingIndex = projects.findIndex((p) => p.id === project.id);
    if (existingIndex >= 0) {
      projects[existingIndex] = project;
    } else {
      projects.push(project);
    }

    await chrome.storage.local.set({ projects });
    return { success: true, project };
  }

  async getProjects() {
    const result = await chrome.storage.local.get('projects');
    return { success: true, projects: result.projects || [] };
  }

  async deleteProject(id) {
    const result = await chrome.storage.local.get('projects');
    const projects = (result.projects || []).filter((p) => p.id !== id);
    await chrome.storage.local.set({ projects });
    return { success: true };
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  async getStorageUsage() {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        resolve({
          bytesUsed: bytes,
          mbUsed: (bytes / (1024 * 1024)).toFixed(2),
          limit: chrome.storage.local.QUOTA_BYTES,
          mbLimit: (chrome.storage.local.QUOTA_BYTES / (1024 * 1024)).toFixed(2),
        });
      });
    });
  }

  async clearAll() {
    await chrome.storage.local.clear();
    await this.initializeDefaults();
    return { success: true };
  }
}
