---
nexus_doc: true
id: "06_test_strategy"
title: "Test Strategy"
status: template
confidence: low
last_updated: "2026-08-22"
---

# Test Strategy

**Project:** @Deepseek Ai/Dsh Root
**Framework:** vitest

---

## 🧪 Testing Philosophy
<!-- Coverage target, what gets tested, what doesn't -->

**Coverage Target:** 80%+

## 📋 Test Types

| Type | Tool | Coverage |
|------|------|----------|
| Unit | vitest | Core logic, utilities, validators |
| Integration | vitest | API routes, data flows |
| E2E | Playwright | Critical user journeys |

## 🏃 Running Tests

```bash
pnpm test              # Run all tests
pnpm test -- --watch   # Watch mode
```
