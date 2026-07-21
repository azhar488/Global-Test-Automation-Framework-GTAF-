/**
 * KIRO Recorder - Side Panel / Dashboard Controller
 * Manages event timeline, recordings, network, console, export, AI, and settings views.
 */
class DashboardController {
  constructor() {
    this.events = [];
    this.activeBlockId = null; // ID of the block currently capturing steps
    this.initNavigation();
    this.initExport();
    this.initAI();
    this.initSettings();
    this.initSearch();
    this.loadData();
    this.listenForUpdates();
  }

  initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');
        const viewName = item.getAttribute('data-view');
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        document.getElementById(`view-${viewName}`).classList.add('active');
        this.onViewChange(viewName);
      });
    });
  }

  onViewChange(viewName) {
    if (viewName === 'network') this.loadNetworkLogs();
    if (viewName === 'recordings') this.loadRecordings();
  }

  async loadData() {
    try {
      const resp = await this.sendMessage('GET_EVENTS');
      if (resp.success) {
        this.events = resp.events;
        this.renderTimeline(this.events);
        this.updateStats();
      }
    } catch (e) {}
  }

  async loadNetworkLogs() {
    try {
      const resp = await this.sendMessage('GET_NETWORK_LOGS');
      if (resp.success) this.renderNetworkLogs(resp.logs);
    } catch (e) {}
  }

  async loadRecordings() {
    try {
      const resp = await this.sendMessage('GET_PROJECTS');
      if (resp.success) this.renderRecordings(resp.projects);
    } catch (e) {}
  }

  listenForUpdates() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'EVENT_RECORDED') {
        this.events.push(msg.payload);
        this.addTimelineItem(msg.payload);
        this.updateStats();
      }
    });
  }

  renderTimeline(events) {
    const list = document.getElementById('timeline-list');
    if (events.length === 0) {
      list.innerHTML = '<div class="empty-state">No events recorded yet.</div>';
      return;
    }
    list.innerHTML = '';
    events.forEach((evt) => {
      if (evt.type === 'block') {
        this.addBlockToTimeline(evt, true);
      } else {
        this.addTimelineItem(evt);
      }
    });
  }

  addTimelineItem(evt) {
    const list = document.getElementById('timeline-list');
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.setAttribute('data-type', evt.eventType);
    item.setAttribute('data-event-id', evt.id || evt.timestamp);
    const step = evt.stepNumber || this.events.length;
    const target = this.getTargetLabel(evt);
    const time = this.formatTime(evt.relativeTime);
    item.innerHTML = '<span class="timeline-step">' + step + '</span>'
      + '<div class="timeline-details"><span class="timeline-type">' + evt.eventType + '</span>'
      + '<span class="timeline-target">' + target + '</span></div>'
      + '<span class="timeline-time">' + time + '</span>'
      + '<div class="step-actions">'
      + '<button class="insert-block-btn" title="Insert If/Loop/Table here">&#10010;</button>'
      + '<button class="move-step-btn move-up-btn" title="Move up">&#9650;</button>'
      + '<button class="move-step-btn move-down-btn" title="Move down">&#9660;</button>'
      + '<button class="delete-step-btn" title="Delete this step">&#128465;</button>'
      + '</div>';
    // Attach delete handler
    item.querySelector('.delete-step-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteEvent(evt.id || evt.timestamp, item);
    });
    // Attach move up handler
    item.querySelector('.move-up-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.moveEvent(evt.id || evt.timestamp, 'up');
    });
    // Attach move down handler
    item.querySelector('.move-down-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.moveEvent(evt.id || evt.timestamp, 'down');
    });
    // Attach insert block handler
    item.querySelector('.insert-block-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showInsertMenu(evt.id || evt.timestamp, item);
    });
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  }

  showInsertMenu(afterEventId, itemElement) {
    // Remove any existing insert menu
    const existing = document.querySelector('.insert-block-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'insert-block-menu';
    menu.innerHTML = `
      <span class="insert-menu-label">Insert after this step:</span>
      <button class="insert-menu-item insert-condition" data-type="condition">&#9888; If / Else</button>
      <button class="insert-menu-item insert-loop" data-type="loop">&#128260; Loop</button>
      <button class="insert-menu-item insert-table" data-type="tableSelect">&#128203; Table Select</button>
      <button class="insert-menu-item insert-cancel">Cancel</button>
    `;

    menu.querySelector('.insert-condition').addEventListener('click', () => {
      menu.remove();
      this.showInlineConditionForm(afterEventId, itemElement);
    });
    menu.querySelector('.insert-loop').addEventListener('click', () => {
      menu.remove();
      this.insertBlockAt(afterEventId, 'loop');
    });
    menu.querySelector('.insert-table').addEventListener('click', () => {
      menu.remove();
      this.insertBlockAt(afterEventId, 'tableSelect');
    });
    menu.querySelector('.insert-cancel').addEventListener('click', () => {
      menu.remove();
    });

    // Insert menu after the clicked item
    itemElement.after(menu);
  }

  showInlineConditionForm(afterEventId, itemElement) {
    // Remove any existing form
    const existing = document.querySelector('.inline-condition-form');
    if (existing) existing.remove();

    const form = document.createElement('div');
    form.className = 'inline-condition-form';
    form.innerHTML = `
      <div class="icf-header">Add Control Statement</div>
      <div class="icf-statement-row">
        <label class="icf-label">Statement type:</label>
        <select class="icf-select" id="icf-statement">
          <option value="if">if  {</option>
          <option value="elseif">} else if  {</option>
          <option value="else">} else  {</option>
          <option value="close">}  (close statement)</option>
        </select>
      </div>
      <div class="icf-condition-fields" id="icf-condition-fields">
        <div class="icf-type-row">
          <label class="icf-label">Condition type:</label>
          <select class="icf-select" id="icf-type">
            <option value="dataDriven">Data Driven (Excel/variable)</option>
            <option value="elementExists">Element exists on page</option>
            <option value="elementVisible">Element is visible</option>
            <option value="textContains">Element text contains</option>
          </select>
        </div>
        <div class="icf-data-driven-row" id="icf-data-driven-row">
          <div class="icf-field">
            <label class="icf-label">Variable name:</label>
            <input type="text" class="icf-input" id="icf-variable" placeholder="e.g. title, status, category" />
          </div>
          <div class="icf-field">
            <label class="icf-label">Operator:</label>
            <select class="icf-select" id="icf-operator">
              <option value="==">equals (==)</option>
              <option value="!=">not equals (!=)</option>
              <option value="contains">contains</option>
              <option value="startsWith">starts with</option>
            </select>
          </div>
          <div class="icf-field">
            <label class="icf-label">Expected value:</label>
            <input type="text" class="icf-input" id="icf-value" placeholder="e.g. MR, Pending, Active" />
          </div>
        </div>
        <div class="icf-element-row" id="icf-element-row" style="display:none;">
          <div class="icf-field">
            <label class="icf-label">Element locator:</label>
            <input type="text" class="icf-input" id="icf-locator" placeholder="//button[@id='submit']" />
          </div>
          <div class="icf-field" id="icf-text-value-field" style="display:none;">
            <label class="icf-label">Text value:</label>
            <input type="text" class="icf-input" id="icf-text-value" placeholder="Expected text" />
          </div>
        </div>
      </div>
      <div class="icf-actions">
        <button class="primary-btn icf-add-btn" id="icf-add-btn">Add Statement</button>
        <button class="secondary-btn icf-cancel-btn" id="icf-cancel-btn">Cancel</button>
      </div>
    `;

    // Toggle condition fields based on statement type
    const statementSelect = form.querySelector('#icf-statement');
    const conditionFields = form.querySelector('#icf-condition-fields');

    statementSelect.addEventListener('change', () => {
      if (statementSelect.value === 'else' || statementSelect.value === 'close') {
        conditionFields.style.display = 'none';
      } else {
        conditionFields.style.display = 'block';
      }
    });

    // Toggle between data-driven and element-based
    const typeSelect = form.querySelector('#icf-type');
    const dataDrivenRow = form.querySelector('#icf-data-driven-row');
    const elementRow = form.querySelector('#icf-element-row');
    const textValueField = form.querySelector('#icf-text-value-field');

    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'dataDriven') {
        dataDrivenRow.style.display = 'block';
        elementRow.style.display = 'none';
      } else {
        dataDrivenRow.style.display = 'none';
        elementRow.style.display = 'block';
        textValueField.style.display = typeSelect.value === 'textContains' ? 'block' : 'none';
      }
    });

    // Add button
    form.querySelector('#icf-add-btn').addEventListener('click', () => {
      this.createConditionBlock(afterEventId, form);
    });

    // Cancel
    form.querySelector('#icf-cancel-btn').addEventListener('click', () => {
      form.remove();
    });

    itemElement.after(form);
  }

  createConditionBlock(afterEventId, formElement) {
    const statement = formElement.querySelector('#icf-statement').value;
    const type = formElement.querySelector('#icf-type').value;
    const variable = formElement.querySelector('#icf-variable').value.trim();
    const operator = formElement.querySelector('#icf-operator').value;
    const value = formElement.querySelector('#icf-value').value.trim();
    const locator = formElement.querySelector('#icf-locator').value.trim();
    const textValue = formElement.querySelector('#icf-text-value').value.trim();

    // Validation — skip for 'else' and 'close' since they have no condition
    if (statement !== 'else' && statement !== 'close') {
      if (type === 'dataDriven' && (!variable || !value)) {
        alert('Please provide both variable name and expected value.');
        return;
      }
      if (type !== 'dataDriven' && !locator) {
        alert('Please provide an element locator.');
        return;
      }
    }

    // Build the block/marker
    const block = {
      id: 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      type: 'block',
      blockType: 'condition',
      config: {
        statement: statement, // 'if' | 'elseif' | 'else' | 'close'
        conditionType: (statement === 'else' || statement === 'close') ? statement : type,
        variable: variable,
        operator: operator,
        value: value,
        locator: locator,
        textValue: textValue,
        check: (statement === 'else' || statement === 'close') ? statement : (type === 'dataDriven' ? 'dataDriven' : type),
      },
      branches: {
        then: [],
        else: [],
      },
      timestamp: Date.now(),
    };

    // Insert at position
    const idx = this.events.findIndex(e => (e.id || e.timestamp) === afterEventId);
    if (idx !== -1) {
      this.events.splice(idx + 1, 0, block);
    } else {
      this.events.push(block);
    }

    // Sync to service worker
    this.sendMessage('REORDER_EVENTS', { events: this.events });

    // Remove form and re-render
    formElement.remove();
    this.renderTimeline(this.events);
    this.updateStats();
  }

  closeActiveBlock() {
    this.activeBlockId = null;
    this.renderTimeline(this.events);
  }

  insertBlockAt(afterEventId, blockType) {
    // Store the target position for when the block is completed
    this._insertAfterEventId = afterEventId;

    // Trigger the appropriate wizard
    if (window.controlFlowCtrl) {
      window.controlFlowCtrl.ensureRecording().then(ok => {
        if (ok) window.controlFlowCtrl.showWizard(blockType === 'tableSelect' ? 'table' : blockType);
      });
    }
  }

  moveEvent(eventId, direction) {
    const index = this.events.findIndex((e) => (e.id || e.timestamp) === eventId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.events.length) return;

    // Swap in the data array
    const temp = this.events[index];
    this.events[index] = this.events[targetIndex];
    this.events[targetIndex] = temp;

    // Re-render the timeline
    this.renderTimeline(this.events);

    // Also update the service worker's events array
    this.sendMessage('REORDER_EVENTS', { events: this.events });
  }

  deleteEvent(eventId, itemElement) {
    // Remove from events array
    this.events = this.events.filter((e) => (e.id || e.timestamp) !== eventId);
    // Remove from DOM
    if (itemElement) itemElement.remove();
    // Update stats
    this.updateStats();
    // Re-number steps
    const items = document.querySelectorAll('.timeline-item .timeline-step');
    items.forEach((el, i) => { el.textContent = i + 1; });
    // Show empty state if no events left
    if (this.events.length === 0) {
      const list = document.getElementById('timeline-list');
      list.innerHTML = '<div class="empty-state">No events recorded yet.</div>';
    }
  }

  updateStats() {
    document.getElementById('stat-total').textContent = this.events.length;
    const urls = [...new Set(this.events.map((e) => e.tabUrl).filter(Boolean))];
    document.getElementById('stat-pages').textContent = urls.length;
    if (this.events.length > 0) {
      const first = this.events[0].timestamp;
      const last = this.events[this.events.length - 1].timestamp;
      document.getElementById('stat-duration').textContent = this.formatDuration(last - first);
    }
  }

  renderNetworkLogs(logs) {
    const list = document.getElementById('network-list');
    if (!logs || logs.length === 0) {
      list.innerHTML = '<div class="empty-state">No network activity captured.</div>';
      return;
    }
    list.innerHTML = '';
    logs.forEach((log) => {
      const item = document.createElement('div');
      item.className = 'network-item';
      const sc = log.statusCode && log.statusCode < 400 ? 'ok' : 'error';
      item.innerHTML = '<span class="network-method">' + (log.method || 'GET') + '</span>'
        + '<span class="network-url" title="' + log.url + '">' + log.url + '</span>'
        + '<span class="network-status ' + sc + '">' + (log.statusCode || '-') + '</span>'
        + '<span>' + (log.responseTime ? log.responseTime + 'ms' : '-') + '</span>';
      list.appendChild(item);
    });
  }

  renderRecordings(recordings) {
    const list = document.getElementById('recordings-list');
    if (!recordings || recordings.length === 0) {
      list.innerHTML = '<div class="empty-state">No saved recordings.</div>';
      return;
    }
    list.innerHTML = '';
    recordings.forEach((rec) => {
      const card = document.createElement('div');
      card.className = 'recording-card';
      card.innerHTML = '<div class="recording-info"><span class="recording-name">'
        + (rec.name || rec.id) + '</span><span class="recording-meta">'
        + (rec.createdAt || '-') + '</span></div>';
      list.appendChild(card);
    });
  }

  initExport() {
    document.querySelectorAll('.export-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.generateExport(btn.getAttribute('data-format')));
    });
  }

  generateExport(format) {
    const preview = document.getElementById('export-preview-code');
    if (this.events.length === 0) {
      preview.textContent = 'No events to export. Record some actions first.';
      return;
    }
    let code = '';
    switch (format) {
      case 'selenium': code = this.toSelenium(); break;
      case 'selenium-pom': code = this.toSeleniumPOM(); break;
      case 'playwright': code = this.toPlaywright(); break;
      case 'playwright-pom': code = this.toPlaywrightPOM(); break;
      case 'cypress': code = this.toCypress(); break;
      case 'robot': code = this.toRobot(); break;
      case 'json': code = JSON.stringify(this.events, null, 2); break;
      case 'csv': code = this.toCsv(); break;
      default: code = JSON.stringify(this.events, null, 2);
    }
    preview.textContent = code;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const ext = { json: 'json', csv: 'csv', selenium: 'java', 'selenium-pom': 'java', playwright: 'js', 'playwright-pom': 'js', cypress: 'js', robot: 'robot' };
    chrome.downloads.download({ url, filename: 'kiro_export.' + (ext[format] || 'txt'), saveAs: true });
    URL.revokeObjectURL(url);
  }

  toSelenium() {
    let c = 'import org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\nimport java.util.List;\n\n';
    c += 'public class KiroTest {\n  public static void main(String[] args) {\n';
    c += '    WebDriver driver = new ChromeDriver();\n';
    var indentLevel = 1;
    this.events.forEach((e) => {
      if (e.type === 'block' && e.blockType === 'condition') {
        const stmt = e.config.statement || 'if';
        if (stmt === 'close') {
          indentLevel--;
          c += '    '.repeat(indentLevel) + '}\n';
        } else if (stmt === 'else') {
          indentLevel--;
          c += '    '.repeat(indentLevel) + '} else {\n';
          indentLevel++;
        } else if (stmt === 'elseif') {
          indentLevel--;
          c += '    '.repeat(indentLevel) + '} else if (' + this.buildJavaCondition(e.config) + ') {\n';
          indentLevel++;
        } else {
          c += '    '.repeat(indentLevel) + 'if (' + this.buildJavaCondition(e.config) + ') {\n';
          indentLevel++;
        }
      } else {
        c += this.renderEventSelenium(e, '    '.repeat(indentLevel));
      }
    });
    c += '    driver.quit();\n  }\n}';
    return c;
  }

  renderEventSelenium(e, indent) {
    if (e.type === 'block') return this.renderBlockSelenium(e, indent);
    let c = '';
    const loc = e.locators && e.locators.recommended;
    if (!loc && e.eventType !== 'navigation') return '';
    const by = loc ? (loc.strategy === 'id' ? 'By.id("' + loc.value + '")' :
      loc.strategy === 'name' ? 'By.name("' + loc.value + '")' :
      loc.strategy === 'css' ? 'By.cssSelector("' + loc.value + '")' :
      'By.xpath("' + loc.value + '")') : '';
    if (e.eventType === 'click') c = indent + 'driver.findElement(' + by + ').click();\n';
    else if (e.eventType === 'type') c = indent + 'driver.findElement(' + by + ').sendKeys("' + (e.value || '') + '");\n';
    else if (e.eventType === 'keypress') c = indent + 'driver.findElement(' + by + ').sendKeys(Keys.' + (e.key || '').toUpperCase() + ');\n';
    else if (e.eventType === 'shortcut') c = indent + '// Shortcut: ' + (e.combination || '') + '\n';
    else if (e.eventType === 'navigation') c = indent + 'driver.get("' + (e.tabUrl || e.url) + '");\n';
    return c;
  }

  renderBlockSelenium(block, indent) {
    let c = '';
    const cfg = block.config;
    if (block.blockType === 'condition') {
      const statement = cfg.statement || 'if';

      if (statement === 'close') {
        // Close bracket
        c += indent + '}\n';
      } else if (statement === 'else') {
        // else with no condition
        c += indent + '} else {\n';
      } else if (statement === 'elseif') {
        // else if with condition
        if (cfg.conditionType === 'dataDriven' || cfg.check === 'dataDriven') {
          const varName = cfg.variable || 'variable';
          const op = cfg.operator || '==';
          const val = cfg.value || '';
          let condExpr = '';
          if (op === '==' || op === 'equals') condExpr = 'data.get("' + varName + '").equals("' + val + '")';
          else if (op === '!=' || op === 'notEquals') condExpr = '!data.get("' + varName + '").equals("' + val + '")';
          else if (op === 'contains') condExpr = 'data.get("' + varName + '").contains("' + val + '")';
          else if (op === 'startsWith') condExpr = 'data.get("' + varName + '").startsWith("' + val + '")';
          else condExpr = 'data.get("' + varName + '").equals("' + val + '")';
          c += indent + '} else if (' + condExpr + ') {\n';
        } else {
          c += indent + '} else if (driver.findElements(By.xpath("' + (cfg.locator || '') + '")).size() > 0) {\n';
        }
      } else {
        // if with condition
        if (cfg.conditionType === 'dataDriven' || cfg.check === 'dataDriven') {
          const varName = cfg.variable || 'variable';
          const op = cfg.operator || '==';
          const val = cfg.value || '';
          let condExpr = '';
          if (op === '==' || op === 'equals') condExpr = 'data.get("' + varName + '").equals("' + val + '")';
          else if (op === '!=' || op === 'notEquals') condExpr = '!data.get("' + varName + '").equals("' + val + '")';
          else if (op === 'contains') condExpr = 'data.get("' + varName + '").contains("' + val + '")';
          else if (op === 'startsWith') condExpr = 'data.get("' + varName + '").startsWith("' + val + '")';
          else condExpr = 'data.get("' + varName + '").equals("' + val + '")';
          c += indent + 'if (' + condExpr + ') {\n';
        } else {
          if (cfg.check === 'textContains') {
            c += indent + 'if (driver.findElement(By.xpath("' + cfg.locator + '")).getText().contains("' + (cfg.textValue || cfg.value || '') + '")) {\n';
          } else {
            c += indent + 'if (driver.findElements(By.xpath("' + (cfg.locator || '') + '")).size() > 0) {\n';
          }
        }
      }
    } else if (block.blockType === 'loop') {
      const itemPath = cfg.container + '/' + (cfg.itemLocator || '*').replace(/^\.\//, '');
      c += indent + '// LOOP: ' + (cfg.loopType || 'findMatch') + '\n';
      if (cfg.loopType === 'repeatN') {
        c += indent + 'for (int i = 0; i < ' + (cfg.count || 5) + '; i++) {\n';
        (block.branches.body || []).forEach(s => { c += this.renderEventSelenium(s, indent + '    '); });
        c += indent + '}\n';
      } else {
        c += indent + 'List<WebElement> items = driver.findElements(By.xpath("' + itemPath + '"));\n';
        c += indent + 'for (WebElement item : items) {\n';
        if (cfg.match && cfg.match.value) {
          const op = this.getJavaCompare(cfg.match.operator, 'text', cfg.match.value);
          c += indent + '    String text = item.findElement(By.xpath("' + (cfg.match.elementLocator || '.') + '")).getText();\n';
          c += indent + '    if (' + op + ') {\n';
          (block.branches.body || []).forEach(s => { c += this.renderEventSelenium(s, indent + '        '); });
          if (cfg.action !== 'allMatches') c += indent + '        break;\n';
          c += indent + '    }\n';
        } else {
          (block.branches.body || []).forEach(s => { c += this.renderEventSelenium(s, indent + '    '); });
        }
        c += indent + '}\n';
      }
      if (block.branches.noMatch && block.branches.noMatch.length > 0) {
        c += indent + '// No match fallback\n';
        block.branches.noMatch.forEach(s => { c += this.renderEventSelenium(s, indent); });
      }
    } else if (block.blockType === 'tableSelect') {
      const rowPath = cfg.tableLocator + '/' + (cfg.rowLocator || './/tbody/tr').replace(/^\.\//, '');
      c += indent + '// TABLE SELECT\n';
      c += indent + 'List<WebElement> rows = driver.findElements(By.xpath("' + rowPath + '"));\n';
      c += indent + 'for (WebElement row : rows) {\n';
      const conds = (cfg.criteria || []).map(cr => {
        return this.getJavaCompare(cr.operator, 'row.findElement(By.xpath("' + cr.columnLocator + '")).getText()', cr.value);
      });
      const logic = cfg.logic === 'OR' ? ' || ' : ' && ';
      c += indent + '    if (' + (conds.join(logic) || 'true') + ') {\n';
      (block.branches.body || []).forEach(s => { c += this.renderEventSelenium(s, indent + '        '); });
      if (cfg.action !== 'allMatches') c += indent + '        break;\n';
      c += indent + '    }\n';
      c += indent + '}\n';
      if (block.branches.noMatch && block.branches.noMatch.length > 0) {
        c += indent + '// No match fallback\n';
        block.branches.noMatch.forEach(s => { c += this.renderEventSelenium(s, indent); });
      }
    }
    return c;
  }

  getJavaCompare(operator, expr, value) {
    switch (operator) {
      case 'contains': return expr + '.contains("' + value + '")';
      case 'equals': return expr + '.equals("' + value + '")';
      case 'startsWith': return expr + '.startsWith("' + value + '")';
      case 'endsWith': return expr + '.endsWith("' + value + '")';
      case 'greaterThan': return 'Double.parseDouble(' + expr + '.replaceAll("[^0-9.]", "")) > ' + parseFloat(value);
      case 'lessThan': return 'Double.parseDouble(' + expr + '.replaceAll("[^0-9.]", "")) < ' + parseFloat(value);
      case 'notEquals': return '!' + expr + '.equals("' + value + '")';
      default: return expr + '.contains("' + value + '")';
    }
  }

  buildJavaCondition(cfg) {
    if (cfg.conditionType === 'dataDriven' || cfg.check === 'dataDriven') {
      const varName = cfg.variable || 'variable';
      const op = cfg.operator || '==';
      const val = cfg.value || '';
      if (op === '==' || op === 'equals') return 'data.get("' + varName + '").equals("' + val + '")';
      if (op === '!=' || op === 'notEquals') return '!data.get("' + varName + '").equals("' + val + '")';
      if (op === 'contains') return 'data.get("' + varName + '").contains("' + val + '")';
      if (op === 'startsWith') return 'data.get("' + varName + '").startsWith("' + val + '")';
      return 'data.get("' + varName + '").equals("' + val + '")';
    } else if (cfg.check === 'textContains') {
      return 'driver.findElement(By.xpath("' + cfg.locator + '")).getText().contains("' + (cfg.textValue || cfg.value || '') + '")';
    } else {
      return 'driver.findElements(By.xpath("' + (cfg.locator || '') + '")).size() > 0';
    }
  }

  toPlaywright() {
    let c = "const { test } = require('@playwright/test');\n\n";
    c += "test('Kiro Recorded Test', async ({ page }) => {\n";
    this.events.forEach((e) => { c += this.renderEventPlaywright(e, '  '); });
    c += '});\n';
    return c;
  }

  renderEventPlaywright(e, indent) {
    if (e.type === 'block') return this.renderBlockPlaywright(e, indent);
    let c = '';
    if (e.eventType === 'navigation') return indent + "await page.goto('" + (e.tabUrl || e.url) + "');\n";
    const loc = e.locators && e.locators.recommended;
    if (!loc) return '';
    const sel = loc.strategy === 'id' ? '#' + loc.value : loc.value;
    if (e.eventType === 'click') c = indent + "await page.locator('" + sel + "').click();\n";
    else if (e.eventType === 'type') c = indent + "await page.locator('" + sel + "').fill('" + (e.value || '') + "');\n";
    else if (e.eventType === 'select') c = indent + "await page.locator('" + sel + "').selectOption('" + (e.value || '') + "');\n";
    return c;
  }

  renderBlockPlaywright(block, indent) {
    let c = '';
    const cfg = block.config;
    if (block.blockType === 'condition') {
      const statement = cfg.statement || 'if';

      if (statement === 'close') {
        c += indent + '}\n';
      } else if (statement === 'else') {
        c += indent + '} else {\n';
      } else if (statement === 'elseif') {
        if (cfg.conditionType === 'dataDriven' || cfg.check === 'dataDriven') {
          const varName = cfg.variable || 'variable';
          const op = cfg.operator || '==';
          const val = cfg.value || '';
          let condExpr = '';
          if (op === '==' || op === 'equals') condExpr = "data.get('" + varName + "') === '" + val + "'";
          else if (op === '!=' || op === 'notEquals') condExpr = "data.get('" + varName + "') !== '" + val + "'";
          else if (op === 'contains') condExpr = "data.get('" + varName + "').includes('" + val + "')";
          else if (op === 'startsWith') condExpr = "data.get('" + varName + "').startsWith('" + val + "')";
          else condExpr = "data.get('" + varName + "') === '" + val + "'";
          c += indent + '} else if (' + condExpr + ') {\n';
        } else {
          c += indent + "} else if (await page.locator('" + (cfg.locator || '') + "').count() > 0) {\n";
        }
      } else {
        // if
        if (cfg.conditionType === 'dataDriven' || cfg.check === 'dataDriven') {
          const varName = cfg.variable || 'variable';
          const op = cfg.operator || '==';
          const val = cfg.value || '';
          let condExpr = '';
          if (op === '==' || op === 'equals') condExpr = "data.get('" + varName + "') === '" + val + "'";
          else if (op === '!=' || op === 'notEquals') condExpr = "data.get('" + varName + "') !== '" + val + "'";
          else if (op === 'contains') condExpr = "data.get('" + varName + "').includes('" + val + "')";
          else if (op === 'startsWith') condExpr = "data.get('" + varName + "').startsWith('" + val + "')";
          else condExpr = "data.get('" + varName + "') === '" + val + "'";
          c += indent + 'if (' + condExpr + ') {\n';
        } else {
          c += indent + "if (await page.locator('" + (cfg.locator || '') + "').count() > 0) {\n";
        }
      }
    } else if (block.blockType === 'loop') {
      c += indent + '}\n';
    } else if (block.blockType === 'loop') {
      c += indent + '// LOOP\n';
      if (cfg.loopType === 'repeatN') {
        c += indent + 'for (let i = 0; i < ' + (cfg.count || 5) + '; i++) {\n';
        (block.branches.body || []).forEach(s => { c += this.renderEventPlaywright(s, indent + '  '); });
        c += indent + '}\n';
      } else {
        const sel = cfg.container + ' ' + (cfg.itemLocator || '*').replace(/^\.\/\//, '');
        c += indent + "const items = page.locator('" + cfg.container + "').locator('" + (cfg.itemLocator || '*') + "');\n";
        c += indent + 'const count = await items.count();\n';
        c += indent + 'for (let i = 0; i < count; i++) {\n';
        c += indent + '  const item = items.nth(i);\n';
        if (cfg.match && cfg.match.value) {
          c += indent + "  const text = await item.locator('" + (cfg.match.elementLocator || '.') + "').textContent();\n";
          c += indent + '  if (' + this.getJsCompare('text', cfg.match.operator, cfg.match.value) + ') {\n';
          (block.branches.body || []).forEach(s => { c += this.renderEventPlaywright(s, indent + '    '); });
          if (cfg.action !== 'allMatches') c += indent + '    break;\n';
          c += indent + '  }\n';
        } else {
          (block.branches.body || []).forEach(s => { c += this.renderEventPlaywright(s, indent + '  '); });
        }
        c += indent + '}\n';
      }
    } else if (block.blockType === 'tableSelect') {
      c += indent + '// TABLE SELECT\n';
      c += indent + "const rows = page.locator('" + cfg.tableLocator + " " + (cfg.rowLocator || 'tbody tr').replace(/^\.\/\//, '') + "');\n";
      c += indent + 'const rowCount = await rows.count();\n';
      c += indent + 'for (let i = 0; i < rowCount; i++) {\n';
      c += indent + '  const row = rows.nth(i);\n';
      const checks = (cfg.criteria || []).map(cr => {
        const varName = 'col' + Math.random().toString(36).substr(2, 4);
        c += indent + "  const " + varName + " = await row.locator('" + cr.columnLocator + "').textContent();\n";
        return this.getJsCompare(varName, cr.operator, cr.value);
      });
      const logic = cfg.logic === 'OR' ? ' || ' : ' && ';
      c += indent + '  if (' + (checks.join(logic) || 'true') + ') {\n';
      (block.branches.body || []).forEach(s => { c += this.renderEventPlaywright(s, indent + '    '); });
      if (cfg.action !== 'allMatches') c += indent + '    break;\n';
      c += indent + '  }\n';
      c += indent + '}\n';
    }
    return c;
  }

  getJsCompare(varName, operator, value) {
    switch (operator) {
      case 'contains': return varName + ".includes('" + value + "')";
      case 'equals': return varName + ".trim() === '" + value + "'";
      case 'startsWith': return varName + ".startsWith('" + value + "')";
      case 'endsWith': return varName + ".endsWith('" + value + "')";
      case 'greaterThan': return 'parseFloat(' + varName + ".replace(/[^0-9.]/g, '')) > " + parseFloat(value);
      case 'lessThan': return 'parseFloat(' + varName + ".replace(/[^0-9.]/g, '')) < " + parseFloat(value);
      case 'notEquals': return varName + ".trim() !== '" + value + "'";
      default: return varName + ".includes('" + value + "')";
    }
  }

  toCypress() {
    let c = "describe('Kiro Recorded Test', () => {\n  it('executes recorded steps', () => {\n";
    this.events.forEach((e) => { c += this.renderEventCypress(e, '    '); });
    c += '  });\n});\n';
    return c;
  }

  renderEventCypress(e, indent) {
    if (e.type === 'block') return this.renderBlockCypress(e, indent);
    let c = '';
    if (e.eventType === 'navigation') return indent + "cy.visit('" + (e.tabUrl || e.url) + "');\n";
    const loc = e.locators && e.locators.recommended;
    if (!loc) return '';
    const sel = loc.strategy === 'id' ? '#' + loc.value : loc.value;
    if (e.eventType === 'click') c = indent + "cy.get('" + sel + "').click();\n";
    else if (e.eventType === 'type') c = indent + "cy.get('" + sel + "').type('" + (e.value || '') + "');\n";
    else if (e.eventType === 'select') c = indent + "cy.get('" + sel + "').select('" + (e.value || '') + "');\n";
    return c;
  }

  renderBlockCypress(block, indent) {
    let c = '';
    const cfg = block.config;
    if (block.blockType === 'condition') {
      c += indent + '// IF: ' + cfg.check + '\n';
      c += indent + "cy.get('body').then(($body) => {\n";
      c += indent + "  if ($body.find('" + cfg.locator + "').length > 0) {\n";
      (block.branches.then || []).forEach(s => { c += this.renderEventCypress(s, indent + '    '); });
      if (block.branches.else && block.branches.else.length > 0) {
        c += indent + '  } else {\n';
        block.branches.else.forEach(s => { c += this.renderEventCypress(s, indent + '    '); });
      }
      c += indent + '  }\n';
      c += indent + '});\n';
    } else if (block.blockType === 'loop') {
      c += indent + '// LOOP\n';
      if (cfg.loopType === 'repeatN') {
        c += indent + 'for (let i = 0; i < ' + (cfg.count || 5) + '; i++) {\n';
        (block.branches.body || []).forEach(s => { c += this.renderEventCypress(s, indent + '  '); });
        c += indent + '}\n';
      } else {
        c += indent + "cy.get('" + cfg.container + " " + (cfg.itemLocator || '*').replace(/^\.\/\//, '') + "').each(($item) => {\n";
        if (cfg.match && cfg.match.value) {
          c += indent + "  const text = $item.find('" + (cfg.match.elementLocator || '').replace(/^\.\/\//, '') + "').text();\n";
          c += indent + "  if (text.includes('" + cfg.match.value + "')) {\n";
          c += indent + '    cy.wrap($item).click();\n';
          if (cfg.action !== 'allMatches') c += indent + '    return false; // break\n';
          c += indent + '  }\n';
        } else {
          (block.branches.body || []).forEach(s => { c += this.renderEventCypress(s, indent + '  '); });
        }
        c += indent + '});\n';
      }
    } else if (block.blockType === 'tableSelect') {
      const rowSel = (cfg.tableLocator + ' ' + (cfg.rowLocator || 'tbody tr').replace(/^\.\/\//, '')).trim();
      c += indent + '// TABLE SELECT\n';
      c += indent + "cy.get('" + rowSel + "').each(($row) => {\n";
      const checks = (cfg.criteria || []).map(cr => {
        return "$row.find('" + cr.columnLocator.replace(/^\.\/\//, '') + "').text().includes('" + cr.value + "')";
      });
      const logic = cfg.logic === 'OR' ? ' || ' : ' && ';
      c += indent + '  if (' + (checks.join(logic) || 'true') + ') {\n';
      (block.branches.body || []).forEach(s => { c += this.renderEventCypress(s, indent + '    '); });
      if (cfg.action !== 'allMatches') c += indent + '    return false; // break\n';
      c += indent + '  }\n';
      c += indent + '});\n';
    }
    return c;
  }

  toRobot() {
    let c = '*** Settings ***\nLibrary    SeleniumLibrary\nLibrary    Collections\n\n*** Test Cases ***\nKiro Recorded Test\n';
    this.events.forEach((e) => { c += this.renderEventRobot(e, '    '); });
    return c;
  }

  renderEventRobot(e, indent) {
    if (e.type === 'block') return this.renderBlockRobot(e, indent);
    let c = '';
    if (e.eventType === 'navigation') return indent + 'Go To    ' + (e.tabUrl || e.url) + '\n';
    const loc = e.locators && e.locators.recommended;
    if (!loc) return '';
    const l = loc.strategy === 'id' ? 'id:' + loc.value : 'xpath:' + loc.value;
    if (e.eventType === 'click') c = indent + 'Click Element    ' + l + '\n';
    else if (e.eventType === 'type') c = indent + 'Input Text    ' + l + '    ' + (e.value || '') + '\n';
    else if (e.eventType === 'select') c = indent + 'Select From List By Label    ' + l + '    ' + (e.value || '') + '\n';
    return c;
  }

  renderBlockRobot(block, indent) {
    let c = '';
    const cfg = block.config;
    if (block.blockType === 'condition') {
      c += indent + '# IF: ' + cfg.check + '\n';
      c += indent + '${exists}=    Run Keyword And Return Status    Page Should Contain Element    xpath:' + cfg.locator + '\n';
      c += indent + 'IF    ${exists}\n';
      (block.branches.then || []).forEach(s => { c += this.renderEventRobot(s, indent + '    '); });
      if (block.branches.else && block.branches.else.length > 0) {
        c += indent + 'ELSE\n';
        block.branches.else.forEach(s => { c += this.renderEventRobot(s, indent + '    '); });
      }
      c += indent + 'END\n';
    } else if (block.blockType === 'loop') {
      c += indent + '# LOOP\n';
      if (cfg.loopType === 'repeatN') {
        c += indent + 'FOR    ${i}    IN RANGE    ' + (cfg.count || 5) + '\n';
        (block.branches.body || []).forEach(s => { c += this.renderEventRobot(s, indent + '    '); });
        c += indent + 'END\n';
      } else {
        c += indent + '@{items}=    Get WebElements    xpath:' + cfg.container + '/' + (cfg.itemLocator || '*').replace(/^\.\//, '') + '\n';
        c += indent + 'FOR    ${item}    IN    @{items}\n';
        if (cfg.match && cfg.match.value) {
          c += indent + '    ${text}=    Get Text    ${item}\n';
          c += indent + "    IF    '" + cfg.match.value + "' in '${text}'\n";
          (block.branches.body || []).forEach(s => { c += this.renderEventRobot(s, indent + '        '); });
          c += indent + '        Exit For Loop\n';
          c += indent + '    END\n';
        } else {
          (block.branches.body || []).forEach(s => { c += this.renderEventRobot(s, indent + '    '); });
        }
        c += indent + 'END\n';
      }
    } else if (block.blockType === 'tableSelect') {
      c += indent + '# TABLE SELECT\n';
      c += indent + '@{rows}=    Get WebElements    xpath:' + cfg.tableLocator + '/' + (cfg.rowLocator || './/tbody/tr').replace(/^\.\//, '') + '\n';
      c += indent + 'FOR    ${row}    IN    @{rows}\n';
      (cfg.criteria || []).forEach((cr, i) => {
        c += indent + '    ${col' + i + '}=    Get Text    ${row}//' + cr.columnLocator.replace(/^\.\/\//, '') + '\n';
      });
      const conds = (cfg.criteria || []).map((cr, i) => "'" + cr.value + "' in '${col" + i + "}'");
      c += indent + '    IF    ' + (conds.join(' and ') || 'True') + '\n';
      (block.branches.body || []).forEach(s => { c += this.renderEventRobot(s, indent + '        '); });
      c += indent + '        Exit For Loop\n';
      c += indent + '    END\n';
      c += indent + 'END\n';
    }
    return c;
  }

  toCsv() {
    let csv = 'Step,Event Type,Target,Value,URL,Timestamp\n';
    this.events.forEach((e, i) => {
      if (e.type === 'block') {
        csv += (i + 1) + ',"BLOCK:' + e.blockType + '","' + (e.config.locator || e.config.container || e.config.tableLocator || '') + '","","",\n';
        // Flatten branch steps
        Object.entries(e.branches || {}).forEach(([branch, steps]) => {
          steps.forEach((s, j) => {
            const t = (s.locators && s.locators.recommended && s.locators.recommended.value) || '';
            csv += '  ' + branch + '.' + (j + 1) + ',"' + (s.eventType || 'block') + '","' + t + '","' + (s.value || '') + '","' + (s.url || '') + '",' + (s.timestamp || '') + '\n';
          });
        });
      } else {
        const t = (e.locators && e.locators.recommended && e.locators.recommended.value) || '';
        csv += (i + 1) + ',"' + e.eventType + '","' + t + '","' + (e.value || '') + '","' + (e.url || '') + '",' + e.timestamp + '\n';
      }
    });
    return csv;
  }

  // ─── Page Object Model Helpers ─────────────────────────────────────

  groupEventsByPage(events) {
    const pages = [];
    let currentPage = null;
    let currentType = null; // 'nav', 'close', 'screen'

    events.forEach((e) => {
      // Block events (if/else/loop/table markers) stay in the current page — don't split
      if (e.type === 'block') {
        if (currentPage) {
          currentPage.events.push(e);
        } else {
          // Edge case: block before any page exists — create a default page
          currentPage = {
            title: 'Screen',
            url: '',
            events: [e],
            isNavigation: false,
            isMenuClose: false,
          };
          pages.push(currentPage);
          currentType = 'screen';
        }
        return;
      }

      var type = 'screen';
      if (e.isDashboardNav) type = 'nav';
      else if (e.isDashboardClose) type = 'close';

      const title = (type === 'nav') ? 'Dashboard' :
                    (type === 'close') ? 'DashboardClose' :
                    (e.pageTitle || e.tabTitle || 'Screen');

      // Split when type changes or screen title changes
      var isNewPage = false;
      if (!currentPage) {
        isNewPage = true;
      } else if (type !== currentType) {
        isNewPage = true;
      } else if (type === 'screen' && currentPage.title !== title) {
        isNewPage = true;
      }

      if (isNewPage) {
        currentPage = {
          title: title,
          url: e.tabUrl || e.url || '',
          events: [],
          isNavigation: (type === 'nav'),
          isMenuClose: (type === 'close'),
        };
        pages.push(currentPage);
        currentType = type;
      }

      currentPage.events.push(e);
    });

    return pages;
  }

  toClassName(title) {
    if (!title) return 'UnknownPage';
    // Remove special chars, convert to PascalCase
    return title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('') + 'Page';
  }

  toFieldName(locators) {
    if (!locators) return 'element';

    // Priority: labelText > name > ariaLabel > placeholder > title > extract from XPath
    let labelText = locators.labelText || null;

    if (!labelText) {
      labelText = this.extractLabelFromXPath(locators.relativeXPath);
    }
    if (!labelText) {
      // Use name attribute if meaningful (not numeric)
      const name = locators.name;
      if (name && !name.match(/^\d+$/)) {
        labelText = name;
      }
    }
    if (!labelText) {
      labelText = locators.ariaLabel || locators.placeholder || locators.title || null;
    }

    // If we have a label, convert to camelCase field name
    if (labelText) {
      return labelText
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('');
    }

    // Fallback
    const raw = locators.id || locators.name || 'element';
    return raw
      .replace(/[^a-zA-Z0-9_]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  extractLabelFromXPath(xpath) {
    if (!xpath) return null;
    // Extract text from patterns like: //tr[.//span[contains(text(),'Nom de famille')]]//input
    const match = xpath.match(/contains\(text\(\)[,]\s*'([^']+)'\)/);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Also try: //a[contains(text(),'Rechercher doublons')]
    const match2 = xpath.match(/contains\(text\(\)[,]\s*"([^"]+)"\)/);
    if (match2 && match2[1]) {
      return match2[1].trim();
    }
    return null;
  }

  getByLocator(locators) {
    if (!locators) return 'By.xpath("//*")';
    // Prefer XPath
    if (locators.relativeXPath) return 'By.xpath("' + locators.relativeXPath + '")';
    if (locators.absoluteXPath) return 'By.xpath("' + locators.absoluteXPath + '")';
    if (locators.id) return 'By.xpath("//*[@id=\'' + locators.id + '\']")';
    if (locators.name) return 'By.xpath("//*[@name=\'' + locators.name + '\']")';
    if (locators.recommended) {
      const r = locators.recommended;
      if (r.strategy === 'xpath') return 'By.xpath("' + r.value + '")';
      if (r.strategy === 'id') return 'By.xpath("//*[@id=\'' + r.value + '\']")';
      if (r.strategy === 'name') return 'By.xpath("//*[@name=\'' + r.value + '\']")';
      return 'By.xpath("' + (locators.relativeXPath || r.value) + '")';
    }
    return 'By.xpath("//*")';
  }

  // ─── Selenium Java POM ─────────────────────────────────────────────

  toSeleniumPOM() {
    const pages = this.groupEventsByPage(this.events);
    let output = '';

    // Generate DashboardPage class (contains all navigation methods)
    output += this.generateDashboardPageClass(pages);
    output += '\n\n';

    // Generate Page Classes for actual screens (have #optionTitle)
    pages.forEach((page) => {
      if (page.isNavigation || page.isMenuClose) return;
      const className = this.toClassName(page.title);
      output += this.generateSeleniumPageClass(className, page);
      output += '\n\n';
    });

    // Generate Test Class
    output += this.generateSeleniumTestClass(pages);

    return output;
  }

  generateDashboardPageClass(pages) {
    let c = '';
    c += 'import org.openqa.selenium.By;\n';
    c += 'import org.openqa.selenium.WebDriver;\n\n';
    c += '/**\n * Dashboard Page - Contains all menu opening and closing methods\n */\n';
    c += 'public class DashboardPage {\n\n';
    c += '    private WebDriver driver;\n\n';

    // Collect all menu click events (both opening and closing)
    var openingMethods = [];
    var closingMethods = [];
    var self = this;

    for (var i = 0; i < pages.length; i++) {
      if (!pages[i].isNavigation && !pages[i].isMenuClose) continue;

      var clicks = [];
      pages[i].events.forEach(function(e) {
        if (!e.locators || e.eventType !== 'click') return;
        var xpath = (e.locators.recommended && e.locators.recommended.value) || e.locators.relativeXPath || '';
        if (!xpath) return;
        var menuName = (e.locators.text && e.locators.text.length < 40) ? e.locators.text :
                       (e.locators.labelText || self.extractLabelFromXPath(xpath) || 'menu');
        clicks.push({ xpath: xpath, menuName: menuName });
      });

      if (clicks.length === 0) continue;

      if (pages[i].isNavigation) {
        // Find target screen for naming
        var targetScreen = null;
        for (var j = i + 1; j < pages.length; j++) {
          if (!pages[j].isNavigation && !pages[j].isMenuClose) {
            targetScreen = pages[j].title;
            break;
          }
        }
        if (targetScreen) {
          openingMethods.push({ targetScreen: targetScreen, clicks: clicks });
        }
      } else if (pages[i].isMenuClose) {
        // Last click in close sequence = the menu name for closing method
        var lastClick = clicks[clicks.length - 1];
        closingMethods.push({ lastMenuName: lastClick.menuName, clicks: clicks });
      }
    }

    // Generate String variables for all menu XPaths
    var addedVars = new Set();
    var allMethods = openingMethods.concat(closingMethods);
    allMethods.forEach(function(method) {
      method.clicks.forEach(function(click) {
        var varName = click.menuName
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .split(/\s+/)
          .filter(function(w) { return w.length > 0; })
          .map(function(w, i) { return i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
          .join('') + 'Menu';
        click.varName = varName;
        if (!addedVars.has(varName)) {
          c += '    private String ' + varName + ' = "' + click.xpath + '";\n';
          addedVars.add(varName);
        }
      });
    });

    c += '\n';

    // Constructor
    c += '    public DashboardPage(WebDriver driver) {\n';
    c += '        this.driver = driver;\n';
    c += '    }\n\n';

    // Generate opening<ScreenName>() methods (odd clicks - not divisible by 2)
    var addedOpenMethods = new Set();
    openingMethods.forEach(function(nav) {
      var methodName = self.toClassName(nav.targetScreen).replace('Page', '');
      if (addedOpenMethods.has(methodName)) return;
      addedOpenMethods.add(methodName);

      c += '    public void opening' + methodName + '() {\n';
      nav.clicks.forEach(function(click) {
        c += '        driver.findElement(By.xpath(' + click.varName + ')).click();\n';
      });
      c += '    }\n\n';
    });

    // Generate closing<LastMenuName>() methods (even clicks - divisible by 2)
    var addedCloseMethods = new Set();
    closingMethods.forEach(function(cm) {
      var closeMethodName = cm.lastMenuName
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter(function(w) { return w.length > 0; })
        .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); })
        .join('');
      if (addedCloseMethods.has(closeMethodName)) return;
      addedCloseMethods.add(closeMethodName);

      c += '    public void closing' + closeMethodName + '() {\n';
      cm.clicks.forEach(function(click) {
        c += '        driver.findElement(By.xpath(' + click.varName + ')).click();\n';
      });
      c += '    }\n\n';
    });

    c += '}\n';
    return c;
  }

  generateSeleniumPageClass(className, page) {
    let c = '';
    c += 'import org.openqa.selenium.By;\n';
    c += 'import org.openqa.selenium.WebDriver;\n';
    c += 'import org.openqa.selenium.support.ui.Select;\n\n';
    c += '/**\n * Page Object: ' + page.title + '\n * URL: ' + page.url + '\n */\n';
    c += 'public class ' + className + ' {\n\n';
    c += '    private WebDriver driver;\n\n';

    // Collect unique elements with their event type
    const elements = new Map();
    page.events.forEach((e) => {
      if (e.type === 'block') return; // Skip control flow markers
      if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
      const fieldName = this.toFieldName(e.locators);
      if (!elements.has(fieldName)) {
        elements.set(fieldName, { locators: e.locators, eventType: e.eventType });
      }
    });

    // Generate String variables with XPath for each field
    // Use "Dropdown" suffix for select, "Field" suffix for text inputs
    elements.forEach((data, fieldName) => {
      let xpathValue = data.locators.relativeXPath || data.locators.absoluteXPath || '';
      if (!xpathValue && data.locators.id) xpathValue = "//*[@id='" + data.locators.id + "']";
      if (!xpathValue && data.locators.name) xpathValue = "//*[@name='" + data.locators.name + "']";

      if (data.eventType === 'select') {
        c += '    private String ' + fieldName + 'Dropdown = "' + xpathValue + '";\n';
      } else if (data.eventType === 'checkbox' || data.eventType === 'radio') {
        c += '    private String ' + fieldName + 'Field = "' + xpathValue + '";\n';
      } else {
        c += '    private String ' + fieldName + 'Field = "' + xpathValue + '";\n';
      }
    });

    c += '\n';

    // Constructor
    c += '    public ' + className + '(WebDriver driver) {\n';
    c += '        this.driver = driver;\n';
    c += '    }\n\n';

    // Generate action methods based on event type
    const addedMethods = new Set();
    page.events.forEach((e) => {
      if (e.type === 'block') return; // Skip control flow markers
      if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
      const fieldName = this.toFieldName(e.locators);
      const methodKey = e.eventType + '_' + fieldName;
      if (addedMethods.has(methodKey)) return;
      addedMethods.add(methodKey);

      const capitalField = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

      if (e.eventType === 'type') {
        // Text input - entering<FieldName>()
        c += '    public void entering' + capitalField + '(String value) {\n';
        c += '        driver.findElement(By.xpath(' + fieldName + 'Field)).clear();\n';
        c += '        driver.findElement(By.xpath(' + fieldName + 'Field)).sendKeys(value);\n';
        c += '    }\n\n';
      } else if (e.eventType === 'select') {
        // Dropdown - selecting<FieldName>()
        c += '    public void selecting' + capitalField + '(String value) {\n';
        c += '        new Select(driver.findElement(By.xpath(' + fieldName + 'Dropdown)))\n';
        c += '            .selectByVisibleText(value);\n';
        c += '    }\n\n';
      } else if (e.eventType === 'checkbox') {
        // Checkbox - checking<FieldName>()
        c += '    public void checking' + capitalField + '() {\n';
        c += '        driver.findElement(By.xpath(' + fieldName + 'Field)).click();\n';
        c += '    }\n\n';
      } else if (e.eventType === 'radio') {
        // Radio - selecting<FieldName>()
        c += '    public void selecting' + capitalField + '() {\n';
        c += '        driver.findElement(By.xpath(' + fieldName + 'Field)).click();\n';
        c += '    }\n\n';
      } else if (e.eventType === 'click') {
        // Click - clicking<FieldName>()
        c += '    public void clicking' + capitalField + '() {\n';
        c += '        driver.findElement(By.xpath(' + fieldName + 'Field)).click();\n';
        c += '    }\n\n';
      }
    });

    c += '}\n';
    return c;
  }

  generateSeleniumTestClass(pages) {
    let c = '';
    c += 'import org.openqa.selenium.By;\n';
    c += 'import org.openqa.selenium.WebDriver;\n';
    c += 'import org.openqa.selenium.chrome.ChromeDriver;\n';
    c += 'import org.testng.annotations.Test;\n';
    c += 'import org.testng.annotations.BeforeMethod;\n';
    c += 'import org.testng.annotations.AfterMethod;\n\n';
    c += '// ═══════════════════════════════════════════════════════════\n';
    c += '// TEST CLASS\n';
    c += '// ═══════════════════════════════════════════════════════════\n\n';
    c += 'public class KiroRecordedTest {\n\n';
    c += '    private WebDriver driver;\n\n';
    c += '    @BeforeMethod\n';
    c += '    public void setUp() {\n';
    c += '        driver = new ChromeDriver();\n';
    c += '        driver.manage().window().maximize();\n';
    c += '    }\n\n';
    c += '    @Test\n';
    c += '    public void testRecordedFlow() {\n';

    var driverGetDone = false;
    var dashboardCreated = false;

    pages.forEach((page, idx) => {
      const className = this.toClassName(page.title);
      const varName = className.charAt(0).toLowerCase() + className.slice(1);

      if (page.isNavigation) {
        // driver.get() only once at the very start
        if (!driverGetDone) {
          const navEvent = page.events.find(e => e.eventType === 'navigation' || e.eventType === 'pageload');
          if (navEvent) {
            c += '\n        driver.get("' + (navEvent.tabUrl || navEvent.url) + '");\n';
            driverGetDone = true;
          }
        }

        // Create DashboardPage object once
        if (!dashboardCreated) {
          c += '        DashboardPage dashboardPage = new DashboardPage(driver);\n';
          dashboardCreated = true;
        }

        // Find the next screen this navigation leads to and call opening method
        for (var j = idx + 1; j < pages.length; j++) {
          if (!pages[j].isNavigation && !pages[j].isMenuClose) {
            var targetMethodName = this.toClassName(pages[j].title).replace('Page', '');
            c += '        dashboardPage.opening' + targetMethodName + '();\n';
            break;
          }
        }

        // Handle any block events in this navigation page (e.g. if condition after menu)
        page.events.forEach((e) => {
          if (e.type === 'block' && e.blockType === 'condition') {
            const stmt = e.config.statement || 'if';
            if (stmt === 'close') {
              c += '        }\n';
            } else if (stmt === 'else') {
              c += '        } else {\n';
            } else if (stmt === 'elseif') {
              c += '        } else if (' + this.buildJavaCondition(e.config) + ') {\n';
            } else {
              c += '        if (' + this.buildJavaCondition(e.config) + ') {\n';
            }
          }
        });
      } else if (page.isMenuClose) {
        // Call closing method from same dashboardPage object
        if (!dashboardCreated) {
          c += '        DashboardPage dashboardPage = new DashboardPage(driver);\n';
          dashboardCreated = true;
        }
        var lastEvt = null;
        for (var k = page.events.length - 1; k >= 0; k--) {
          if (page.events[k].locators && page.events[k].eventType === 'click') {
            lastEvt = page.events[k]; break;
          }
        }
        if (lastEvt) {
          var txt = (lastEvt.locators.text && lastEvt.locators.text.length < 40) ? lastEvt.locators.text :
                    (lastEvt.locators.labelText || this.extractLabelFromXPath((lastEvt.locators.recommended && lastEvt.locators.recommended.value) || '') || 'Menu');
          var closeName = txt.replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(function(w){return w.length>0;}).map(function(w){return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();}).join('');
          c += '        dashboardPage.closing' + closeName + '();\n';
        }

        // Handle any block events in this close page
        page.events.forEach((e) => {
          if (e.type === 'block' && e.blockType === 'condition') {
            const stmt = e.config.statement || 'if';
            if (stmt === 'close') {
              c += '        }\n';
            } else if (stmt === 'else') {
              c += '        } else {\n';
            } else if (stmt === 'elseif') {
              c += '        } else if (' + this.buildJavaCondition(e.config) + ') {\n';
            } else {
              c += '        if (' + this.buildJavaCondition(e.config) + ') {\n';
            }
          }
        });
      } else {
        // Actual screen - use Page Object
        c += '\n        // --- Screen: ' + page.title + ' ---\n';
        c += '        ' + className + ' ' + varName + ' = new ' + className + '(driver);\n';
        var indentLevel = 2; // base indent: 2 levels (8 spaces)
        page.events.forEach((e) => {
          // Handle control flow blocks (bracket markers)
          if (e.type === 'block' && e.blockType === 'condition') {
            const stmt = e.config.statement || 'if';
            if (stmt === 'close') {
              indentLevel--;
              c += '    '.repeat(indentLevel) + '}\n';
            } else if (stmt === 'else') {
              indentLevel--;
              c += '    '.repeat(indentLevel) + '} else {\n';
              indentLevel++;
            } else if (stmt === 'elseif') {
              indentLevel--;
              const condExpr = this.buildJavaCondition(e.config);
              c += '    '.repeat(indentLevel) + '} else if (' + condExpr + ') {\n';
              indentLevel++;
            } else {
              // if
              const condExpr = this.buildJavaCondition(e.config);
              c += '    '.repeat(indentLevel) + 'if (' + condExpr + ') {\n';
              indentLevel++;
            }
            return;
          }
          if (e.type === 'block') {
            c += this.renderBlockSelenium(e, '    '.repeat(indentLevel));
            return;
          }
          if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
          const indent = '    '.repeat(indentLevel);
          const fieldName = this.toFieldName(e.locators);
          const methodName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
          if (e.eventType === 'click') {
            c += indent + varName + '.clicking' + methodName + '();\n';
          } else if (e.eventType === 'type') {
            c += indent + varName + '.entering' + methodName + '("' + (e.value || '') + '");\n';
          } else if (e.eventType === 'select') {
            c += indent + varName + '.selecting' + methodName + '("' + (e.selectedText || e.value || '') + '");\n';
          } else if (e.eventType === 'checkbox') {
            c += indent + varName + '.checking' + methodName + '();\n';
          } else if (e.eventType === 'radio') {
            c += indent + varName + '.selecting' + methodName + '();\n';
          }
        });
      }
    });

    c += '    }\n\n';
    c += '    @AfterMethod\n';
    c += '    public void tearDown() {\n';
    c += '        if (driver != null) driver.quit();\n';
    c += '    }\n';
    c += '}\n';
    return c;
  }

  // ─── Playwright POM ────────────────────────────────────────────────

  toPlaywrightPOM() {
    const pages = this.groupEventsByPage(this.events);
    let output = '';

    // Generate Page Classes
    pages.forEach((page) => {
      const className = this.toClassName(page.title);
      output += this.generatePlaywrightPageClass(className, page);
      output += '\n\n';
    });

    // Generate Test File
    output += this.generatePlaywrightTestFile(pages);

    return output;
  }

  generatePlaywrightPageClass(className, page) {
    let c = '';
    c += '// ═══════════════════════════════════════════════════════════\n';
    c += '// PAGE OBJECT: ' + page.title + '\n';
    c += '// URL: ' + page.url + '\n';
    c += '// ═══════════════════════════════════════════════════════════\n\n';
    c += 'class ' + className + ' {\n\n';
    c += '  constructor(page) {\n';
    c += '    this.page = page;\n';

    // Collect unique elements as locators
    const elements = new Map();
    page.events.forEach((e) => {
      if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
      const fieldName = this.toFieldName(e.locators);
      if (!elements.has(fieldName)) {
        elements.set(fieldName, e.locators);
      }
    });

    // Define locators in constructor
    elements.forEach((locators, fieldName) => {
      const sel = locators.id ? '#' + locators.id :
                  locators.name ? '[name="' + locators.name + '"]' :
                  locators.cssSelector || locators.relativeXPath || '*';
      c += "    this." + fieldName + " = page.locator('" + sel + "');\n";
    });

    c += '  }\n\n';

    // Generate action methods
    const addedMethods = new Set();
    page.events.forEach((e) => {
      if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
      const fieldName = this.toFieldName(e.locators);
      const methodKey = e.eventType + '_' + fieldName;
      if (addedMethods.has(methodKey)) return;
      addedMethods.add(methodKey);

      if (e.eventType === 'click') {
        c += '  async clickOn' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1) + '() {\n';
        c += '    await this.' + fieldName + '.click();\n';
        c += '  }\n\n';
      } else if (e.eventType === 'type') {
        c += '  async enterIn' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1) + '(value) {\n';
        c += '    await this.' + fieldName + '.fill(value);\n';
        c += '  }\n\n';
      } else if (e.eventType === 'select') {
        c += '  async selectFrom' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1) + '(option) {\n';
        c += '    await this.' + fieldName + '.selectOption(option);\n';
        c += '  }\n\n';
      }
    });

    c += '}\n\n';
    c += 'module.exports = { ' + className + ' };\n';
    return c;
  }

  generatePlaywrightTestFile(pages) {
    let c = '';
    c += '// ═══════════════════════════════════════════════════════════\n';
    c += '// TEST FILE\n';
    c += '// ═══════════════════════════════════════════════════════════\n\n';
    c += "const { test, expect } = require('@playwright/test');\n";

    pages.forEach((page) => {
      const className = this.toClassName(page.title);
      c += "const { " + className + " } = require('./" + className + "');\n";
    });

    c += "\n\ntest('Recorded Test Flow', async ({ page }) => {\n";

    pages.forEach((page) => {
      const className = this.toClassName(page.title);
      const varName = className.charAt(0).toLowerCase() + className.slice(1);

      c += '\n  // --- ' + page.title + ' ---\n';

      const navEvent = page.events.find(e => e.eventType === 'navigation' || e.eventType === 'pageload');
      if (navEvent) {
        c += "  await page.goto('" + (navEvent.tabUrl || navEvent.url) + "');\n";
      }

      c += '  const ' + varName + ' = new ' + className + '(page);\n';

      page.events.forEach((e) => {
        if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
        const fieldName = this.toFieldName(e.locators);
        const methodName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

        if (e.eventType === 'click') {
          c += '  await ' + varName + '.clickOn' + methodName + '();\n';
        } else if (e.eventType === 'type') {
          c += "  await " + varName + ".enterIn" + methodName + "('" + (e.value || '') + "');\n";
        } else if (e.eventType === 'select') {
          c += "  await " + varName + ".selectFrom" + methodName + "('" + (e.selectedText || e.value || '') + "');\n";
        }
      });
    });

    c += '});\n';
    return c;
  }

  initAI() {
    document.getElementById('btn-ai-generate').addEventListener('click', () => this.generateWithAI());
  }

  async generateWithAI() {
    const output = document.getElementById('ai-output');
    const format = document.getElementById('ai-format').value;
    if (this.events.length === 0) { output.textContent = 'No events recorded.'; return; }
    const settings = await this.sendMessage('GET_SETTINGS');
    if (!settings.aiEndpoint) {
      output.textContent = 'Configure AI Endpoint in Settings.\n\nFallback:\n\n' + this.localFallback(format);
      return;
    }
    output.textContent = 'Generating...';
    try {
      const resp = await fetch(settings.aiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (settings.aiApiKey || '') },
        body: JSON.stringify({ events: this.events, format }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      output.textContent = data.generated || data.output || JSON.stringify(data, null, 2);
    } catch (err) {
      output.textContent = 'AI failed: ' + err.message + '\n\nFallback:\n\n' + this.localFallback(format);
    }
  }

  localFallback(format) {
    if (format === 'manual') return this.toManual();
    if (format === 'gherkin') return this.toGherkin();
    if (format === 'selenium') return this.toSelenium();
    if (format === 'playwright') return this.toPlaywright();
    if (format === 'cypress') return this.toCypress();
    return JSON.stringify(this.events, null, 2);
  }

  toManual() {
    let t = 'TEST CASE: Kiro Recorded Test\n' + '='.repeat(40) + '\n\nSteps:\n';
    this.events.forEach((e, i) => {
      t += (i + 1) + '. ';
      if (e.eventType === 'navigation' || e.eventType === 'pageload') {
        t += 'Navigate to "' + (e.tabUrl || e.url) + '"';
      } else if (e.eventType === 'click') {
        t += 'Click on "' + this.getSimpleLabel(e) + '"';
      } else if (e.eventType === 'dblclick') {
        t += 'Double-click on "' + this.getSimpleLabel(e) + '"';
      } else if (e.eventType === 'type' || e.eventType === 'input') {
        t += 'Enter "' + (e.value || '') + '" in "' + this.getFieldLabel(e) + '" field';
      } else if (e.eventType === 'select') {
        t += 'Select "' + (e.selectedText || e.value) + '" from "' + this.getFieldLabel(e) + '" dropdown';
      } else if (e.eventType === 'checkbox') {
        t += (e.checked ? 'Check' : 'Uncheck') + ' "' + this.getFieldLabel(e) + '" checkbox';
      } else if (e.eventType === 'radio') {
        t += 'Select "' + (e.value || '') + '" radio button';
      } else if (e.eventType === 'submit') {
        t += 'Submit the form';
      } else if (e.eventType === 'keypress') {
        t += 'Press "' + (e.key || '') + '" key';
      } else if (e.eventType === 'shortcut') {
        t += 'Press keyboard shortcut "' + (e.combination || e.key || '') + '"';
      } else if (e.eventType === 'scroll') {
        t += 'Scroll ' + (e.direction || 'down') + ' on the page';
      } else if (e.eventType === 'fileUpload') {
        t += 'Upload file';
      } else if (e.eventType === 'tabSwitch') {
        t += 'Switch to tab "' + (e.tabTitle || e.tabUrl || '') + '"';
      } else if (e.eventType === 'newTab') {
        t += 'Open new tab';
      } else {
        t += e.eventType;
      }
      t += '\n';
    });
    t += '\nExpected Result: All steps execute successfully\n';
    return t;
  }

  getSimpleLabel(e) {
    if (!e.locators) return 'element';
    if (e.locators.text && e.locators.text.length < 40) return e.locators.text;
    if (e.locators.ariaLabel) return e.locators.ariaLabel;
    if (e.locators.title) return e.locators.title;
    if (e.locators.id) return e.locators.id;
    if (e.locators.name) return e.locators.name;
    if (e.locators.placeholder) return e.locators.placeholder;
    return e.locators.tagName || 'element';
  }

  getFieldLabel(e) {
    if (!e.locators) return 'field';
    if (e.locators.placeholder) return e.locators.placeholder;
    if (e.locators.ariaLabel) return e.locators.ariaLabel;
    if (e.locators.name) return e.locators.name;
    if (e.locators.id) return e.locators.id;
    if (e.locators.title) return e.locators.title;
    return 'field';
  }

  toGherkin() {
    let t = 'Feature: Kiro Recorded Test\n\n  Scenario: User performs recorded actions\n';
    t += '    Given the user is on the application\n';
    this.events.forEach((e) => {
      if (e.eventType === 'navigation' || e.eventType === 'pageload') {
        t += '    When the user navigates to "' + (e.tabUrl || e.url) + '"\n';
      } else if (e.eventType === 'click') {
        t += '    And the user clicks on "' + this.getSimpleLabel(e) + '"\n';
      } else if (e.eventType === 'type' || e.eventType === 'input') {
        t += '    And the user enters "' + (e.value || '') + '" in "' + this.getFieldLabel(e) + '" field\n';
      } else if (e.eventType === 'select') {
        t += '    And the user selects "' + (e.selectedText || e.value) + '" from "' + this.getFieldLabel(e) + '" dropdown\n';
      } else if (e.eventType === 'submit') {
        t += '    And the user submits the form\n';
      } else if (e.eventType === 'checkbox') {
        t += '    And the user ' + (e.checked ? 'checks' : 'unchecks') + ' "' + this.getFieldLabel(e) + '"\n';
      }
    });
    t += '    Then the operation completes successfully\n';
    return t;
  }

  initSettings() {
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const s = await this.sendMessage('GET_SETTINGS');
      if (s) {
        document.getElementById('set-screenshots').checked = s.screenshotEnabled !== false;
        document.getElementById('set-network').checked = s.networkMonitoring !== false;
        document.getElementById('set-console').checked = s.consoleMonitoring !== false;
        document.getElementById('set-autosave').checked = s.autoSave !== false;
        document.getElementById('set-ai-endpoint').value = s.aiEndpoint || '';
        document.getElementById('set-ai-key').value = s.aiApiKey || '';
        document.getElementById('set-theme').value = s.theme || 'dark';
        document.getElementById('set-export-format').value = s.defaultExportFormat || 'json';
        if (s.theme === 'light') document.body.setAttribute('data-theme', 'light');
      }
    } catch (e) {}
  }

  async saveSettings() {
    const s = {
      screenshotEnabled: document.getElementById('set-screenshots').checked,
      networkMonitoring: document.getElementById('set-network').checked,
      consoleMonitoring: document.getElementById('set-console').checked,
      autoSave: document.getElementById('set-autosave').checked,
      aiEndpoint: document.getElementById('set-ai-endpoint').value,
      aiApiKey: document.getElementById('set-ai-key').value,
      theme: document.getElementById('set-theme').value,
      defaultExportFormat: document.getElementById('set-export-format').value,
    };
    await this.sendMessage('SAVE_SETTINGS', s);
    if (s.theme === 'light') document.body.setAttribute('data-theme', 'light');
    else document.body.removeAttribute('data-theme');
    alert('Settings saved!');
  }

  initSearch() {
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.filterEvents(e.target.value, document.getElementById('filter-type').value);
    });
    document.getElementById('filter-type').addEventListener('change', (e) => {
      this.filterEvents(document.getElementById('search-input').value, e.target.value);
    });
  }

  filterEvents(search, typeFilter) {
    let filtered = this.events;
    if (typeFilter && typeFilter !== 'all') filtered = filtered.filter((e) => e.eventType === typeFilter);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((e) =>
        e.eventType.toLowerCase().includes(s) || (e.url && e.url.toLowerCase().includes(s))
      );
    }
    this.renderTimeline(filtered);
  }

  getTargetLabel(evt) {
    if (evt.eventType === 'navigation' || evt.eventType === 'pageload') return evt.tabUrl || evt.url || '';
    if (evt.eventType === 'type' || evt.eventType === 'input') return 'Enter "' + (evt.value || '') + '"';
    if (evt.eventType === 'select') return 'Select "' + (evt.selectedText || evt.value || '') + '"';
    if (evt.eventType === 'submit') return 'Submit form';
    if (evt.eventType === 'keypress') return 'Press ' + (evt.key || '');
    if (evt.eventType === 'scroll') return 'Scroll ' + (evt.direction || 'down');
    if (evt.locators && evt.locators.text && evt.locators.text.length < 30) return evt.locators.text;
    if (evt.locators && evt.locators.ariaLabel) return evt.locators.ariaLabel;
    if (evt.locators && evt.locators.id) return '#' + evt.locators.id;
    if (evt.locators && evt.locators.placeholder) return evt.locators.placeholder;
    if (evt.locators && evt.locators.name) return evt.locators.name;
    if (evt.tabUrl) return evt.tabUrl.substring(0, 40);
    return '';
  }

  formatTime(ms) {
    if (!ms) return '0s';
    const s = Math.floor(ms / 1000);
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }

  formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }
}

const dashboard = new DashboardController();

// ═══════════════════════════════════════════════════════════════════════════════
// Control Flow Controller
// Manages If/Else, Loop, and Table Select UI flows in the side panel.
// ═══════════════════════════════════════════════════════════════════════════════

class ControlFlowController {
  constructor(dashboardCtrl) {
    this.dashboard = dashboardCtrl;
    this.isActive = false;
    this.currentWizard = null; // 'condition' | 'loop' | 'table'
    this.pickMode = null; // null | { field, resolve }
    this.initLogicToolbar();
    this.initConditionWizard();
    this.initLoopWizard();
    this.initTableWizard();
    this.initManualStepInsertion();
    this.listenForControlFlowUpdates();
  }

  // ─── Logic Toolbar ─────────────────────────────────────────────────────────

  initLogicToolbar() {
    document.getElementById('btn-add-condition').addEventListener('click', () => {
      this.ensureRecording().then(ok => { if (ok) this.showWizard('condition'); });
    });
    document.getElementById('btn-add-loop').addEventListener('click', () => {
      this.ensureRecording().then(ok => { if (ok) this.showWizard('loop'); });
    });
    document.getElementById('btn-add-table-select').addEventListener('click', () => {
      this.ensureRecording().then(ok => { if (ok) this.showWizard('table'); });
    });
    document.getElementById('cf-banner-end').addEventListener('click', () => {
      this.endCurrentBlock();
    });
  }

  /**
   * Ensure recording is active before adding control flow blocks.
   * If not recording, auto-start it.
   */
  async ensureRecording() {
    const state = await this.sendMessage('GET_STATE');
    if (state && state.state && state.state.status === 'recording') {
      return true;
    }
    // Auto-start recording
    const resp = await this.sendMessage('START_RECORDING', {});
    if (resp && resp.success) {
      return true;
    }
    alert('Please start recording first from the popup.');
    return false;
  }

  // ─── Manual Step Insertion ─────────────────────────────────────────────────

  initManualStepInsertion() {
    const actionSelect = document.getElementById('cf-manual-action');
    const valueInput = document.getElementById('cf-manual-value');
    const locatorInput = document.getElementById('cf-manual-locator');
    const addBtn = document.getElementById('cf-manual-add-btn');
    const pickBtn = document.getElementById('cf-manual-pick');

    // Show/hide value field based on action type
    actionSelect.addEventListener('change', () => {
      const needsValue = ['type', 'select', 'keypress', 'navigation'].includes(actionSelect.value);
      valueInput.style.display = needsValue ? 'block' : 'none';
      if (actionSelect.value === 'navigation') {
        locatorInput.placeholder = 'Not needed for navigation';
        valueInput.placeholder = 'URL to navigate to';
      } else if (actionSelect.value === 'type') {
        locatorInput.placeholder = 'Element locator (XPath/CSS/#id)';
        valueInput.placeholder = 'Text to type';
      } else if (actionSelect.value === 'select') {
        locatorInput.placeholder = 'Element locator (XPath/CSS/#id)';
        valueInput.placeholder = 'Option text to select';
      } else if (actionSelect.value === 'keypress') {
        locatorInput.placeholder = 'Element locator (XPath/CSS/#id)';
        valueInput.placeholder = 'Key name (Enter, Tab, Escape)';
      } else {
        locatorInput.placeholder = 'Element locator (XPath/CSS/#id)';
        valueInput.placeholder = '';
      }
    });

    // Pick element
    pickBtn.addEventListener('click', () => {
      this.startElementPick('cf-manual-locator');
    });

    // Add step button
    addBtn.addEventListener('click', () => {
      this.addManualStep();
    });
  }

  async addManualStep() {
    const action = document.getElementById('cf-manual-action').value;
    const locator = document.getElementById('cf-manual-locator').value.trim();
    const value = document.getElementById('cf-manual-value').value.trim();

    if (!locator && action !== 'navigation') {
      alert('Please provide a locator for the element.');
      return;
    }
    if (action === 'navigation' && !value) {
      alert('Please provide a URL to navigate to.');
      return;
    }

    // Build the event object
    const event = {
      eventType: action,
      timestamp: Date.now(),
      url: '',
      locators: {
        recommended: {
          strategy: locator.startsWith('#') ? 'id' : (locator.startsWith('//') || locator.startsWith('.//')) ? 'xpath' : 'css',
          value: locator.startsWith('#') ? locator.substring(1) : locator,
        },
        relativeXPath: locator.startsWith('//') || locator.startsWith('.//') ? locator : null,
        id: locator.startsWith('#') ? locator.substring(1) : null,
      },
    };

    if (action === 'type') {
      event.value = value;
    } else if (action === 'select') {
      event.value = value;
      event.selectedText = value;
    } else if (action === 'keypress') {
      event.key = value;
    } else if (action === 'navigation') {
      event.eventType = 'navigation';
      event.tabUrl = value;
      event.url = value;
      event.locators = null;
    } else if (action === 'checkbox') {
      event.checked = true;
    }

    // Send to service worker to add to the current block's active branch
    const resp = await this.sendMessage('RECORD_EVENT', event);

    if (resp && resp.success) {
      // Show feedback — add to timeline
      this.dashboard.addTimelineItem(resp.event || event);
      // Clear inputs
      document.getElementById('cf-manual-locator').value = '';
      document.getElementById('cf-manual-value').value = '';
    } else {
      alert('Failed to add step: ' + ((resp && resp.error) || 'Unknown error'));
    }
  }

  // ─── Wizard Show/Hide ──────────────────────────────────────────────────────

  showWizard(type) {
    this.hideAllWizards();
    document.getElementById('cf-wizard').style.display = 'block';
    document.getElementById(`cf-wizard-${type}`).style.display = 'block';
    this.currentWizard = type;
  }

  hideAllWizards() {
    document.getElementById('cf-wizard').style.display = 'none';
    document.getElementById('cf-wizard-condition').style.display = 'none';
    document.getElementById('cf-wizard-loop').style.display = 'none';
    document.getElementById('cf-wizard-table').style.display = 'none';
    this.currentWizard = null;
  }

  // ─── Condition Wizard ──────────────────────────────────────────────────────

  initConditionWizard() {
    const checkSelect = document.getElementById('cf-condition-check');
    const valueRow = document.getElementById('cf-condition-value-row');

    checkSelect.addEventListener('change', () => {
      const needsValue = ['textContains', 'attributeEquals', 'elementCount'].includes(checkSelect.value);
      valueRow.style.display = needsValue ? 'block' : 'none';
    });

    document.getElementById('cf-condition-pick').addEventListener('click', () => {
      this.startElementPick('cf-condition-locator');
    });

    document.getElementById('cf-condition-start').addEventListener('click', () => {
      this.startConditionBlock();
    });

    document.getElementById('cf-condition-cancel').addEventListener('click', () => {
      this.hideAllWizards();
    });
  }

  async startConditionBlock() {
    const check = document.getElementById('cf-condition-check').value;
    const locator = document.getElementById('cf-condition-locator').value.trim();
    const value = document.getElementById('cf-condition-value').value.trim();

    if (!locator) {
      alert('Please provide a locator for the condition element.');
      return;
    }

    const config = { check, locator, value };
    const resp = await this.sendMessage('START_CONDITION', config);

    if (resp.success) {
      this.hideAllWizards();
      this.showBanner('condition', 'then');
      this.isActive = true;
    } else {
      alert('Failed to start condition: ' + (resp.error || 'Unknown error'));
    }
  }

  // ─── Loop Wizard ───────────────────────────────────────────────────────────

  initLoopWizard() {
    const loopTypeSelect = document.getElementById('cf-loop-type');

    loopTypeSelect.addEventListener('change', () => {
      const type = loopTypeSelect.value;
      document.getElementById('cf-loop-container-row').style.display =
        (type === 'repeatN' || type === 'repeatUntil') ? 'none' : 'block';
      document.getElementById('cf-loop-item-row').style.display =
        (type === 'repeatN' || type === 'repeatUntil') ? 'none' : 'block';
      document.getElementById('cf-loop-match-row').style.display =
        (type === 'findMatch' || type === 'allMatches') ? 'block' : 'none';
      document.getElementById('cf-loop-match-value-row').style.display =
        (type === 'findMatch' || type === 'allMatches') ? 'block' : 'none';
      document.getElementById('cf-loop-count-row').style.display =
        type === 'repeatN' ? 'block' : 'none';
    });

    document.getElementById('cf-loop-container-pick').addEventListener('click', () => {
      this.startElementPick('cf-loop-container');
    });
    document.getElementById('cf-loop-item-pick').addEventListener('click', () => {
      this.startElementPick('cf-loop-item');
    });
    document.getElementById('cf-loop-match-pick').addEventListener('click', () => {
      this.startElementPick('cf-loop-match-locator');
    });

    document.getElementById('cf-loop-start').addEventListener('click', () => {
      this.startLoopBlock();
    });

    document.getElementById('cf-loop-cancel').addEventListener('click', () => {
      this.hideAllWizards();
    });
  }

  async startLoopBlock() {
    const loopType = document.getElementById('cf-loop-type').value;
    const container = document.getElementById('cf-loop-container').value.trim();
    const itemLocator = document.getElementById('cf-loop-item').value.trim();
    const matchLocator = document.getElementById('cf-loop-match-locator').value.trim();
    const matchOperator = document.getElementById('cf-loop-match-operator').value;
    const matchValue = document.getElementById('cf-loop-match-value').value.trim();
    const count = parseInt(document.getElementById('cf-loop-count').value) || 5;

    if ((loopType === 'findMatch' || loopType === 'allMatches') && !container) {
      alert('Please provide a container locator.');
      return;
    }

    const config = {
      loopType,
      container,
      itemLocator,
      count: loopType === 'repeatN' ? count : null,
      match: (loopType === 'findMatch' || loopType === 'allMatches') ? {
        elementLocator: matchLocator,
        operator: matchOperator,
        value: matchValue,
      } : null,
      action: loopType === 'allMatches' ? 'allMatches' : 'firstMatch',
    };

    const resp = await this.sendMessage('START_LOOP', config);

    if (resp.success) {
      this.hideAllWizards();
      this.showBanner('loop', 'body');
      this.isActive = true;
    } else {
      alert('Failed to start loop: ' + (resp.error || 'Unknown error'));
    }
  }

  // ─── Table Select Wizard ───────────────────────────────────────────────────

  initTableWizard() {
    document.getElementById('cf-table-pick').addEventListener('click', () => {
      this.startElementPick('cf-table-locator');
    });

    document.getElementById('cf-table-add-criterion').addEventListener('click', () => {
      this.addTableCriterion();
    });

    document.getElementById('cf-table-start').addEventListener('click', () => {
      this.startTableSelectBlock();
    });

    document.getElementById('cf-table-cancel').addEventListener('click', () => {
      this.hideAllWizards();
      this.clearTableDetection();
    });
  }

  /**
   * When table is detected via pick, show a column selector panel
   * allowing users to pick columns by name instead of typing locators.
   */
  showDetectedColumns(headers, rowCount) {
    // Remove existing column panel if any
    this.clearColumnPanel();

    if (!headers || headers.length === 0) return;

    const wizardEl = document.getElementById('cf-wizard-table');
    const criteriaSection = document.getElementById('cf-table-criteria');

    // Create column detection panel
    const panel = document.createElement('div');
    panel.id = 'cf-table-column-panel';
    panel.className = 'cf-table-column-panel';
    panel.innerHTML = `
      <div class="cf-column-panel-header">
        <span class="cf-column-panel-title">Detected ${headers.length} columns, ${rowCount} rows</span>
      </div>
      <div class="cf-column-panel-hint">Select columns and set match criteria:</div>
      <div class="cf-column-items" id="cf-column-items"></div>
    `;

    // Insert before criteria section
    criteriaSection.parentElement.insertBefore(panel, criteriaSection);

    // Populate columns
    const itemsContainer = panel.querySelector('#cf-column-items');
    headers.forEach((header, idx) => {
      const item = document.createElement('div');
      item.className = 'cf-column-item';
      item.setAttribute('data-index', idx);
      item.innerHTML = `
        <label class="cf-column-check">
          <input type="checkbox" class="cf-column-checkbox" data-col-index="${idx}" data-col-locator="${header.locator}" />
          <span class="cf-column-name">${header.name || 'Column ' + (idx + 1)}</span>
          <span class="cf-column-locator">${header.locator}</span>
        </label>
        <div class="cf-column-criteria" style="display:none;">
          <select class="cf-column-operator">
            <option value="equals">equals</option>
            <option value="contains">contains</option>
            <option value="startsWith">starts with</option>
            <option value="greaterThan">greater than</option>
            <option value="lessThan">less than</option>
            <option value="notEquals">not equals</option>
          </select>
          <input type="text" class="cf-column-value" placeholder="Match value..." />
        </div>
      `;

      // Toggle criteria row when checkbox is checked
      const checkbox = item.querySelector('.cf-column-checkbox');
      const criteriaRow = item.querySelector('.cf-column-criteria');
      checkbox.addEventListener('change', () => {
        criteriaRow.style.display = checkbox.checked ? 'flex' : 'none';
      });

      itemsContainer.appendChild(item);
    });

    // Hide the manual criteria section when columns are detected
    criteriaSection.style.display = 'none';
    document.getElementById('cf-table-add-criterion').style.display = 'none';

    // Store headers for later use
    this._detectedHeaders = headers;
  }

  clearColumnPanel() {
    const existing = document.getElementById('cf-table-column-panel');
    if (existing) existing.remove();
    this._detectedHeaders = null;

    // Restore manual criteria section
    const criteriaSection = document.getElementById('cf-table-criteria');
    if (criteriaSection) criteriaSection.style.display = '';
    const addBtn = document.getElementById('cf-table-add-criterion');
    if (addBtn) addBtn.style.display = '';
  }

  clearTableDetection() {
    this.clearColumnPanel();
  }

  addTableCriterion() {
    const container = document.getElementById('cf-table-criteria');
    const index = container.children.length;
    const criterion = document.createElement('div');
    criterion.className = 'cf-table-criterion';
    criterion.setAttribute('data-index', index);
    criterion.innerHTML = `
      <input type="text" class="cf-table-col-locator" placeholder="Column locator: .//td[${index + 2}]" />
      <select class="cf-table-col-operator">
        <option value="equals">equals</option>
        <option value="contains">contains</option>
        <option value="startsWith">starts with</option>
        <option value="greaterThan">greater than</option>
        <option value="lessThan">less than</option>
        <option value="notEquals">not equals</option>
      </select>
      <input type="text" class="cf-table-col-value" placeholder="Value" />
      <button class="cf-remove-criterion" title="Remove">&#10006;</button>
    `;
    criterion.querySelector('.cf-remove-criterion').addEventListener('click', () => {
      criterion.remove();
    });
    container.appendChild(criterion);
  }

  async startTableSelectBlock() {
    const tableLocator = document.getElementById('cf-table-locator').value.trim();
    const rowLocator = document.getElementById('cf-table-row').value.trim();
    const logic = document.getElementById('cf-table-logic').value;
    const action = document.getElementById('cf-table-action').value;

    if (!tableLocator) {
      alert('Please provide a table locator.');
      return;
    }

    // Gather criteria from detected columns panel (if available)
    let criteria = [];
    const columnPanel = document.getElementById('cf-table-column-panel');

    if (columnPanel) {
      // Use the column panel checkboxes
      const checkedColumns = columnPanel.querySelectorAll('.cf-column-checkbox:checked');
      checkedColumns.forEach((checkbox) => {
        const item = checkbox.closest('.cf-column-item');
        const colLocator = checkbox.getAttribute('data-col-locator');
        const operator = item.querySelector('.cf-column-operator').value;
        const value = item.querySelector('.cf-column-value').value.trim();
        if (colLocator && value) {
          criteria.push({ columnLocator: colLocator, operator, value });
        }
      });
    } else {
      // Fallback: use manual criteria inputs
      const criteriaElements = document.querySelectorAll('.cf-table-criterion');
      criteriaElements.forEach((el) => {
        const colLocator = el.querySelector('.cf-table-col-locator').value.trim();
        const operator = el.querySelector('.cf-table-col-operator').value;
        const value = el.querySelector('.cf-table-col-value').value.trim();
        if (colLocator && value) {
          criteria.push({ columnLocator: colLocator, operator, value });
        }
      });
    }

    if (criteria.length === 0) {
      alert('Please select at least one column and provide a match value.');
      return;
    }

    const config = {
      tableLocator,
      rowLocator: rowLocator || './/tbody/tr',
      columns: this._detectedHeaders || [],
      criteria,
      logic,
      action,
    };

    const resp = await this.sendMessage('START_TABLE_SELECT', config);

    if (resp.success) {
      this.hideAllWizards();
      this.showBanner('tableSelect', 'body');
      this.isActive = true;
    } else {
      alert('Failed to start table select: ' + (resp.error || 'Unknown error'));
    }
  }

  // ─── Banner Management ─────────────────────────────────────────────────────

  showBanner(blockType, branchName) {
    const banner = document.getElementById('control-flow-banner');
    const title = document.getElementById('cf-banner-title');
    const icon = document.getElementById('cf-banner-icon');
    const actions = document.getElementById('cf-banner-actions');

    banner.style.display = 'block';
    banner.className = `control-flow-banner cf-banner-${blockType} cf-branch-${branchName}`;

    switch (blockType) {
      case 'condition':
        icon.innerHTML = '&#9888;';
        title.textContent = branchName === 'then'
          ? 'Recording IF (THEN) branch...'
          : 'Recording ELSE branch...';
        actions.innerHTML = branchName === 'then'
          ? '<button class="cf-action-btn cf-switch-else" id="cf-switch-else">Switch to ELSE</button>'
          : '<button class="cf-action-btn cf-switch-then" id="cf-switch-then">Switch to THEN</button>';
        break;

      case 'loop':
        icon.innerHTML = '&#128260;';
        title.textContent = branchName === 'body'
          ? 'Recording LOOP body...'
          : 'Recording NO MATCH fallback...';
        actions.innerHTML = branchName === 'body'
          ? '<button class="cf-action-btn cf-switch-nomatch" id="cf-switch-nomatch">Add No-Match Fallback</button>'
          : '<button class="cf-action-btn cf-switch-body" id="cf-switch-body">Back to Loop Body</button>';
        break;

      case 'tableSelect':
        icon.innerHTML = '&#128203;';
        title.textContent = branchName === 'body'
          ? 'Recording TABLE MATCH action...'
          : 'Recording NO MATCH fallback...';
        actions.innerHTML = branchName === 'body'
          ? '<button class="cf-action-btn cf-switch-nomatch" id="cf-switch-nomatch">Add No-Match Fallback</button>'
          : '<button class="cf-action-btn cf-switch-body" id="cf-switch-body">Back to Match Action</button>';
        break;
    }

    // Attach branch switch handlers
    this.attachBannerHandlers();
  }

  attachBannerHandlers() {
    const switchElse = document.getElementById('cf-switch-else');
    const switchThen = document.getElementById('cf-switch-then');
    const switchNoMatch = document.getElementById('cf-switch-nomatch');
    const switchBody = document.getElementById('cf-switch-body');

    if (switchElse) {
      switchElse.addEventListener('click', () => this.switchBranch('else'));
    }
    if (switchThen) {
      switchThen.addEventListener('click', () => this.switchBranch('then'));
    }
    if (switchNoMatch) {
      switchNoMatch.addEventListener('click', () => this.switchBranch('noMatch'));
    }
    if (switchBody) {
      switchBody.addEventListener('click', () => this.switchBranch('body'));
    }
  }

  async switchBranch(branchName) {
    const resp = await this.sendMessage('SWITCH_BRANCH', { branch: branchName });
    if (resp.success) {
      const cf = resp.controlFlow;
      const block = cf.currentBlock;
      if (block) {
        this.showBanner(block.blockType, branchName);
      }
    }
  }

  async endCurrentBlock() {
    const resp = await this.sendMessage('END_BLOCK');
    if (resp.success) {
      // Check if still inside a parent block
      if (resp.controlFlow.isActive) {
        const parentBlock = resp.controlFlow.currentBlock;
        const mode = resp.controlFlow.mode;
        const branchName = mode.split('_').slice(1).join('_');
        this.showBanner(parentBlock.blockType, branchName);
      } else {
        this.hideBanner();
        this.isActive = false;
      }

      // Add the completed block to the timeline visually
      if (resp.block) {
        this.dashboard.addBlockToTimeline(resp.block);
      }
    }
  }

  hideBanner() {
    document.getElementById('control-flow-banner').style.display = 'none';
  }

  // ─── Element Picker ────────────────────────────────────────────────────────

  async startElementPick(targetFieldId) {
    const targetField = document.getElementById(targetFieldId);

    // Send message to content script to enter pick mode
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { alert('No active tab found.'); return; }

      chrome.tabs.sendMessage(tab.id, {
        type: 'ENTER_PICK_MODE',
        payload: { fieldId: targetFieldId },
      });

      // Temporarily change button text
      const pickBtn = targetField.nextElementSibling;
      if (pickBtn) {
        pickBtn.textContent = '... picking';
        pickBtn.disabled = true;
      }
    } catch (e) {
      alert('Could not connect to page. Make sure recording is active.');
    }
  }

  // ─── Listen for Updates ────────────────────────────────────────────────────

  listenForControlFlowUpdates() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'CONTROL_FLOW_CHANGED') {
        this.onControlFlowChanged(msg.payload);
      }
      if (msg.type === 'ELEMENT_PICKED') {
        this.onElementPicked(msg.payload);
      }
      if (msg.type === 'BLOCK_COMPLETED') {
        // Block was completed — already handled in endCurrentBlock
      }
    });
  }

  onControlFlowChanged(cfState) {
    if (cfState.isActive) {
      const block = cfState.currentBlock;
      const mode = cfState.mode;
      const branchName = mode ? mode.split('_').slice(1).join('_') : 'body';
      this.showBanner(block.blockType, branchName);
      this.isActive = true;
    } else {
      this.hideBanner();
      this.isActive = false;
    }

    // Update depth indicator
    const depthEl = document.getElementById('cf-banner-depth');
    if (cfState.depth > 1) {
      depthEl.textContent = `Nesting depth: ${cfState.depth}`;
      depthEl.style.display = 'block';
    } else {
      depthEl.style.display = 'none';
    }
  }

  onElementPicked(payload) {
    const { fieldId, locator, pattern, tableInfo, extraFields } = payload;
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = locator;
    }

    // Auto-fill extra fields (e.g., container when user picks an item)
    if (extraFields) {
      Object.entries(extraFields).forEach(([id, value]) => {
        const extraField = document.getElementById(id);
        if (extraField && !extraField.value) {
          extraField.value = value;
        }
      });
    }

    // If pattern info returned, auto-fill the item locator field
    if (pattern && fieldId === 'cf-loop-container') {
      const itemField = document.getElementById('cf-loop-item');
      if (itemField && pattern.itemSelector) {
        itemField.value = pattern.itemSelector;
      }
      // Show detected count
      this.showPatternFeedback(pattern.itemCount);
    }

    if (pattern && fieldId === 'cf-loop-item') {
      // Pattern detected from a single item — fills both container and item
      const containerField = document.getElementById('cf-loop-container');
      if (containerField && pattern.containerXPath) {
        containerField.value = pattern.containerXPath;
      }
      const itemField = document.getElementById('cf-loop-item');
      if (itemField && pattern.itemLocator) {
        itemField.value = pattern.itemLocator;
      }
      this.showPatternFeedback(pattern.itemCount);
    }

    // If table info returned, auto-fill table wizard
    if (tableInfo && fieldId === 'cf-table-locator') {
      const rowField = document.getElementById('cf-table-row');
      if (rowField && tableInfo.rowLocator) {
        rowField.value = tableInfo.rowLocator;
      }
      // Store row count for column panel
      this._lastTableRowCount = tableInfo.rowCount || 0;
      // If headers found, show the column selection panel
      if (tableInfo.headers && tableInfo.headers.length > 0) {
        this.populateTableHeaders(tableInfo.headers);
      }
      this.showPatternFeedback(tableInfo.rowCount, 'rows');
    }

    // Restore pick button
    const pickBtn = field ? field.nextElementSibling : null;
    if (pickBtn && pickBtn.classList.contains('cf-pick-btn')) {
      pickBtn.innerHTML = '&#127919; Pick';
      pickBtn.disabled = false;
    }
  }

  showPatternFeedback(count, label) {
    label = label || 'items';
    // Create or update a small feedback message near the wizard
    let feedback = document.getElementById('cf-pattern-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.id = 'cf-pattern-feedback';
      feedback.style.cssText = 'padding:6px 10px;margin:6px 0;border-radius:4px;font-size:11px;font-weight:500;';
      const wizard = document.getElementById('cf-wizard');
      if (wizard) wizard.appendChild(feedback);
    }

    if (count >= 2) {
      feedback.textContent = `Found ${count} ${label}`;
      feedback.style.color = '#2ecc71';
      feedback.style.background = 'rgba(46,204,113,0.1)';
      feedback.style.border = '1px solid rgba(46,204,113,0.3)';
    } else {
      feedback.textContent = `Only ${count} ${label} found - try a different container`;
      feedback.style.color = '#f39c12';
      feedback.style.background = 'rgba(243,156,18,0.1)';
      feedback.style.border = '1px solid rgba(243,156,18,0.3)';
    }

    feedback.style.display = 'block';
    // Auto-hide after 5 seconds
    setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 5000);
  }

  populateTableHeaders(headers) {
    // Use the enhanced column panel for detected headers
    // Find the row count from the feedback or default
    const rowCount = this._lastTableRowCount || 0;
    this.showDetectedColumns(headers, rowCount);
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  sendMessage(type, payload) {
    return chrome.runtime.sendMessage({ type, payload });
  }
}

