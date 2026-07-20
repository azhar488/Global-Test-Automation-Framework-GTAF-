# Global-Test-Automation-Framework-GTAF-

# KIRO Recorder - AI Powered Test Automation Platform

## Overview

KIRO Recorder is an AI-powered test automation platform designed to simplify and accelerate end-to-end test automation. It enables users to record browser interactions, enhance test flows using natural language, and automatically generate maintainable automation frameworks.

Unlike traditional recorders that generate static scripts, KIRO focuses on understanding user intent and converting it into intelligent, reusable automation.

---

# Vision

Build an automation platform where users can:

* Record browser interactions.
* Edit recorded steps visually.
* Add business logic using natural language.
* Generate production-ready automation frameworks.
* Execute tests.
* Analyze failures using AI.
* Support multiple automation frameworks from the same recording.

---

# Key Features

## Smart Recorder

* Record browser interactions.
* Capture page navigation.
* Record clicks, typing, selections, checkboxes, radio buttons, uploads, etc.
* Capture page metadata and locators.

---

## Visual Step Editor

* Delete recorded steps.
* Reorder steps.
* Edit recorded actions.
* Duplicate steps.
* Convert recorded actions into dynamic actions.

---

## AI Logic Builder

Enhance any recorded step using natural language.

Examples:

* Click the product having a 35% discount.
* Execute this step only if the popup is visible.
* Repeat this step for every customer.
* Store the generated Order ID into a variable.
* Retry this step three times if it fails.

The AI converts user intent into structured automation logic without requiring programming knowledge.

---

## Supported Logic Blocks

* IF
* ELSE (Planned)
* ELSE IF (Planned)
* FOR EACH
* WHILE
* Store Variable
* Wait
* Retry
* Assertions
* Try-Catch (Planned)

---

## Dynamic Automation

Generate intelligent automation capable of:

* Dynamic element selection
* Runtime filtering
* Collection traversal
* Variable storage
* Reusable business logic

---

## Code Generation

Generate automation frameworks such as:

* Selenium + Java + TestNG
* Playwright (Planned)
* Cypress (Planned)
* Additional frameworks in future releases

---

# Architecture

```text
Browser Recorder
        │
        ▼
Recorded Steps
        │
        ▼
Visual Step Editor
        │
        ▼
AI Logic Builder
        │
        ▼
Structured Test Model
        │
        ▼
Script Generator
        │
        ▼
Automation Framework
```

---

# Example Workflow

1. Record a test.
2. Review recorded steps.
3. Delete or edit unnecessary actions.
4. Add AI-powered conditions or loops.
5. Store runtime values as variables.
6. Generate automation scripts.
7. Execute tests.
8. View execution reports.

---

# Future Roadmap

* AI self-healing locators
* Browser MCP integration
* API automation support
* Database validation
* Jira integration
* GitHub integration
* Dashboard & Analytics
* AI-powered failure analysis
* Cross-browser execution
* Cloud execution support

---

# Project Structure

```text
KIRO/
├── Recorder
├── Step Editor
├── AI Engine
├── Script Generator
├── Execution Engine
├── Reporting
└── Dashboard
```

---

# Design Principles

* AI First
* Framework Agnostic
* Extensible Architecture
* Human Readable Automation
* Low-Code Experience
* Production Ready Code Generation

---

# Technology Stack

Frontend

* React
* TypeScript

Recorder

* Chrome Extension

Backend

* Java / Spring Boot

Automation

* Selenium
* TestNG

AI

* OpenAI
* MCP Integration (Planned)

---

# Contributing

Contributions are welcome.

Please create feature branches and submit pull requests with proper documentation and test coverage.

---

# License

MIT License

---

**KIRO — Build Automation Smarter, Not Harder.**
