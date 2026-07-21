/**
 * KIRO Recorder - Recording State Manager
 * Manages the lifecycle and state of recordings.
 * Supports control flow blocks: conditions (if/else), loops, and table selections.
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

    // Control flow state
    this.controlFlowStack = []; // Stack of active blocks being recorded
    this.controlFlowMode = null; // null | 'condition_then' | 'condition_else' | 'loop_body' | 'loop_noMatch' | 'tableSelect_body' | 'tableSelect_noMatch'
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

    // Reset control flow state
    this.controlFlowStack = [];
    this.controlFlowMode = null;
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

  // ─── Control Flow Management ──────────────────────────────────────────────────

  /**
   * Start a new control flow block.
   * @param {string} blockType - 'condition' | 'loop' | 'tableSelect'
   * @param {object} config - Configuration for the block
   * @returns {object} The created block
   */
  startBlock(blockType, config = {}) {
    const block = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type: 'block',
      blockType, // 'condition' | 'loop' | 'tableSelect'
      config,
      branches: {},
      timestamp: Date.now(),
      relativeTime: this.getElapsedTime(),
    };

    // Initialize branches based on block type
    switch (blockType) {
      case 'condition':
        block.branches = { then: [], else: [] };
        this.controlFlowMode = 'condition_then';
        break;
      case 'loop':
        block.branches = { body: [], noMatch: [] };
        this.controlFlowMode = 'loop_body';
        break;
      case 'tableSelect':
        block.branches = { body: [], noMatch: [] };
        this.controlFlowMode = 'tableSelect_body';
        break;
    }

    this.controlFlowStack.push(block);
    return block;
  }

  /**
   * Switch to a different branch within the current block.
   * @param {string} branchName - Target branch name (e.g., 'else', 'noMatch')
   */
  switchBranch(branchName) {
    const currentBlock = this.getCurrentBlock();
    if (!currentBlock) return false;

    if (!currentBlock.branches.hasOwnProperty(branchName)) return false;

    this.controlFlowMode = `${currentBlock.blockType}_${branchName}`;
    return true;
  }

  /**
   * End the current control flow block and add it to the parent context.
   * @returns {object|null} The completed block
   */
  endBlock() {
    if (this.controlFlowStack.length === 0) return null;

    const completedBlock = this.controlFlowStack.pop();
    completedBlock.stepNumber = this.state.events.length + 1;

    // If there's a parent block, add to the parent's current branch
    if (this.controlFlowStack.length > 0) {
      const parentBlock = this.controlFlowStack[this.controlFlowStack.length - 1];
      const parentBranch = this.getActiveBranch(parentBlock);
      if (parentBranch) {
        parentBranch.push(completedBlock);
      }
      // Restore parent's control flow mode
      this.controlFlowMode = this.inferMode(parentBlock);
    } else {
      // Top-level block — add to main events array
      this.state.events.push(completedBlock);
      this.controlFlowMode = null;
    }

    return completedBlock;
  }

  /**
   * Get the currently active control flow block (top of stack).
   */
  getCurrentBlock() {
    if (this.controlFlowStack.length === 0) return null;
    return this.controlFlowStack[this.controlFlowStack.length - 1];
  }

  /**
   * Check if we're currently inside a control flow block.
   */
  isInControlFlow() {
    return this.controlFlowStack.length > 0;
  }

  /**
   * Get the nesting depth of control flow blocks.
   */
  getControlFlowDepth() {
    return this.controlFlowStack.length;
  }

  /**
   * Get the active branch array for a given block based on current mode.
   */
  getActiveBranch(block) {
    if (!block) return null;
    const mode = this.controlFlowMode;
    if (!mode) return null;

    const parts = mode.split('_');
    const branchName = parts.slice(1).join('_'); // handles 'condition_then', 'loop_noMatch', etc.

    return block.branches[branchName] || null;
  }

  /**
   * Infer the control flow mode from a block's state.
   * Used when restoring mode after ending a nested block.
   */
  inferMode(block) {
    // Default to the first branch that has content, or the first branch
    const branchNames = Object.keys(block.branches);
    // Find the last non-empty branch, or default to first
    for (let i = branchNames.length - 1; i >= 0; i--) {
      if (block.branches[branchNames[i]].length > 0) {
        return `${block.blockType}_${branchNames[i]}`;
      }
    }
    return `${block.blockType}_${branchNames[0]}`;
  }

  /**
   * Update the config of the current block (e.g., adding locators, criteria).
   * @param {object} configUpdate - Partial config to merge
   */
  updateBlockConfig(configUpdate) {
    const currentBlock = this.getCurrentBlock();
    if (!currentBlock) return false;
    Object.assign(currentBlock.config, configUpdate);
    return true;
  }

  /**
   * Get a summary of the current control flow state for UI display.
   */
  getControlFlowState() {
    return {
      isActive: this.isInControlFlow(),
      depth: this.getControlFlowDepth(),
      mode: this.controlFlowMode,
      currentBlock: this.getCurrentBlock(),
      stack: this.controlFlowStack.map(b => ({
        id: b.id,
        blockType: b.blockType,
        branchCounts: Object.fromEntries(
          Object.entries(b.branches).map(([k, v]) => [k, v.length])
        ),
      })),
    };
  }

  // ─── Modified Event Addition (control flow aware) ───────────────────────────

  addEvent(event) {
    if (this.state.status !== 'recording') return;

    event.stepNumber = this.state.events.length + 1;
    event.relativeTime = this.getElapsedTime();

    // If inside a control flow block, add to the active branch
    if (this.isInControlFlow()) {
      const currentBlock = this.getCurrentBlock();
      const branch = this.getActiveBranch(currentBlock);
      if (branch) {
        event.stepNumber = branch.length + 1;
        branch.push(event);
        return;
      }
    }

    // Otherwise add to main events array
    this.state.events.push(event);
  }

  // ─── Block Factory Methods ──────────────────────────────────────────────────

  /**
   * Start a condition (if/else) block.
   * @param {object} condition - { check, locator, operator, value }
   *   check: 'elementExists' | 'elementVisible' | 'elementEnabled' | 'textContains' | 'attributeEquals'
   */
  startCondition(condition) {
    return this.startBlock('condition', {
      check: condition.check || 'elementExists',
      locator: condition.locator || '',
      operator: condition.operator || 'equals',
      value: condition.value || '',
    });
  }

  /**
   * Start a loop block.
   * @param {object} loopConfig - { loopType, container, itemLocator, match, action }
   *   loopType: 'findMatch' | 'allMatches' | 'repeatN' | 'repeatUntil'
   */
  startLoop(loopConfig) {
    return this.startBlock('loop', {
      loopType: loopConfig.loopType || 'findMatch',
      container: loopConfig.container || '',
      itemLocator: loopConfig.itemLocator || '',
      match: loopConfig.match || null, // { elementLocator, operator, value }
      count: loopConfig.count || null, // for repeatN
      action: loopConfig.action || 'firstMatch',
    });
  }

  /**
   * Start a table selection block.
   * @param {object} tableConfig - { tableLocator, rowLocator, columns, criteria, logic }
   */
  startTableSelect(tableConfig) {
    return this.startBlock('tableSelect', {
      tableLocator: tableConfig.tableLocator || '',
      rowLocator: tableConfig.rowLocator || '',
      columns: tableConfig.columns || [], // [{ index, name, locator }]
      criteria: tableConfig.criteria || [], // [{ column, operator, value }]
      logic: tableConfig.logic || 'AND', // 'AND' | 'OR'
      action: tableConfig.action || 'firstMatch',
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