// ─── Extend DashboardController to handle blocks in timeline ─────────────────

DashboardController.prototype.addBlockToTimeline = function(block, skipDataPush) {
  // Add block to the data array so exports can access it (unless loading existing data)
  if (!skipDataPush) {
    // Check if we need to insert at a specific position
    if (this._insertAfterEventId) {
      const idx = this.events.findIndex(e => (e.id || e.timestamp) === this._insertAfterEventId);
      if (idx !== -1) {
        this.events.splice(idx + 1, 0, block);
      } else {
        this.events.push(block);
      }
      this._insertAfterEventId = null;
      // Re-render entire timeline to reflect new position
      this.renderTimeline(this.events);
      this.updateStats();
      return;
    } else {
      this.events.push(block);
    }
    this.updateStats();
  }

  const list = document.getElementById('timeline-list');
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'timeline-item timeline-block';
  item.setAttribute('data-type', 'block');
  item.setAttribute('data-block-type', block.blockType);

  const step = block.stepNumber || this.events.length;
  const label = this.getBlockLabel(block);
  const branchInfo = this.getBlockBranchInfo(block);

  item.innerHTML = `
    <span class="timeline-step">${step}</span>
    <div class="timeline-details">
      <span class="timeline-type block-type-${block.blockType}">${label}</span>
      <span class="timeline-target">${branchInfo}</span>
    </div>
    <div class="step-actions">
      <button class="move-step-btn move-up-btn" title="Move up">&#9650;</button>
      <button class="move-step-btn move-down-btn" title="Move down">&#9660;</button>
      <button class="delete-step-btn" title="Delete this block">&#128465;</button>
    </div>
  `;

  // Attach move/delete handlers for the block
  const blockId = block.id || block.timestamp;
  item.querySelector('.move-up-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    this.moveEvent(blockId, 'up');
  });
  item.querySelector('.move-down-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    this.moveEvent(blockId, 'down');
  });
  item.querySelector('.delete-step-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    this.deleteEvent(blockId, item);
  });

  // No nested branches — blocks are flat markers now

  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
};

