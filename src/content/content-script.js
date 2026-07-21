/**
 * KIRO Recorder - Content Script
 * Runs at document_start in ALL frames.
 * Neutralizes forceUseDisconnect() to keep extension alive in X3 frames.
 * Handles element pick mode for control flow wizards.
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

  // ─── Element Pick Mode ───────────────────────────────────────────────────────

  var pickModeState = {
    active: false,
    fieldId: null,
    highlightedElement: null,
    overlay: null,
  };

  function enterPickMode(fieldId) {
    pickModeState.active = true;
    pickModeState.fieldId = fieldId;

    // Create overlay to intercept clicks
    if (!pickModeState.overlay) {
      var overlay = document.createElement('div');
      overlay.id = 'kiro-pick-overlay';
      overlay.setAttribute('data-kiro-recorder', 'true');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;cursor:crosshair;background:transparent;';
      document.body.appendChild(overlay);
      pickModeState.overlay = overlay;

      // Handle hover (highlight)
      overlay.addEventListener('mousemove', function(e) {
        if (!pickModeState.active) return;
        overlay.style.pointerEvents = 'none';
        var el = document.elementFromPoint(e.clientX, e.clientY);
        overlay.style.pointerEvents = 'auto';

        if (el && el !== pickModeState.highlightedElement && !el.hasAttribute('data-kiro-recorder')) {
          // Remove old highlight
          if (pickModeState.highlightedElement) {
            pickModeState.highlightedElement.removeAttribute('data-kiro-pick-highlight');
            pickModeState.highlightedElement.style.outline = '';
          }
          // Highlight new element
          el.setAttribute('data-kiro-pick-highlight', 'true');
          el.style.outline = '3px solid #4ecdc4';
          el.style.outlineOffset = '2px';
          pickModeState.highlightedElement = el;
        }
      });

      // Handle click (pick)
      overlay.addEventListener('click', function(e) {
        if (!pickModeState.active) return;
        e.preventDefault();
        e.stopPropagation();

        overlay.style.pointerEvents = 'none';
        var el = document.elementFromPoint(e.clientX, e.clientY);
        overlay.style.pointerEvents = 'auto';

        if (el && !el.hasAttribute('data-kiro-recorder')) {
          var locator = getPickedLocator(el);
          var payload = {
            fieldId: pickModeState.fieldId,
            locator: locator,
            elementInfo: getPickedElementInfo(el),
          };

          // If picking for loop fields, add pattern detection info
          var fieldId = pickModeState.fieldId;
          if (fieldId === 'cf-loop-container' || fieldId === 'cf-table-locator') {
            // User picked a container — detect repeating children
            var detector = window.__KIRO_PatternDetector;
            if (detector) {
              var pattern = detector.detectRepeatingChildren(el);
              payload.pattern = {
                itemCount: pattern.itemCount,
                itemSelector: pattern.itemSelector,
                itemTag: pattern.itemTag,
              };
              // For tables, also detect table structure
              var tableInfo = detector.detectTableStructure(el);
              if (tableInfo) {
                payload.tableInfo = {
                  headers: tableInfo.headers,
                  rowLocator: tableInfo.rowLocator,
                  rowCount: tableInfo.rowCount,
                  isStandardTable: tableInfo.isStandardTable,
                };
              }
            }
          } else if (fieldId === 'cf-loop-item') {
            // User picked one item — detect pattern from that item
            var detector = window.__KIRO_PatternDetector;
            if (detector) {
              var pattern = detector.detectPatternFromItem(el);
              if (pattern) {
                payload.pattern = {
                  containerXPath: pattern.containerXPath,
                  itemLocator: pattern.itemLocator,
                  itemCount: pattern.itemCount,
                };
                // Also set the container locator
                payload.extraFields = {
                  'cf-loop-container': pattern.containerXPath,
                };
              }
            }
          } else if (fieldId === 'cf-loop-match-locator') {
            // User picked element to match on — get relative locator
            var detector = window.__KIRO_PatternDetector;
            if (detector && detector.lastDetectedPattern && detector.lastDetectedPattern.items) {
              // Find which item this element belongs to
              var items = detector.lastDetectedPattern.items;
              var parentItem = null;
              for (var i = 0; i < items.length; i++) {
                if (items[i].contains(el)) {
                  parentItem = items[i];
                  break;
                }
              }
              if (parentItem) {
                locator = detector.getRelativeLocator(el, parentItem);
                payload.locator = locator;
              }
            }
          }

          exitPickMode();

          // Send picked locator back to sidepanel
          try {
            chrome.runtime.sendMessage({
              type: 'ELEMENT_PICKED',
              payload: payload,
            });
          } catch(err) {}
        }
      });

      // ESC to cancel
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && pickModeState.active) {
          exitPickMode();
          document.removeEventListener('keydown', escHandler);
        }
      });
    } else {
      pickModeState.overlay.style.display = 'block';
    }
  }

  function exitPickMode() {
    pickModeState.active = false;

    if (pickModeState.highlightedElement) {
      pickModeState.highlightedElement.removeAttribute('data-kiro-pick-highlight');
      pickModeState.highlightedElement.style.outline = '';
      pickModeState.highlightedElement = null;
    }

    if (pickModeState.overlay) {
      pickModeState.overlay.style.display = 'none';
    }
  }

  function getPickedLocator(element) {
    // Use the locator engine if available
    if (window.__KIRO_LocatorEngine) {
      var locators = window.__KIRO_LocatorEngine.getLocators(element);
      // Prefer relative XPath, then ID-based, then absolute
      if (locators.relativeXPath) return locators.relativeXPath;
      if (locators.id) return "//*[@id='" + locators.id + "']";
      if (locators.absoluteXPath) return locators.absoluteXPath;
      if (locators.recommended && locators.recommended.value) return locators.recommended.value;
    }

    // Fallback: generate basic XPath
    return generateBasicXPath(element);
  }

  function getPickedElementInfo(element) {
    return {
      tagName: element.tagName ? element.tagName.toLowerCase() : '',
      id: element.id || null,
      className: element.className || null,
      textContent: element.textContent ? element.textContent.trim().substring(0, 100) : '',
      childCount: element.children ? element.children.length : 0,
    };
  }

  function generateBasicXPath(element) {
    var parts = [];
    var current = element;
    while (current && current.nodeType === 1) {
      var tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift("//*[@id='" + current.id + "']");
        break;
      }
      var index = 1;
      var sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName === current.tagName) index++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(tag + '[' + index + ']');
      current = current.parentElement;
    }
    if (parts.length > 0 && parts[0].startsWith("//*[@id=")) {
      return parts.join('/');
    }
    return '//' + parts.join('/');
  }

  // ─── Control Flow Mode State ─────────────────────────────────────────────────

  var controlFlowMode = {
    mode: null,   // null | 'condition_then' | 'condition_else' | 'loop_body' | etc.
    blockType: null,
    blockId: null,
  };

  function setControlFlowMode(payload) {
    controlFlowMode.mode = payload.mode;
    controlFlowMode.blockType = payload.blockType;
    controlFlowMode.blockId = payload.blockId;

    // Notify event recorder of mode change
    var rec = getRecorder();
    if (rec && rec.setControlFlowMode) {
      rec.setControlFlowMode(controlFlowMode);
    }

    // Update visual indicator based on mode
    updateRecordingIndicator();
  }

  function updateRecordingIndicator() {
    var existing = document.getElementById('kiro-cf-indicator');
    if (!controlFlowMode.mode) {
      if (existing) existing.remove();
      return;
    }

    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'kiro-cf-indicator';
      existing.setAttribute('data-kiro-recorder', 'true');
      existing.style.cssText = 'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:2147483645;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:600;font-family:sans-serif;pointer-events:none;user-select:none;';
      document.body.appendChild(existing);
    }

    var labels = {
      'condition_then': { text: 'Recording IF (THEN)', color: '#2ecc71', bg: 'rgba(46,204,113,0.15)' },
      'condition_else': { text: 'Recording ELSE', color: '#e74c3c', bg: 'rgba(231,76,60,0.15)' },
      'loop_body': { text: 'Recording LOOP Body', color: '#3498db', bg: 'rgba(52,152,219,0.15)' },
      'loop_noMatch': { text: 'Recording NO MATCH', color: '#f39c12', bg: 'rgba(243,156,18,0.15)' },
      'tableSelect_body': { text: 'Recording TABLE Action', color: '#9b59b6', bg: 'rgba(155,89,182,0.15)' },
      'tableSelect_noMatch': { text: 'Recording NO MATCH', color: '#f39c12', bg: 'rgba(243,156,18,0.15)' },
    };

    var info = labels[controlFlowMode.mode] || { text: controlFlowMode.mode, color: '#fff', bg: 'rgba(0,0,0,0.5)' };
    existing.textContent = info.text;
    existing.style.color = info.color;
    existing.style.background = info.bg;
    existing.style.border = '1px solid ' + info.color;
  }

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

        switch (message.type) {
          case 'RECORDING_STARTED':
            if (!isStarted && rec) { isStarted = true; rec.start(); }
            break;
          case 'RECORDING_PAUSED':
            if (rec) rec.pause();
            break;
          case 'RECORDING_RESUMED':
            if (rec) rec.resume();
            break;
          case 'RECORDING_STOPPED':
            if (rec) rec.stop();
            isStarted = false;
            // Clean up control flow indicators
            controlFlowMode.mode = null;
            updateRecordingIndicator();
            break;
          case 'RECORDING_CLEARED':
            if (rec) rec.stop();
            isStarted = false;
            controlFlowMode.mode = null;
            updateRecordingIndicator();
            break;

          // ─── Control Flow Messages ─────────────────────────────────────
          case 'ENTER_PICK_MODE':
            enterPickMode(message.payload.fieldId);
            break;
          case 'EXIT_PICK_MODE':
            exitPickMode();
            break;
          case 'CONTROL_FLOW_MODE':
            setControlFlowMode(message.payload);
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
