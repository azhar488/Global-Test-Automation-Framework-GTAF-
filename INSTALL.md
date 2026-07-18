# KIRO Recorder - Installation & Documentation Guide

## Quick Installation (Chrome Developer Mode)

### Step 1: Generate Icons

1. Open `assets/icons/generate-icons.html` in Chrome
2. Right-click each canvas and select "Save image as..."
3. Save them as:
   - `icon-16.png` (16x16)
   - `icon-32.png` (32x32)
   - `icon-48.png` (48x48)
   - `icon-128.png` (128x128)
4. Place all PNGs in `assets/icons/`

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `kiro-recorder` folder (the one containing `manifest.json`)
5. The extension icon will appear in your toolbar

### Step 3: Pin the Extension

1. Click the puzzle icon in Chrome toolbar
2. Find "KIRO Recorder" and click the pin icon
3. The KIRO icon is now always visible

---

## Usage Guide

### Recording

1. Click the KIRO Recorder icon in the toolbar
2. Click **Start** to begin recording
3. Interact with any website - clicks, typing, navigation are all captured
4. Click **Pause** to temporarily stop, **Resume** to continue
5. Click **Stop** when finished
6. Click **Save** to download the recording as JSON

### Dashboard (Side Panel)

Click the dashboard icon in the popup to open the full side panel with:

- **Timeline** - View all recorded steps with search and filter
- **Recordings** - Manage saved recordings
- **Network** - View captured API calls
- **Console** - View browser errors and warnings
- **Export** - Generate automation scripts in multiple formats
- **AI Generate** - Use AI to create test cases (requires API endpoint)
- **Settings** - Configure all extension options

### Export Formats

| Format | Description | File Extension |
|--------|-------------|----------------|
| Selenium Java | WebDriver test class | .java |
| Playwright | Node.js test script | .js |
| Cypress | E2E test spec | .js |
| Robot Framework | Keyword-driven test | .robot |
| JSON | Raw event data | .json |
| CSV | Spreadsheet format | .csv |

### AI Integration

1. Go to Settings in the dashboard
2. Enter your AI API endpoint URL
3. Enter your API key
4. Select output format (Manual, Gherkin, Selenium, Playwright, Cypress)
5. Click "Generate with AI"

The AI endpoint should accept POST requests with this payload:
```json
{
  "events": [...],
  "format": "manual|gherkin|selenium|playwright|cypress"
}
```

And return:
```json
{
  "generated": "...output code or test cases..."
}
```

---

## Project Structure

```
kiro-recorder/
├── manifest.json                  # Extension manifest (V3)
├── assets/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       ├── icon-128.png
│       └── generate-icons.html    # Icon generator utility
├── src/
│   ├── background/
│   │   ├── service-worker.js      # Main background logic & message router
│   │   ├── recording-state.js     # Recording state machine
│   │   ├── tab-manager.js         # Tab lifecycle tracking
│   │   ├── network-monitor.js     # Network request interception
│   │   └── storage-manager.js     # Chrome storage CRUD operations
│   ├── content/
│   │   ├── locator-engine.js      # Smart element locator (XPath, CSS, etc.)
│   │   ├── event-recorder.js      # DOM event capture engine
│   │   ├── content-script.js      # Content script coordinator
│   │   └── content-styles.css     # Recording indicator styles
│   ├── popup/
│   │   ├── popup.html             # Extension popup UI
│   │   ├── popup.css              # Popup styles (dark/light)
│   │   └── popup.js               # Popup controller
│   └── sidepanel/
│       ├── sidepanel.html         # Full dashboard UI
│       ├── sidepanel.css          # Dashboard styles
│       └── sidepanel.js           # Dashboard controller
└── INSTALL.md                     # This file
```

---

## Module Documentation

### Background (Service Worker)

| Module | Purpose |
|--------|---------|
| `service-worker.js` | Message routing, tab events, screenshots, badge updates |
| `recording-state.js` | State machine (idle/recording/paused/stopped), event storage |
| `tab-manager.js` | Tracks active tabs, created/removed tabs |
| `network-monitor.js` | Intercepts web requests, masks sensitive headers |
| `storage-manager.js` | Settings, recordings, projects CRUD via chrome.storage |

### Content Scripts

| Module | Purpose |
|--------|---------|
| `locator-engine.js` | Generates ID, Name, CSS, XPath, aria-label, data-* locators |
| `event-recorder.js` | Captures mouse, keyboard, form, scroll, drag events |
| `content-script.js` | Coordinates recording, console/performance monitoring, UI indicator |

### Popup

Provides quick recording controls (Start/Pause/Stop/Save/Export/Clear), timer, step counter, recent events preview, and theme toggle.

### Side Panel Dashboard

Full-featured dashboard with 7 views: Timeline, Recordings, Network, Console, Export, AI Generate, Settings. Supports search, filtering, and real-time updates.

---

## Recorded Event Format

Every event is stored as a structured JSON object:

```json
{
  "id": "evt_1234567890_abc1234",
  "stepNumber": 1,
  "eventType": "click",
  "timestamp": 1720000000000,
  "relativeTime": 1500,
  "url": "https://example.com/page",
  "pageTitle": "Example Page",
  "tabId": 123,
  "tabUrl": "https://example.com/page",
  "element": {
    "tagName": "button",
    "isVisible": true,
    "isEnabled": true,
    "rect": { "x": 100, "y": 200, "width": 120, "height": 40 }
  },
  "locators": {
    "id": "submit-btn",
    "name": null,
    "cssSelector": "#submit-btn",
    "relativeXPath": "//*[@id=\"submit-btn\"]",
    "absoluteXPath": "/html[1]/body[1]/div[1]/button[1]",
    "ariaLabel": "Submit form",
    "dataAttributes": { "data-testid": "submit" },
    "recommended": { "strategy": "id", "value": "submit-btn" }
  },
  "coordinates": { "x": 160, "y": 220 },
  "screenshot": "data:image/png;base64,..."
}
```

---

## Security Features

- Passwords are NEVER recorded (masked as `***MASKED***`)
- Sensitive HTTP headers (Authorization, Cookie, tokens) are masked
- Form password fields are excluded from form data capture
- Recordings are stored locally in chrome.storage (never uploaded without consent)
- AI communication uses HTTPS and user-provided API keys

---

## Publishing to Chrome Web Store

1. Create a developer account at https://chrome.google.com/webstore/devconsole
2. Pay the one-time $5 registration fee
3. Prepare assets:
   - 128x128 icon
   - 1280x800 screenshot (at least one)
   - 440x280 promotional tile (optional)
4. Create a ZIP of the `kiro-recorder` folder
5. Upload to the developer dashboard
6. Fill in listing details (description, category, permissions justification)
7. Submit for review (typically 1-3 business days)

### Permission Justifications

| Permission | Justification |
|-----------|---------------|
| activeTab | Record user interactions on the active tab |
| tabs | Track tab switches and navigation events |
| storage | Save recordings and settings locally |
| scripting | Inject content scripts for event recording |
| webNavigation | Track page loads and URL changes |
| debugger | Advanced network monitoring |
| downloads | Export recordings as files |
| sidePanel | Provide full dashboard interface |

---

## Future Roadmap

- AI Self-Healing Locators
- Cross-browser support (Firefox, Edge, Safari)
- Cloud sync and team collaboration
- CI/CD integration (Jenkins, GitHub Actions)
- Jira/Azure DevOps test case sync
- Mobile browser recording
- Visual regression testing
- API recording mode