DashboardController.prototype.getBlockLabel = function(block) {
  if (block.blockType === 'condition') {
    const stmt = (block.config && block.config.statement) || 'if';
    if (stmt === 'close') return '}';
    if (stmt === 'elseif') return '} ELSE IF {';
    if (stmt === 'else') return '} ELSE {';
    return 'IF {';
  }
  switch (block.blockType) {
    case 'loop': return 'LOOP';
    case 'tableSelect': return 'TABLE SELECT';
    default: return 'BLOCK';
  }
};

DashboardController.prototype.getBlockBranchInfo = function(block) {
  const cfg = block.config;
  if (block.blockType === 'condition') {
    const stmt = cfg.statement || 'if';
    if (stmt === 'close') return 'close statement';
    if (stmt === 'else') return '';
    if (cfg.conditionType === 'dataDriven' || cfg.check === 'dataDriven') {
      const op = cfg.operator === '==' ? '==' : cfg.operator === '!=' ? '!=' : cfg.operator;
      return `data.get("${cfg.variable || '?'}") ${op} "${cfg.value || '?'}"`;
    } else if (cfg.check === 'textContains') {
      return `element "${cfg.locator || '?'}" contains "${cfg.textValue || cfg.value || '?'}"`;
    } else if (cfg.check === 'else') {
      return '';
    } else {
      return `element exists: "${cfg.locator || '?'}"`;
    }
  } else if (block.blockType === 'loop') {
    if (cfg.loopType === 'repeatN') return `repeat ${cfg.count || 5} times`;
    if (cfg.match && cfg.match.value) return `find item where ${cfg.match.operator || 'contains'} "${cfg.match.value}"`;
    return `iterate: ${cfg.container || '?'}`;
  } else if (block.blockType === 'tableSelect') {
    const crits = (cfg.criteria || []).map(cr => `${cr.columnLocator} ${cr.operator} "${cr.value}"`).join(', ');
    return crits || 'table row match';
  }
  const counts = Object.entries(block.branches)
    .map(([name, steps]) => `${name}: ${steps.length} steps`)
    .join(', ');
  return counts;
};

DashboardController.prototype.getBranchDisplayName = function(blockType, branchName) {
  const names = {
    condition: { then: 'THEN', else: 'ELSE' },
    loop: { body: 'Loop Body', noMatch: 'No Match' },
    tableSelect: { body: 'Match Action', noMatch: 'No Match' },
  };
  return (names[blockType] && names[blockType][branchName]) || branchName;
};

// Initialize the control flow controller
const controlFlowCtrl = new ControlFlowController(dashboard);
window.controlFlowCtrl = controlFlowCtrl;
