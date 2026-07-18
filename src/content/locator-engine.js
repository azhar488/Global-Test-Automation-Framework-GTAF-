/**
 * KIRO Recorder - Smart Element Locator Engine
 * Generates multiple locator strategies for every recorded element.
 */

(function () {
  'use strict';

  class LocatorEngine {
    /**
     * Generate all possible locators for a given DOM element.
     * @param {HTMLElement} element
     * @returns {Object} locators object with multiple strategies
     */
    static getLocators(element) {
      if (!element || !element.tagName) return null;

      return {
        id: element.id || null,
        name: element.getAttribute('name') || null,
        className: element.className || null,
        tagName: element.tagName.toLowerCase(),
        text: LocatorEngine.getTextContent(element),
        placeholder: element.getAttribute('placeholder') || null,
        title: element.getAttribute('title') || null,
        ariaLabel: element.getAttribute('aria-label') || null,
        ariaRole: element.getAttribute('role') || null,
        type: element.getAttribute('type') || null,
        href: element.getAttribute('href') || null,
        src: element.getAttribute('src') || null,
        value: element.value || null,
        labelText: LocatorEngine.getAssociatedLabel(element),
        cssSelector: LocatorEngine.getCssSelector(element),
        relativeXPath: LocatorEngine.getRelativeXPath(element),
        absoluteXPath: LocatorEngine.getAbsoluteXPath(element),
        dataAttributes: LocatorEngine.getDataAttributes(element),
        parentInfo: LocatorEngine.getParentInfo(element),
        childInfo: LocatorEngine.getChildInfo(element),
        indexPosition: LocatorEngine.getIndexPosition(element),
        recommended: LocatorEngine.getRecommendedLocator(element),
      };
    }

    /**
     * Get the associated label text for this element (from same row/nearby label).
     */
    static getAssociatedLabel(element) {
      try {
        let row = element.closest('tr');
        if (!row) {
          const td = element.closest('td');
          if (td) row = td.closest('tr');
        }
        if (!row) return null;

        const labels = row.querySelectorAll('span, label');
        for (const lbl of labels) {
          const txt = lbl.textContent?.trim().replace(/[\s:]+$/, '').trim();
          if (txt && txt.length > 1 && txt.length < 60 && !element.contains(lbl)) {
            return txt;
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    /**
     * Get visible text content (trimmed, max 100 chars).
     */
    static getTextContent(element) {
      const text = element.textContent?.trim() || '';
      return text.length > 100 ? text.substring(0, 100) : text;
    }

    /**
     * Generate a unique CSS selector.
     */
    static getCssSelector(element) {
      try {
        // Try ID first
        if (element.id) {
          return `#${CSS.escape(element.id)}`;
        }

        // Try data-testid
        const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
        if (testId) {
          return `[data-testid="${testId}"]`;
        }

        // Build path-based selector
        const path = [];
        let current = element;

        while (current && current !== document.body && path.length < 5) {
          let selector = current.tagName.toLowerCase();

          if (current.id) {
            selector = `#${CSS.escape(current.id)}`;
            path.unshift(selector);
            break;
          }

          if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).filter((c) => c.length > 0 && !c.startsWith('ng-') && !c.startsWith('_'));
            if (classes.length > 0) {
              selector += `.${classes.slice(0, 2).map((c) => CSS.escape(c)).join('.')}`;
            }
          }

          // Add nth-child if needed for uniqueness
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((s) => s.tagName === current.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector += `:nth-child(${index})`;
            }
          }

          path.unshift(selector);
          current = current.parentElement;
        }

        return path.join(' > ');
      } catch (e) {
        return null;
      }
    }

    /**
     * Generate a relative XPath (shortest, most reliable).
     * Priority: direct element attributes > label-based > absolute.
     */
    static getRelativeXPath(element) {
      try {
        const tag = element.tagName.toLowerCase();

        // Strategy 1: Direct element attributes (SHORTEST XPATH)
        // Name attribute - most stable for form elements
        const name = element.getAttribute('name');
        if (name && !name.match(/^\d+$/)) {
          return `//${tag}[@name='${name}']`;
        }

        // ID that contains meaningful text (not purely numeric)
        if (element.id && !element.id.match(/^(cpt_|ctn_)?\d+$/)) {
          return `//${tag}[@id='${element.id}']`;
        }

        // Class-based if unique and meaningful
        const cls = element.getAttribute('class');
        if (cls && tag === 'input') {
          const meaningful = cls.split(/\s+/).find(c => !c.startsWith('x3') && !c.startsWith('ng-') && c.length > 3);
          if (meaningful) {
            return `//input[contains(@class,'${meaningful}')]`;
          }
        }

        // Placeholder
        const placeholder = element.getAttribute('placeholder');
        if (placeholder) {
          return `//${tag}[@placeholder='${placeholder}']`;
        }

        // Aria-label
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
          return `//${tag}[@aria-label='${ariaLabel}']`;
        }

        // Title attribute
        const title = element.getAttribute('title');
        if (title) {
          return `//${tag}[@title='${title}']`;
        }

        // Strategy 2: Text-based for links and buttons
        const text = element.textContent?.trim();
        if ((tag === 'a' || tag === 'button') && text && text.length < 50) {
          return `//${tag}[contains(text(),'${text.substring(0, 30)}')]`;
        }

        // Strategy 3: ID with contains (for dynamic IDs with meaningful parts)
        if (element.id) {
          return `//${tag}[contains(@id,'${element.id}')]`;
        }

        // Strategy 4: Label-based XPath (fallback for table layouts)
        const labelXPath = LocatorEngine.getXPathByLabel(element);
        if (labelXPath) return labelXPath;

        // Last resort: absolute XPath
        return LocatorEngine.getAbsoluteXPath(element);
      } catch (e) {
        return null;
      }
    }

    /**
     * Find XPath using the label text associated with this element.
     * ONLY used as fallback when direct attributes are not available.
     */
    static getXPathByLabel(element) {
      try {
        const tag = element.tagName.toLowerCase();

        // Walk up to find the containing <tr>
        let row = element.closest('tr');
        if (!row) {
          const td = element.closest('td');
          if (td) row = td.closest('tr');
        }
        if (!row) return null;

        // Look for a label/span in the same row
        const labels = row.querySelectorAll('span, label');
        let labelText = null;

        for (const lbl of labels) {
          const txt = lbl.textContent?.trim().replace(/[\s:]+$/, '').trim();
          if (txt && txt.length > 1 && txt.length < 60) {
            if (!element.contains(lbl)) {
              labelText = txt;
              break;
            }
          }
        }

        if (!labelText) return null;

        if (tag === 'input' || tag === 'textarea') {
          return `//tr[.//span[contains(text(),'${labelText}')]]//input`;
        } else if (tag === 'select') {
          return `//tr[.//span[contains(text(),'${labelText}')]]//select`;
        } else if (tag === 'a') {
          const ownText = element.textContent?.trim();
          if (ownText && ownText.length < 50) {
            return `//a[contains(text(),'${ownText}')]`;
          }
          return `//tr[.//span[contains(text(),'${labelText}')]]//a`;
        } else {
          return `//tr[.//span[contains(text(),'${labelText}')]]//${tag}`;
        }
      } catch (e) {
        return null;
      }
    }

    /**
     * Generate an absolute XPath from root.
     */
    static getAbsoluteXPath(element) {
      try {
        const parts = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let index = 1;
          let sibling = current.previousElementSibling;

          while (sibling) {
            if (sibling.tagName === current.tagName) {
              index++;
            }
            sibling = sibling.previousElementSibling;
          }

          const tag = current.tagName.toLowerCase();
          parts.unshift(`${tag}[${index}]`);
          current = current.parentElement;
        }

        return `/${parts.join('/')}`;
      } catch (e) {
        return null;
      }
    }

    /**
     * Collect all data-* attributes.
     */
    static getDataAttributes(element) {
      const dataAttrs = {};
      if (!element.attributes) return dataAttrs;

      for (const attr of element.attributes) {
        if (attr.name.startsWith('data-')) {
          dataAttrs[attr.name] = attr.value;
        }
      }
      return dataAttrs;
    }

    /**
     * Get parent element info.
     */
    static getParentInfo(element) {
      const parent = element.parentElement;
      if (!parent) return null;

      return {
        tagName: parent.tagName.toLowerCase(),
        id: parent.id || null,
        className: parent.className || null,
      };
    }

    /**
     * Get child element count info.
     */
    static getChildInfo(element) {
      return {
        childCount: element.children?.length || 0,
        hasChildren: (element.children?.length || 0) > 0,
      };
    }

    /**
     * Get index position among siblings of same type.
     */
    static getIndexPosition(element) {
      const parent = element.parentElement;
      if (!parent) return 0;

      const siblings = Array.from(parent.children).filter((s) => s.tagName === element.tagName);
      return siblings.indexOf(element);
    }

    /**
     * Determine the most reliable locator strategy.
     * Prefers shortest, most direct XPath.
     */
    static getRecommendedLocator(element) {
      const tag = element.tagName.toLowerCase();

      // Priority 1: Direct element attributes (shortest XPath)
      const name = element.getAttribute('name');
      if (name && !name.match(/^\d+$/)) {
        return { strategy: 'xpath', value: `//${tag}[@name='${name}']` };
      }

      // Meaningful ID (not purely numeric like cpt_174188)
      if (element.id && !element.id.match(/^(cpt_|ctn_)?\d+$/)) {
        return { strategy: 'xpath', value: `//${tag}[@id='${element.id}']` };
      }

      // Placeholder
      const placeholder = element.getAttribute('placeholder');
      if (placeholder) {
        return { strategy: 'xpath', value: `//${tag}[@placeholder='${placeholder}']` };
      }

      // Aria-label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return { strategy: 'xpath', value: `//${tag}[@aria-label='${ariaLabel}']` };
      }

      // Title
      const title = element.getAttribute('title');
      if (title) {
        return { strategy: 'xpath', value: `//${tag}[@title='${title}']` };
      }

      // For links/buttons, use visible text
      const text = element.textContent?.trim();
      if ((tag === 'a' || tag === 'button') && text && text.length < 50) {
        return { strategy: 'xpath', value: `//${tag}[contains(text(),'${text.substring(0, 30)}')]` };
      }

      // data-testid
      const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id');
      if (testId) {
        return { strategy: 'xpath', value: `//*[@data-testid='${testId}']` };
      }

      // Priority 2: Label-based XPath (for table layouts without direct attributes)
      const labelXPath = LocatorEngine.getXPathByLabel(element);
      if (labelXPath) {
        return { strategy: 'xpath', value: labelXPath };
      }

      // Priority 3: ID with contains (dynamic IDs)
      if (element.id) {
        return { strategy: 'xpath', value: `//${tag}[contains(@id,'${element.id}')]` };
      }

      // Last resort
      return { strategy: 'xpath', value: LocatorEngine.getAbsoluteXPath(element) };
    }

    /**
     * Get element details (tag, dimensions, visibility, etc.)
     */
    static getElementDetails(element) {
      const rect = element.getBoundingClientRect();

      return {
        tagName: element.tagName.toLowerCase(),
        isVisible: LocatorEngine.isElementVisible(element),
        isEnabled: !element.disabled,
        isChecked: element.checked || false,
        isSelected: element.selected || false,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        computedStyles: {
          display: getComputedStyle(element).display,
          visibility: getComputedStyle(element).visibility,
          opacity: getComputedStyle(element).opacity,
        },
      };
    }

    /**
     * Check if element is visible in viewport.
     */
    static isElementVisible(element) {
      const style = getComputedStyle(element);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (style.opacity === '0') return false;

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }
  }

  // Expose to window for content script access
  window.__KIRO_LocatorEngine = LocatorEngine;
})();
