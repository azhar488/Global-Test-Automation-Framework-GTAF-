/**
 * KIRO Recorder - Content Script
 * Runs at document_start in ALL frames.
 * Neutralizes forceUseDisconnect() to keep extension alive in X3 frames.
 */

(function () {
  'use strict';

  // Prevent double-execution in same frame
  if (window.__KIRO_ContentScriptLoaded) return;
  window.__KIRO_ContentScriptLoaded = true;

  // ─── Neutralize forceUseDisconnect (X3 kills extension connection on unload) ─

  // Override it immediately (before body loads and registers it)
  Object.defineProperty(window, 'forceUseDisconnect', {
    value: function() { /* neutralized by KIRO */ },
    writable: true,
    configurable: true
  });

  // Also intercept if it gets defined later
  var _origDefineProperty = Object.defineProperty;
  try {
    // Watch for the page trying to redefine forceUseDisconnect
    var handler = {
      set: function(target, prop, value) {
        if (prop === 'forceUseDisconnect') return true; // block
        target[prop] = value;
        return true;
      }
    };
    // Can't proxy window, but we can re-override after DOM loads
  } catch(e) {}

  // ─── Wait for DOM then initialize ────────────────────────────────────────────

  function getRecorder() {
    return window.__KIRO_EventRecorder;
  }

  var isStarted = false;

  function init() {
    // Re-neutralize forceUseDisconnect after page scripts run
    try { window.forceUseDisconnect = function() {}; } catch(e) {}

    // Listen for messages
    try {
      chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        var rec = getRecorder();
        if (!rec) { sendResponse({ success: false }); return true; }

        switch (message.type) {
          case 'RECORDING_STARTED':
            if (!isStarted) { isStarted = true; rec.start(); }
            break;
          case 'RECORDING_PAUSED':
            rec.pause();
            break;
          case 'RECORDING_RESUMED':
            rec.resume();
            break;
          case 'RECORDING_STOPPED':
            rec.stop(); isStarted = false;
            break;
          case 'RECORDING_CLEARED':
            rec.stop(); isStarted = false;
            break;
        }
        sendResponse({ success: true });
        return true;
      });
    } catch (e) {}

    // Poll for recording state
    setInterval(function () {
      if (isStarted) return;

      // Re-neutralize on every poll (X3 may redefine it)
      try { window.forceUseDisconnect = function() {}; } catch(e) {}

      try {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.storage.local.get('kiroRecording', function (result) {
          if (chrome.runtime.lastError) return;
          if (result && result.kiroRecording === true && !isStarted) {
            var rec = getRecorder();
            if (rec) { isStarted = true; rec.start(); }
          }
        });
      } catch (e) {}
    }, 500);
  }

  // Run init when DOM is ready (since we inject at document_start)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
