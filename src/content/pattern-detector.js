/**
 * KIRO Recorder - Pattern Detector
 * Detects repeating DOM patterns for loop recording.
 * Identifies sibling elements with similar structure for iteration.
 */

(function () {
  'use strict';

  class PatternDetector {
    constructor() {
      this.lastDetectedPattern = null;
    }

    /**
     * Given a container element, detect repeating child patterns.
     * @param {Element} container - The parent/container element
     * @returns {object} - { itemCount, itemTag, itemSelector, items[] }
     */
    detectRepeatingChildren(container) {
      if (!container || !container.children || container.children.length === 0) {
        return { itemCount: 0, itemTag: null, itemSelector: null, items: [] };
      }

      // Group children by tag name
      var tagGroups = {};
      for (var i = 0; i < container.children.length; i++) {
        var child = container.children[i];
        var tag = child.tagName.toLowerCase();
        if (!tagGroups[tag]) tagGroups[tag] = [];
        tagGroups[tag].push(child);
      }

      // Find the largest group (most likely the repeating items)
      var largestTag = null;
      var largestCount = 0;
      for (var tag in tagGroups) {
        if (tagGroups[tag].length > largestCount) {
          largestCount = tagGroups[tag].length;
          largestTag = tag;
        }
      }

      if (largestCount < 2) {
        // Not enough repeating elements — try one level deeper
        return this.detectNestedRepeat(container);
      }

      var items = tagGroups[largestTag];

      // Try to find a common class pattern
      var commonClass = this.findCommonClass(items);
      var itemSelector = commonClass
        ? './' + largestTag + "[contains(@class,'" + commonClass + "')]"
        : './' + largestTag;

      this.lastDetectedPattern = {
        itemCount: items.length,
        itemTag: largestTag,
        itemSelector: itemSelector,
        commonClass: commonClass,
        items: items,
      };

      return this.lastDetectedPattern;
    }

    /**
     * Try detecting repeating items one level deeper (e.g., table > tbody > tr).
     */
    detectNestedRepeat(container) {
      for (var i = 0; i < container.children.length; i++) {
        var child = container.children[i];
        if (child.children && child.children.length >= 2) {
          var result = this.detectRepeatingChildren(child);
          if (result.itemCount >= 2) {
            // Adjust selector to be relative to the original container
            var wrapperTag = child.tagName.toLowerCase();
            result.itemSelector = './' + wrapperTag + '/' + result.itemSelector.replace('./', '');
            return result;
          }
        }
      }
      return { itemCount: 0, itemTag: null, itemSelector: null, items: [] };
    }

    /**
     * Find a class that all or most items share.
     */
    findCommonClass(items) {
      if (!items || items.length === 0) return null;

      // Get classes from first item
      var firstClasses = (items[0].className || '').split(/\s+/).filter(function(c) { return c.length > 0; });
      if (firstClasses.length === 0) return null;

      // Find which class appears in all items
      for (var i = 0; i < firstClasses.length; i++) {
        var cls = firstClasses[i];
        var allHave = true;
        for (var j = 1; j < items.length; j++) {
          if (!items[j].classList || !items[j].classList.contains(cls)) {
            allHave = false;
            break;
          }
        }
        if (allHave) return cls;
      }

      return null;
    }

    /**
     * Given an item element that the user clicked, detect its siblings
     * and figure out the generalized item locator relative to the container.
     * @param {Element} clickedItem - One of the repeating items
     * @returns {object} - { container, itemLocator, itemCount, containerXPath }
     */
    detectPatternFromItem(clickedItem) {
      if (!clickedItem || !clickedItem.parentElement) return null;

      var parent = clickedItem.parentElement;
      var tag = clickedItem.tagName.toLowerCase();

      // Count siblings with same tag
      var siblings = [];
      for (var i = 0; i < parent.children.length; i++) {
        if (parent.children[i].tagName.toLowerCase() === tag) {
          siblings.push(parent.children[i]);
        }
      }

      if (siblings.length < 2) {
        // Try going up one more level
        var grandparent = parent.parentElement;
        if (grandparent) {
          // Maybe clicked item is inside a wrapper (div > div.item > ...)
          var parentTag = parent.tagName.toLowerCase();
          var parentSiblings = [];
          for (var i = 0; i < grandparent.children.length; i++) {
            if (grandparent.children[i].tagName.toLowerCase() === parentTag) {
              parentSiblings.push(grandparent.children[i]);
            }
          }
          if (parentSiblings.length >= 2) {
            // The repeating unit is the parent level
            var commonClass = this.findCommonClass(parentSiblings);
            var containerXPath = this.getXPath(grandparent);
            var itemLocator = commonClass
              ? './/' + parentTag + "[contains(@class,'" + commonClass + "')]"
              : './' + parentTag;

            return {
              container: grandparent,
              containerXPath: containerXPath,
              itemLocator: itemLocator,
              itemCount: parentSiblings.length,
              items: parentSiblings,
            };
          }
        }
        return null;
      }

      // Build the generalized locator
      var commonClass = this.findCommonClass(siblings);
      var containerXPath = this.getXPath(parent);
      var itemLocator = commonClass
        ? './/' + tag + "[contains(@class,'" + commonClass + "')]"
        : './' + tag;

      return {
        container: parent,
        containerXPath: containerXPath,
        itemLocator: itemLocator,
        itemCount: siblings.length,
        items: siblings,
      };
    }

    /**
     * Detect table structure from a clicked table element.
     * @param {Element} tableElement - A <table> or element inside a table
     * @returns {object} - { table, headers[], rowLocator, rowCount, tableXPath }
     */
    detectTableStructure(tableElement) {
      // Walk up to find <table> or [role="grid"]
      var table = tableElement;
      while (table && table.tagName) {
        var tag = table.tagName.toLowerCase();
        if (tag === 'table' || table.getAttribute('role') === 'grid') break;
        table = table.parentElement;
      }

      if (!table || !table.tagName) return null;

      var isTable = table.tagName.toLowerCase() === 'table';
      var headers = [];
      var rows = [];
      var rowLocator = '';

      if (isTable) {
        // Standard HTML table
        var headerCells = table.querySelectorAll('th, thead td');
        for (var i = 0; i < headerCells.length; i++) {
          headers.push({
            index: i,
            name: headerCells[i].textContent.trim(),
            locator: './/td[' + (i + 1) + ']',
          });
        }

        // If no th elements, use first row as headers
        if (headers.length === 0) {
          var firstRow = table.querySelector('tr');
          if (firstRow) {
            var cells = firstRow.querySelectorAll('td, th');
            for (var i = 0; i < cells.length; i++) {
              headers.push({
                index: i,
                name: cells[i].textContent.trim().substring(0, 30) || 'Column ' + (i + 1),
                locator: './/td[' + (i + 1) + ']',
              });
            }
          }
        }

        // Get data rows
        var tbody = table.querySelector('tbody') || table;
        var allRows = tbody.querySelectorAll('tr');
        // Skip header row if in tbody
        var startIndex = (table.querySelector('thead')) ? 0 : 1;
        for (var i = startIndex; i < allRows.length; i++) {
          rows.push(allRows[i]);
        }
        rowLocator = table.querySelector('tbody') ? './/tbody/tr' : './/tr';
      } else {
        // Grid/div-based table — detect by role="row"
        var gridRows = table.querySelectorAll('[role="row"]');
        if (gridRows.length > 0) {
          // First row is likely header
          var headerRow = gridRows[0];
          var headerCells = headerRow.querySelectorAll('[role="columnheader"], [role="gridcell"]');
          for (var i = 0; i < headerCells.length; i++) {
            headers.push({
              index: i,
              name: headerCells[i].textContent.trim().substring(0, 30) || 'Column ' + (i + 1),
              locator: './/*[' + (i + 1) + ']',
            });
          }
          for (var i = 1; i < gridRows.length; i++) {
            rows.push(gridRows[i]);
          }
          rowLocator = './/*[@role="row"]';
        } else {
          // Fallback: use pattern detection
          var pattern = this.detectRepeatingChildren(table);
          if (pattern.itemCount >= 2) {
            rowLocator = pattern.itemSelector;
            rows = pattern.items;
          }
        }
      }

      var tableXPath = this.getXPath(table);

      return {
        table: table,
        tableXPath: tableXPath,
        headers: headers,
        rowLocator: rowLocator,
        rowCount: rows.length,
        rows: rows,
        isStandardTable: isTable,
      };
    }

    /**
     * Given an element within a repeating item, compute its relative locator
     * (relative to the item container, using {item} placeholder).
     * @param {Element} element - The target element inside a list item
     * @param {Element} itemContainer - The repeating item ancestor
     * @returns {string} - Relative XPath from item root
     */
    getRelativeLocator(element, itemContainer) {
      if (!element || !itemContainer) return '';
      if (element === itemContainer) return '.';

      var parts = [];
      var current = element;

      while (current && current !== itemContainer && current !== document) {
        var tag = current.tagName.toLowerCase();

        // Try ID first
        if (current.id && current !== element) {
          parts.unshift("//*[@id='" + current.id + "']");
          break;
        }

        // Try unique attributes
        var classAttr = current.getAttribute('class');
        var nameAttr = current.getAttribute('name');
        var roleAttr = current.getAttribute('role');

        var step = tag;
        if (nameAttr) {
          step = tag + "[@name='" + nameAttr + "']";
        } else if (roleAttr) {
          step = tag + "[@role='" + roleAttr + "']";
        } else if (classAttr) {
          var mainClass = classAttr.split(' ')[0];
          if (mainClass) {
            step = tag + "[contains(@class,'" + mainClass + "')]";
          }
        } else {
          // Use index
          var index = 1;
          var sib = current.previousElementSibling;
          while (sib) {
            if (sib.tagName === current.tagName) index++;
            sib = sib.previousElementSibling;
          }
          if (index > 1) step = tag + '[' + index + ']';
        }

        parts.unshift(step);
        current = current.parentElement;
      }

      return './' + parts.join('/');
    }

    /**
     * Generate XPath for an element.
     */
    getXPath(element) {
      if (window.__KIRO_LocatorEngine) {
        var locators = window.__KIRO_LocatorEngine.getLocators(element);
        if (locators.relativeXPath) return locators.relativeXPath;
        if (locators.absoluteXPath) return locators.absoluteXPath;
      }

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

    /**
     * Validate that a container + item locator actually finds repeating elements.
     * @param {string} containerXPath - XPath to the container
     * @param {string} itemLocator - Relative locator for items
     * @returns {number} - Number of items found
     */
    validatePattern(containerXPath, itemLocator) {
      try {
        var container = document.evaluate(
          containerXPath, document, null,
          XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;

        if (!container) return 0;

        // Build full XPath for items
        var fullXPath = containerXPath + '/' + itemLocator.replace(/^\.\//, '');
        var result = document.evaluate(
          fullXPath, document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
        );

        return result.snapshotLength;
      } catch (e) {
        return 0;
      }
    }
  }

  // Export globally
  if (!window.__KIRO_PatternDetector) {
    window.__KIRO_PatternDetector = new PatternDetector();
    console.log('[KIRO] PatternDetector ready');
  }
})();
