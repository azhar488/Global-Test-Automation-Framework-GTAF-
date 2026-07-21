/**
 * KIRO Recorder - Background Service Worker
 * Manages recording state, tab tracking, message routing, and network monitoring.
 */

import { RecordingState } from './recording-state.js';
import { TabManager } from './tab-manager.js';
import { NetworkMonitor } from './network-monitor.js';
import { StorageManager } from './storage-manager.js';

// Initialize modules
const recordingState = new RecordingState();
const tabManager = new TabManager();
const networkMonitor = new NetworkMonitor();
const storageManager = new StorageManager();

// ─── Message Handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    console.error('[KIRO] Message handling error:', error);
    sendResponse({ success: false, error: error.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case 'START_RECORDING':
      return await startRecording(payload);
    case 'PAUSE_RECORDING':
      return await pauseRecording();
    case 'RESUME_RECORDING':
      return await resumeRecording();
    case 'STOP_RECORDING':
      return await stopRecording();
    case 'CLEAR_RECORDING':
      return await clearRecording();
    case 'RECORD_EVENT':
      return await recordEvent(payload, sender);
    case 'GET_STATE':
      return { success: true, state: recordingState.getState() };
    case 'GET_EVENTS':
      return { success: true, events: recordingState.getEvents() };
    case 'GET_STATS':
      return { success: true, stats: recordingState.getStats() };
    case 'GET_NETWORK_LOGS':
      return { success: true, logs: networkMonitor.getLogs() };
    case 'EXPORT_RECORDING':
      return await exportRecording();

    // ─── Control Flow Messages ───────────────────────────────────────────
    case 'START_CONDITION':
      return startControlFlowBlock('condition', payload);
    case 'START_LOOP':
      return startControlFlowBlock('loop', payload);
    case 'START_TABLE_SELECT':
      return startControlFlowBlock('tableSelect', payload);
    case 'SWITCH_BRANCH':
      return switchControlFlowBranch(payload);
    case 'END_BLOCK':
      return endControlFlowBlock();
    case 'UPDATE_BLOCK_CONFIG':
      return updateBlockConfig(payload);
    case 'GET_CONTROL_FLOW_STATE':
      return { success: true, controlFlow: recordingState.getControlFlowState() };

    case 'GET_SETTINGS':
      return await storageManager.getSettings();
    case 'SAVE_SETTINGS':
      return await storageManager.saveSettings(payload);
    case 'SAVE_PROJECT':
      return await storageManager.saveProject(payload);
    case 'GET_PROJECTS':
      return await storageManager.getProjects();
    case 'DELETE_PROJECT':
      return await storageManager.deleteProject(payload.id);
    case 'REORDER_EVENTS':
      return reorderEvents(payload);
    default:
      return { success: false, error: 'Unknown message type: ' + type };
  }
}

// ─── Recording Controls ────────────────────────────────────────────────────────

async function startRecording(options) {
  if (recordingState.isRecording()) {
    return { success: false, error: 'Already recording' };
  }

  recordingState.start(options || {});

  // Set storage flag so all frames (including reloaded ones) can detect recording
  await chrome.storage.local.set({ kiroRecording: true });

  // Notify all tabs
  await broadcastToContentScripts({ type: 'RECORDING_STARTED' });

  // Force-inject into all frames of the active tab (catches frames that missed content script)
  await injectIntoAllFrames();

  updateBadge('REC', '#FF0000');

  return { success: true, state: recordingState.getState() };
}

async function pauseRecording() {
  if (!recordingState.isRecording()) {
    return { success: false, error: 'Not recording' };
  }
  recordingState.pause();
  await broadcastToContentScripts({ type: 'RECORDING_PAUSED' });
  updateBadge('||', '#FFA500');
  return { success: true, state: recordingState.getState() };
}

async function resumeRecording() {
  if (!recordingState.isPaused()) {
    return { success: false, error: 'Not paused' };
  }
  recordingState.resume();
  await broadcastToContentScripts({ type: 'RECORDING_RESUMED' });
  updateBadge('REC', '#FF0000');
  return { success: true, state: recordingState.getState() };
}

async function stopRecording() {
  if (!recordingState.isRecording() && !recordingState.isPaused()) {
    return { success: false, error: 'Not recording' };
  }

  const recording = recordingState.stop();
  recording.networkLogs = networkMonitor.getLogs();
  networkMonitor.stop();

  await chrome.storage.local.set({ kiroRecording: false });
  await broadcastToContentScripts({ type: 'RECORDING_STOPPED' });
  updateBadge('', '');

  const settings = await storageManager.getSettings();
  if (settings.autoSave) {
    await storageManager.saveRecording(recording);
  }

  return { success: true, recording };
}

async function clearRecording() {
  recordingState.clear();
  networkMonitor.clear();
  await chrome.storage.local.set({ kiroRecording: false });
  await broadcastToContentScripts({ type: 'RECORDING_CLEARED' });
  updateBadge('', '');
  return { success: true };
}

// ─── Event Recording ───────────────────────────────────────────────────────────

async function recordEvent(eventData, sender) {
  if (!recordingState.isRecording()) {
    return { success: false, error: 'Not recording' };
  }

  const enrichedEvent = {
    ...eventData,
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    timestamp: Date.now(),
    tabId: sender.tab ? sender.tab.id : null,
    tabUrl: sender.tab ? sender.tab.url : null,
    tabTitle: sender.tab ? sender.tab.title : null,
  };

  recordingState.addEvent(enrichedEvent);

  // Notify popup/sidepanel
  chrome.runtime.sendMessage({
    type: 'EVENT_RECORDED',
    payload: enrichedEvent,
  }).catch(() => {});

  return { success: true, event: enrichedEvent };
}

