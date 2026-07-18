/**
 * KIRO Recorder - Side Panel / Dashboard Controller
 * Manages event timeline, recordings, network, console, export, AI, and settings views.
 */
class DashboardController {
  constructor() {
    this.events = [];
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
    events.forEach((evt) => this.addTimelineItem(evt));
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
      + '<button class="delete-step-btn" title="Delete this step">&#128465;</button>';
    // Attach delete handler
    item.querySelector('.delete-step-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteEvent(evt.id || evt.timestamp, item);
    });
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
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
    let c = 'import org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\n\n';
    c += 'public class KiroTest {\n  public static void main(String[] args) {\n';
    c += '    WebDriver driver = new ChromeDriver();\n';
    this.events.forEach((e) => {
      const loc = e.locators && e.locators.recommended;
      if (!loc) return;
      const by = loc.strategy === 'id' ? 'By.id("' + loc.value + '")' :
        loc.strategy === 'name' ? 'By.name("' + loc.value + '")' :
        loc.strategy === 'css' ? 'By.cssSelector("' + loc.value + '")' :
        'By.xpath("' + loc.value + '")';
      if (e.eventType === 'click') c += '    driver.findElement(' + by + ').click();\n';
      else if (e.eventType === 'type') c += '    driver.findElement(' + by + ').sendKeys("' + (e.value || '') + '");\n';
      else if (e.eventType === 'keypress') c += '    driver.findElement(' + by + ').sendKeys(Keys.' + (e.key || '').toUpperCase() + ');\n';
      else if (e.eventType === 'shortcut') c += '    // Keyboard shortcut: ' + (e.combination || '') + '\n';
      else if (e.eventType === 'navigation') c += '    driver.get("' + e.tabUrl + '");\n';
    });
    c += '    driver.quit();\n  }\n}';
    return c;
  }

  toPlaywright() {
    let c = "const { test } = require('@playwright/test');\n\n";
    c += "test('Kiro Recorded Test', async ({ page }) => {\n";
    this.events.forEach((e) => {
      if (e.eventType === 'navigation') { c += "  await page.goto('" + e.tabUrl + "');\n"; return; }
      const loc = e.locators && e.locators.recommended;
      if (!loc) return;
      const sel = loc.strategy === 'id' ? '#' + loc.value : loc.value;
      if (e.eventType === 'click') c += "  await page.locator('" + sel + "').click();\n";
      else if (e.eventType === 'type') c += "  await page.locator('" + sel + "').fill('" + (e.value || '') + "');\n";
    });
    c += '});\n';
    return c;
  }

  toCypress() {
    let c = "describe('Kiro Recorded Test', () => {\n  it('executes recorded steps', () => {\n";
    this.events.forEach((e) => {
      if (e.eventType === 'navigation') { c += "    cy.visit('" + e.tabUrl + "');\n"; return; }
      const loc = e.locators && e.locators.recommended;
      if (!loc) return;
      const sel = loc.strategy === 'id' ? '#' + loc.value : loc.value;
      if (e.eventType === 'click') c += "    cy.get('" + sel + "').click();\n";
      else if (e.eventType === 'type') c += "    cy.get('" + sel + "').type('" + (e.value || '') + "');\n";
    });
    c += '  });\n});\n';
    return c;
  }

  toRobot() {
    let c = '*** Settings ***\nLibrary    SeleniumLibrary\n\n*** Test Cases ***\nKiro Recorded Test\n';
    this.events.forEach((e) => {
      if (e.eventType === 'navigation') { c += '    Go To    ' + e.tabUrl + '\n'; return; }
      const loc = e.locators && e.locators.recommended;
      if (!loc) return;
      const l = loc.strategy === 'id' ? 'id:' + loc.value : 'xpath:' + loc.value;
      if (e.eventType === 'click') c += '    Click Element    ' + l + '\n';
      else if (e.eventType === 'type') c += '    Input Text    ' + l + '    ' + (e.value || '') + '\n';
    });
    return c;
  }

  toCsv() {
    let csv = 'Step,Event Type,Target,Value,URL,Timestamp\n';
    this.events.forEach((e, i) => {
      const t = (e.locators && e.locators.recommended && e.locators.recommended.value) || '';
      csv += (i + 1) + ',"' + e.eventType + '","' + t + '","' + (e.value || '') + '","' + (e.url || '') + '",' + e.timestamp + '\n';
    });
    return csv;
  }

  // ─── Page Object Model Helpers ─────────────────────────────────────

  groupEventsByPage(events) {
    const pages = [];
    let currentPage = null;
    let currentType = null; // 'nav', 'close', 'screen'

    events.forEach((e) => {
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
      } else {
        // Actual screen - use Page Object
        c += '\n        // --- Screen: ' + page.title + ' ---\n';
        c += '        ' + className + ' ' + varName + ' = new ' + className + '(driver);\n';
        page.events.forEach((e) => {
          if (!e.locators || e.eventType === 'navigation' || e.eventType === 'pageload') return;
          const fieldName = this.toFieldName(e.locators);
          const methodName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
          if (e.eventType === 'click') {
            c += '        ' + varName + '.clicking' + methodName + '();\n';
          } else if (e.eventType === 'type') {
            c += '        ' + varName + '.entering' + methodName + '("' + (e.value || '') + '");\n';
          } else if (e.eventType === 'select') {
            c += '        ' + varName + '.selecting' + methodName + '("' + (e.selectedText || e.value || '') + '");\n';
          } else if (e.eventType === 'checkbox') {
            c += '        ' + varName + '.checking' + methodName + '();\n';
          } else if (e.eventType === 'radio') {
            c += '        ' + varName + '.selecting' + methodName + '();\n';
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
