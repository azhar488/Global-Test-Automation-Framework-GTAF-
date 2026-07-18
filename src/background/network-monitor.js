/**
 * KIRO Recorder - Network Monitor
 * Captures API calls, request/response data, and timing information.
 */

export class NetworkMonitor {
  constructor() {
    this.logs = [];
    this.isActive = false;
    this.sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
    ];
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    this.logs = [];
    this.attachListeners();
  }

  stop() {
    this.isActive = false;
    this.detachListeners();
  }

  clear() {
    this.logs = [];
  }

  getLogs() {
    return [...this.logs];
  }

  attachListeners() {
    // Listen for web requests
    if (chrome.webRequest) {
      chrome.webRequest.onBeforeRequest.addListener(
        this.onBeforeRequest.bind(this),
        { urls: ['<all_urls>'] },
        ['requestBody']
      );

      chrome.webRequest.onCompleted.addListener(
        this.onCompleted.bind(this),
        { urls: ['<all_urls>'] },
        ['responseHeaders']
      );

      chrome.webRequest.onErrorOccurred.addListener(
        this.onError.bind(this),
        { urls: ['<all_urls>'] }
      );
    }
  }

  detachListeners() {
    if (chrome.webRequest) {
      try {
        chrome.webRequest.onBeforeRequest.removeListener(this.onBeforeRequest.bind(this));
        chrome.webRequest.onCompleted.removeListener(this.onCompleted.bind(this));
        chrome.webRequest.onErrorOccurred.removeListener(this.onError.bind(this));
      } catch (e) {
        // Listeners may not be attached
      }
    }
  }

  onBeforeRequest(details) {
    if (!this.isActive) return;
    if (this.shouldIgnore(details.url)) return;

    const log = {
      id: `net_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      type: details.type,
      tabId: details.tabId,
      timestamp: Date.now(),
      requestBody: this.maskSensitiveData(details.requestBody),
      status: 'pending',
    };

    this.logs.push(log);
  }

  onCompleted(details) {
    if (!this.isActive) return;

    const log = this.logs.find((l) => l.requestId === details.requestId);
    if (log) {
      log.status = 'completed';
      log.statusCode = details.statusCode;
      log.responseHeaders = this.maskHeaders(details.responseHeaders || []);
      log.responseTime = Date.now() - log.timestamp;
    }
  }

  onError(details) {
    if (!this.isActive) return;

    const log = this.logs.find((l) => l.requestId === details.requestId);
    if (log) {
      log.status = 'error';
      log.error = details.error;
      log.responseTime = Date.now() - log.timestamp;
    }
  }

  maskHeaders(headers) {
    return headers.map((header) => {
      if (this.sensitiveHeaders.includes(header.name.toLowerCase())) {
        return { name: header.name, value: '***MASKED***' };
      }
      return header;
    });
  }

  maskSensitiveData(requestBody) {
    if (!requestBody) return null;

    // Mask form data passwords
    if (requestBody.formData) {
      const masked = { ...requestBody.formData };
      const sensitiveFields = ['password', 'passwd', 'pwd', 'secret', 'token'];
      for (const field of sensitiveFields) {
        if (masked[field]) {
          masked[field] = ['***MASKED***'];
        }
      }
      return { formData: masked };
    }

    return requestBody;
  }

  shouldIgnore(url) {
    const ignoredPatterns = [
      'chrome-extension://',
      'chrome://',
      'devtools://',
      'about:',
    ];
    return ignoredPatterns.some((pattern) => url.startsWith(pattern));
  }
}