// ─── Reorder Events ────────────────────────────────────────────────────────────

function reorderEvents(payload) {
  if (!payload || !payload.events) {
    return { success: false, error: 'No events provided' };
  }
  // Replace the events array with the reordered one
  recordingState.state.events = payload.events;
  // Re-number steps
  recordingState.state.events.forEach((e, i) => {
    e.stepNumber = i + 1;
  });
  return { success: true };
}

// ─── Control Flow ──────────────────────────────────────────────────────────────

function startControlFlowBlock(blockType, config) {
  if (!recordingState.isRecording()) {
    return { success: false, error: 'Not recording' };
  }

  let block;
  switch (blockType) {
    case 'condition':
      block = recordingState.startCondition(config || {});
      break;
    case 'loop':
      block = recordingState.startLoop(config || {});
      break;
    case 'tableSelect':
      block = recordingState.startTableSelect(config || {});
      break;
    default:
      return { success: false, error: 'Unknown block type: ' + blockType };
  }

  // Notify sidepanel/popup of control flow state change
  chrome.runtime.sendMessage({
    type: 'CONTROL_FLOW_CHANGED',
    payload: recordingState.getControlFlowState(),
  }).catch(() => {});

  // Notify content scripts to adjust recording behavior
  broadcastToContentScripts({
    type: 'CONTROL_FLOW_MODE',
    payload: {
      mode: recordingState.controlFlowMode,
      blockType,
      blockId: block.id,
    },
  });

  return { success: true, block, controlFlow: recordingState.getControlFlowState() };
}

function switchControlFlowBranch(payload) {
  if (!recordingState.isInControlFlow()) {
    return { success: false, error: 'Not in a control flow block' };
  }

  const branchName = payload.branch || payload.branchName;
  const result = recordingState.switchBranch(branchName);

  if (!result) {
    return { success: false, error: 'Invalid branch: ' + branchName };
  }

  // Notify sidepanel/popup
  chrome.runtime.sendMessage({
    type: 'CONTROL_FLOW_CHANGED',
    payload: recordingState.getControlFlowState(),
  }).catch(() => {});

  // Notify content scripts
  broadcastToContentScripts({
    type: 'CONTROL_FLOW_MODE',
    payload: {
      mode: recordingState.controlFlowMode,
      blockType: recordingState.getCurrentBlock().blockType,
      blockId: recordingState.getCurrentBlock().id,
    },
  });

  return { success: true, controlFlow: recordingState.getControlFlowState() };
}

function endControlFlowBlock() {
  if (!recordingState.isInControlFlow()) {
    return { success: false, error: 'Not in a control flow block' };
  }

  const completedBlock = recordingState.endBlock();

  // Notify sidepanel/popup
  chrome.runtime.sendMessage({
    type: 'CONTROL_FLOW_CHANGED',
    payload: recordingState.getControlFlowState(),
  }).catch(() => {});

  chrome.runtime.sendMessage({
    type: 'BLOCK_COMPLETED',
    payload: completedBlock,
  }).catch(() => {});

  // Notify content scripts
  broadcastToContentScripts({
    type: 'CONTROL_FLOW_MODE',
    payload: {
      mode: recordingState.controlFlowMode,
      blockType: recordingState.getCurrentBlock()?.blockType || null,
      blockId: recordingState.getCurrentBlock()?.id || null,
    },
  });

  return { success: true, block: completedBlock, controlFlow: recordingState.getControlFlowState() };
}

function updateBlockConfig(payload) {
  if (!recordingState.isInControlFlow()) {
    return { success: false, error: 'Not in a control flow block' };
  }

  const result = recordingState.updateBlockConfig(payload);
  if (!result) {
    return { success: false, error: 'Failed to update block config' };
  }

  return { success: true, controlFlow: recordingState.getControlFlowState() };
}

// ─── Export ────────────────────────────────────────────────────────────────────

async function exportRecording() {
  const recording = recordingState.getRecording();
  if (!recording || recording.events.length === 0) {
    return { success: false, error: 'No recording to export' };
  }
  return { success: true, recording };
}

// ─── Tab Tracking ──────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  tabManager.setActiveTab(activeInfo.tabId);
  if (recordingState.isRecording()) {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      recordingState.addEvent({
        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        eventType: 'tabSwitch',
        timestamp: Date.now(),
        tabId: activeInfo.tabId,
        tabUrl: tab.url,
        tabTitle: tab.title,
      });
    } catch (e) {}
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && recordingState.isRecording()) {
    recordingState.addEvent({
      id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      eventType: 'navigation',
      timestamp: Date.now(),
      tabId: tabId,
      tabUrl: changeInfo.url,
      tabTitle: tab.title,
    });
  }

  // When a page finishes loading during recording, tell it to start recording
  if (changeInfo.status === 'complete' && recordingState.isRecording()) {
    chrome.tabs.sendMessage(tabId, { type: 'RECORDING_STARTED' }).catch(() => {});
  }
});

// ─── Force Injection ───────────────────────────────────────────────────────────

async function injectIntoAllFrames() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    // Inject content scripts into ALL frames of the active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['src/content/locator-engine.js', 'src/content/pattern-detector.js', 'src/content/event-recorder.js', 'src/content/content-script.js'],
    });
  } catch (e) {
    // Some frames may reject injection (chrome:// etc.) - that's fine
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

async function broadcastToContentScripts(message) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (err) {}
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

// ─── Install Event ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await storageManager.initializeDefaults();
  }
});

console.log('[KIRO] Service worker initialized');
