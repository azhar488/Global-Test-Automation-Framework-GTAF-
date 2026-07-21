/**
 * KIRO Recorder - Event Recorder
 * Designed for enterprise apps (X3, SAP, Oracle) that use inline handlers
 * which may block standard input events.
 * Uses keyup + value polling to capture ALL input regardless of framework.
 */

(function () {
  'use strict';

  class EventRecorder {
    constructor() {
      this.isRecording = false;
      this.isPaused = false;
      this.listeners = [];
      this.lastFlushedValues = {};
      this.pollTimer = null;
      this.typingTimer = null;
      this.lastTypingId = null;
      this.TYPING_DEBOUNCE = 1200;
      this._userTypedFields = new Set(); // Track fields user actually typed in

      // Control flow state
      this.controlFlowMode = null; // null | { mode, blockType, blockId }
    }

    // ─── Control Flow Mode ─────────────────────────────────────────────────────

    setControlFlowMode(modeState) {
      this.controlFlowMode = modeState && modeState.mode ? modeState : null;
      console.log('[KIRO] Control flow mode:', this.controlFlowMode ? this.controlFlowMode.mode : 'none');
    }

    isInControlFlow() {
      return this.controlFlowMode !== null && this.controlFlowMode.mode !== null;
    }

    start() {
      if (this.isRecording) return;
      this.isRecording = true;
      this.isPaused = false;
      // Wait for DOM if not ready yet
      if (document.readyState === 'loading') {
        var self = this;
        document.addEventListener('DOMContentLoaded', function() {
          self.attachListeners();
          self.startValuePolling();
        });
      } else {
        this.attachListeners();
        this.startValuePolling();
      }
      console.log('[KIRO] Recording started');
    }

    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }

    stop() {
      this.isRecording = false;
      this.isPaused = false;
      this.detachListeners();
      this.stopValuePolling();
      this.flushCurrentInput();
      console.log('[KIRO] Recording stopped');
    }

    // ─── Event Listeners ───────────────────────────────────────────────────────

    attachListeners() {
      var self = this;

      this._onClick = function(e) { self.handleClick(e); };
      this._onMouseDown = function(e) { self.handleMouseDown(e); };
      this._onDblClick = function(e) { self.handleDblClick(e); };
      this._onKeyDown = function(e) { self.handleKeyDown(e); };
      this._onKeyUp = function(e) { self.handleKeyUp(e); };
      this._onChange = function(e) { self.handleChange(e); };
      this._onFocusOut = function(e) { self.handleFocusOut(e); };
      this._onSubmit = function(e) { self.handleSubmit(e); };

      document.addEventListener('click', this._onClick, true);
      document.addEventListener('mousedown', this._onMouseDown, true);
      document.addEventListener('dblclick', this._onDblClick, true);
      document.addEventListener('keydown', this._onKeyDown, true);
      document.addEventListener('keyup', this._onKeyUp, true);
      document.addEventListener('change', this._onChange, true);
      document.addEventListener('focusout', this._onFocusOut, true);
      document.addEventListener('submit', this._onSubmit, true);
    }

    detachListeners() {
      document.removeEventListener('click', this._onClick, true);
      document.removeEventListener('mousedown', this._onMouseDown, true);
      document.removeEventListener('dblclick', this._onDblClick, true);
      document.removeEventListener('keydown', this._onKeyDown, true);
      document.removeEventListener('keyup', this._onKeyUp, true);
      document.removeEventListener('change', this._onChange, true);
      document.removeEventListener('focusout', this._onFocusOut, true);
      document.removeEventListener('submit', this._onSubmit, true);
    }

    // ─── Value Polling (catches inputs that block events) ──────────────────────
    // This runs every 500ms and checks if any focused input has a new value.
    // This is the MOST RELIABLE method for X3/SAP-style apps.

    startValuePolling() {
      var self = this;
      this.pollTimer = setInterval(function() {
        if (!self.isRecording || self.isPaused) return;
        self.pollActiveInput();
      }, 500);
    }

    stopValuePolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }

    pollActiveInput() {
      var active = document.activeElement;
      if (!active) return;

      var tag = active.tagName ? active.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
      if (active.type === 'password' || active.type === 'hidden') return;
      if (active.disabled) return;

      var id = active.id || active.name || this.getXPath(active);
      var value = active.value || '';

      if (!value) return;
      if (this.lastFlushedValues[id] === value) return;
      if (!this._userTypedFields.has(id)) return;

      this.lastTypingId = id;
      clearTimeout(this.typingTimer);
      var self = this;
      this.typingTimer = setTimeout(function() {
        self.recordInputValue(active, value, id);
      }, this.TYPING_DEBOUNCE);
    }

    recordInputValue(element, value, id) {
      if (this.lastFlushedValues[id] === value) return;
      this.lastFlushedValues[id] = value;

      this.sendEvent({
        eventType: 'type',
        value: element.type === 'password' ? '***MASKED***' : value,
        element: this.getElementInfo(element),
        locators: this.getLocators(element),
      });
    }

    flushCurrentInput() {
      var active = document.activeElement;
      if (!active) return;
      var tag = active.tagName ? active.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea') return;
      if (active.type === 'password' || active.disabled) return;

      var id = active.id || active.name || this.getXPath(active);
      var value = active.value || '';
      if (value && this.lastFlushedValues[id] !== value) {
        this.recordInputValue(active, value, id);
      }
    }

    // ─── Click ─────────────────────────────────────────────────────────────────

    handleClick(e) {
      if (!this.canRecord(e)) return;

      // Skip if already captured by mousedown within last 300ms
      if (this._mouseDownTime && (Date.now() - this._mouseDownTime) < 300) {
        return;
      }

      // Flush any pending input before recording click
      this.flushCurrentInput();

      var target = e.target;
      var isDashboardMenu = this.isDashboardMenuClick(target);

      // Menu open/close detection:
      // count=1 (odd) = opening, count=2 (even) = closing
      // Reset when: transitioning from close back to a new open sequence
      var isMenuClose = false;
      if (isDashboardMenu) {
        if (!this._menuClickCounts) this._menuClickCounts = {};
        if (!this._hasSeenClose) this._hasSeenClose = false;
        var menuId = target.id || target.textContent.trim().substring(0, 30);
        var currentCount = this._menuClickCounts[menuId] || 0;

        // If we've seen closing events and now a NEW menu (count=0) is clicked,
        // that means we're starting a fresh opening sequence — reset everything
        if (this._hasSeenClose && currentCount === 0) {
          this._menuClickCounts = {};
          this._hasSeenClose = false;
        }

        this._menuClickCounts[menuId] = (this._menuClickCounts[menuId] || 0) + 1;
        if (this._menuClickCounts[menuId] === 2) {
          isMenuClose = true;
          this._hasSeenClose = true;
        }
      } else {
        // Non-menu click: reset all counts to 0
        this._menuClickCounts = {};
        this._hasSeenClose = false;
      }

      var eventData = {
        eventType: 'click',
        element: this.getElementInfo(target),
        locators: this.getLocators(target),
        coordinates: { x: e.clientX, y: e.clientY },
        isDashboardNav: isDashboardMenu && !isMenuClose,
        isDashboardClose: isDashboardMenu && isMenuClose,
      };

      this.sendEvent(eventData);

      // After a close event, check if ALL tracked menus have count=2
      // If so, reset everything to 0 (cycle complete)
      if (isMenuClose && this._menuClickCounts) {
        var allClosed = true;
        for (var key in this._menuClickCounts) {
          if (this._menuClickCounts[key] < 2) { allClosed = false; break; }
        }
        if (allClosed) {
          this._menuClickCounts = {};
        }
      }
    }

    handleMouseDown(e) {
      if (!this.canRecord(e)) return;

      var target = e.target;
      var tag = target.tagName ? target.tagName.toLowerCase() : '';

      // Skip input/textarea/select - those are handled by other listeners
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      var isDashboardMenu = this.isDashboardMenuClick(target);

      // Menu open/close detection
      var isMenuClose = false;
      if (isDashboardMenu) {
        if (!this._menuClickCounts) this._menuClickCounts = {};
        var menuId = target.id || target.textContent.trim().substring(0, 30);
        this._menuClickCounts[menuId] = (this._menuClickCounts[menuId] || 0) + 1;
        if (this._menuClickCounts[menuId] === 2) {
          isMenuClose = true;
        }
      } else {
        // Non-menu click: reset all counts to 0
        this._menuClickCounts = {};
      }

      // Record mousedown for menu items and interactive non-input elements
      this._mouseDownTime = Date.now();

      this.sendEvent({
        eventType: 'click',
        element: this.getElementInfo(target),
        locators: this.getLocators(target),
        coordinates: { x: e.clientX, y: e.clientY },
        isDashboardNav: isDashboardMenu && !isMenuClose,
        isDashboardClose: isDashboardMenu && isMenuClose,
      });

      // After close, check if all tracked menus hit count=2, then reset
      if (isMenuClose && this._menuClickCounts) {
        var allClosed = true;
        for (var key in this._menuClickCounts) {
          if (this._menuClickCounts[key] < 2) { allClosed = false; break; }
        }
        if (allClosed) {
          this._menuClickCounts = {};
        }
      }
    }

    handleDblClick(e) {
      if (!this.canRecord(e)) return;
      this.sendEvent({
        eventType: 'dblclick',
        element: this.getElementInfo(e.target),
        locators: this.getLocators(e.target),
      });
    }

    // ─── Keyboard ──────────────────────────────────────────────────────────────

    handleKeyDown(e) {
      if (!this.canRecord(e)) return;

      // Only record special keys and shortcuts
      var specialKeys = ['Enter', 'Tab', 'Escape'];
      if (specialKeys.indexOf(e.key) !== -1) {
        // Flush the current input value before the special key
        this.flushCurrentInput();
        this.sendEvent({
          eventType: 'keypress',
          key: e.key,
          element: this.getElementInfo(e.target),
          locators: this.getLocators(e.target),
        });
        return;
      }

      // Keyboard shortcuts
      if (e.ctrlKey || e.metaKey) {
        this.sendEvent({
          eventType: 'shortcut',
          key: e.key,
          combination: this.getShortcutString(e),
          element: this.getElementInfo(e.target),
          locators: this.getLocators(e.target),
        });
      }
    }

    handleKeyUp(e) {
      if (!this.canRecord(e)) return;

      var target = e.target;
      var tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea') return;
      if (target.type === 'password' || target.disabled) return;

      var id = target.id || target.name || this.getXPath(target);
      this._userTypedFields.add(id);

      var value = target.value || '';
      if (!value) return;

      this.lastTypingId = id;
      clearTimeout(this.typingTimer);
      var self = this;
      this.typingTimer = setTimeout(function() {
        self.recordInputValue(target, value, id);
      }, this.TYPING_DEBOUNCE);
    }

    // ─── Focus Out (captures value when leaving a field) ───────────────────────

    handleFocusOut(e) {
      if (!this.canRecord(e)) return;

      try {
        var target = e.target;
        var tag = target.tagName ? target.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'textarea') return;
        if (target.type === 'password' || target.disabled) return;

        var id = target.id || target.name || this.getXPath(target);
        if (!this._userTypedFields.has(id)) return;

        var value = target.value || '';

        clearTimeout(this.typingTimer);

        if (value && this.lastFlushedValues[id] !== value) {
          this.lastFlushedValues[id] = value;
          this.sendEvent({
            eventType: 'type',
            value: value,
            element: this.getElementInfo(target),
            locators: this.getLocators(target),
          });
        }
      } catch (err) {}
    }

    // ─── Change (dropdowns, checkboxes, radios) ────────────────────────────────

    handleChange(e) {
      if (!this.canRecord(e)) return;

      var target = e.target;
      var tag = target.tagName ? target.tagName.toLowerCase() : '';

      if (tag === 'select') {
        var text = '';
        if (target.selectedIndex >= 0 && target.options[target.selectedIndex]) {
          text = target.options[target.selectedIndex].text;
        }
        this.sendEvent({
          eventType: 'select',
          value: target.value,
          selectedText: text,
          element: this.getElementInfo(target),
          locators: this.getLocators(target),
        });
      } else if (target.type === 'checkbox') {
        this.sendEvent({
          eventType: 'checkbox',
          checked: target.checked,
          element: this.getElementInfo(target),
          locators: this.getLocators(target),
        });
      } else if (target.type === 'radio') {
        this.sendEvent({
          eventType: 'radio',
          value: target.value,
          element: this.getElementInfo(target),
          locators: this.getLocators(target),
        });
      }
    }

    // ─── Submit ────────────────────────────────────────────────────────────────

    handleSubmit(e) {
      if (!this.canRecord(e)) return;
      this.flushCurrentInput();
      this.sendEvent({
        eventType: 'submit',
        element: this.getElementInfo(e.target),
        locators: this.getLocators(e.target),
      });
    }

    // ─── Utilities ─────────────────────────────────────────────────────────────

    canRecord(e) {
      if (!this.isRecording || this.isPaused) return false;
      if (!e || !e.target) return false;
      if (e.target.closest && e.target.closest('[data-kiro-recorder]')) return false;
      if (e.target.closest && e.target.closest('[data-kiro-pick-highlight]')) return false;
      if (e.target.id === 'kiro-pick-overlay') return false;
      return true;
    }

    isDashboardMenuClick(target) {
      if (!target) return false;
      try {
        // Method 1: Use closest() if available
        if (target.closest) {
          if (target.closest('#startMenu') || target.closest('#cclOptionMenu')) {
            return true;
          }
        }
        // Method 2: Walk up the DOM manually (for XHTML frames where closest may not work)
        var current = target;
        while (current && current !== document) {
          if (current.id === 'startMenu' || current.id === 'cclOptionMenu') {
            return true;
          }
          current = current.parentElement || current.parentNode;
        }
        // Method 3: Check by class names common to X3 menu items
        var cls = target.className || '';
        if (cls.indexOf('firstLevelOption') !== -1 || cls.indexOf('choiceOptionMenu') !== -1 ||
            cls.indexOf('closeOptionMenu') !== -1) {
          return true;
        }
        // Method 4: Check by ID pattern (_23424, _27145 etc.)
        if (target.id && target.id.match(/^_\d+$/)) {
          return true;
        }
      } catch (e) {}
      return false;
    }

    getElementInfo(element) {
      if (!element || !element.tagName) return null;
      if (window.__KIRO_LocatorEngine) {
        return window.__KIRO_LocatorEngine.getElementDetails(element);
      }
      return {
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: element.className || null,
      };
    }

    getLocators(element) {
      if (!element || !element.tagName) return null;
      if (window.__KIRO_LocatorEngine) {
        return window.__KIRO_LocatorEngine.getLocators(element);
      }
      return {
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        name: element.getAttribute('name') || null,
      };
    }

    getShortcutString(e) {
      var parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Meta');
      parts.push(e.key.toUpperCase());
      return parts.join('+');
    }

    getXPath(element) {
      var parts = [];
      var current = element;
      while (current && current.nodeType === 1) {
        var tag = current.tagName.toLowerCase();
        var index = 1;
        var sib = current.previousElementSibling;
        while (sib) {
          if (sib.tagName === current.tagName) index++;
          sib = sib.previousElementSibling;
        }
        parts.unshift(tag + '[' + index + ']');
        current = current.parentElement;
      }
      return '/' + parts.join('/');
    }

    sendEvent(eventData) {
      eventData.url = window.location.href;
      eventData.timestamp = Date.now();

      // Attach control flow context if active
      if (this.isInControlFlow()) {
        eventData.controlFlow = {
          mode: this.controlFlowMode.mode,
          blockType: this.controlFlowMode.blockType,
          blockId: this.controlFlowMode.blockId,
        };
      }

      // Use #optionTitle as the page title if available (X3 screen title)
      // Check current frame, then parent frames (title may be in a different frame)
      var optionTitle = null;
      try {
        var el = document.querySelector('#optionTitle') ||
                 document.querySelector("span[id='optionTitle']");
        if (el) optionTitle = el.textContent.trim();
      } catch (e) {}
      if (!optionTitle) {
        try {
          if (window.parent && window.parent !== window) {
            var parentEl = window.parent.document.querySelector('#optionTitle');
            if (parentEl) optionTitle = parentEl.textContent.trim();
          }
        } catch (e) {}
      }
      if (!optionTitle) {
        try {
          if (window.top && window.top !== window) {
            var topEl = window.top.document.querySelector('#optionTitle');
            if (topEl) optionTitle = topEl.textContent.trim();
          }
        } catch (e) {}
      }

      eventData.pageTitle = optionTitle || document.title;

      // Detect screen change via #optionTitle
      if (optionTitle && this._lastOptionTitle && optionTitle !== this._lastOptionTitle) {
        try {
          chrome.runtime.sendMessage({
            type: 'RECORD_EVENT',
            payload: {
              eventType: 'navigation',
              url: window.location.href,
              pageTitle: optionTitle,
              previousPageTitle: this._lastOptionTitle,
              timestamp: Date.now(),
            },
          });
        } catch (err) {}
      }
      this._lastOptionTitle = optionTitle || this._lastOptionTitle;

      try {
        chrome.runtime.sendMessage({
          type: 'RECORD_EVENT',
          payload: eventData,
        });
      } catch (err) {}
    }
  }

  // Only create if not already exists (prevents overwrite on re-injection)
  if (!window.__KIRO_EventRecorder) {
    window.__KIRO_EventRecorder = new EventRecorder();
    console.log('[KIRO] EventRecorder ready');
  }
})();
