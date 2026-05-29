# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project type

Chrome Extension (Manifest V3) — vanilla JS + HTML + CSS, no build step, no framework, no package manager. Files are loaded directly by Chrome from disk.

## Commands

There is no build, lint, or test runner. Work is verified by reloading the unpacked extension and exercising it against ViettelPost or the local mock.

```powershell
# Reload after editing files: chrome://extensions → click ↻ on "VTP Tool All-in-One"

# Local mock VTP server (covers Module 2 Kiểm Kê pages)
node tools/test_server/server.js     # http://localhost:3000/viettelpost/kiem-ke-buu-pham
```

The extension only runs against `*.viettelpost.vn`, `*.viettelpost.com.vn`, and `localhost` (see `host_permissions` in [manifest.json](manifest.json)). Anything else and the side panel reports "Chưa sẵn sàng".

## Architecture

Two independent modules share one Side Panel UI. They differ in **how** they get into the page, which is the main thing to keep straight when editing:

| Module | Entry | Injection model |
|---|---|---|
| 1. Sửa Giờ ([src/modules/chinhgio/](src/modules/chinhgio/)) | Side panel button | `chrome.scripting.executeScript` from [sidepanel.js](src/ui/sidepanel.js) per bill, `world: 'MAIN'` |
| 2. Kiểm Kê Tuyến ([src/modules/kiemke/](src/modules/kiemke/)) | Side panel button | `chrome.scripting.executeScript` per route, `world: 'MAIN'` |

[background.js](background.js) is a thin service worker — its only job is `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so clicking the toolbar icon opens the panel. No message routing happens here; the side panel does all orchestration.

### Where Sửa Giờ gets its bill list (Excel picker)

Module 1 does **not** take a pasted textarea of tracking numbers. The side panel loads an `.xlsx` file through [src/shared/xlsx_parser.js](src/shared/xlsx_parser.js) (`window.VTPXlsx`), groups rows by customer, and the selected customer's orders become the per-bill loop input:

- The file **must** contain columns `TEN_KHGUI` (customer name) and `MA_PHIEUGUI` (tracking number) — [sidepanel.js](src/ui/sidepanel.js) hard-errors otherwise.
- `VTPXlsx.groupBy(byHeader, 'TEN_KHGUI', 'MA_PHIEUGUI')` returns a `Map<customer, trackingNumber[]>` sorted by order count descending; this drives the searchable customer checklist UI.
- `xlsx_parser.js` is a **dependency-free** XLSX reader: it parses the ZIP container by hand (EOCD → central directory → local file headers) and inflates `deflate` entries with the browser-native `DecompressionStream('deflate-raw')`. ZIP64 files are explicitly rejected. There is no SheetJS / npm dependency — keep it that way (no build step).
- It reads only `xl/worksheets/sheet1.xml` (first sheet) and resolves `sharedStrings` / `inlineStr` / number cells. Cell-attribute order is not assumed (see `Fix #29`). Keys and values are NBSP-normalized in `groupBy` (`Fix #31`).

### The MAIN-world / ISOLATED-world trap

Both modules are injected with `world: 'MAIN'` so they can touch the page's ZK Framework objects. **`chrome.*` APIs are not available in MAIN world** — including `chrome.storage.local.set`. This has bitten the codebase repeatedly (see `Fix #23` in [sidepanel.js](src/ui/sidepanel.js)).

Cross-world signaling between MAIN-world content scripts and the side panel works as follows:
- Side panel writes signal sentinels (`__VTP_SELECTED_ROUTE__`, `__VTP_5STEPS_INJECTED__`) onto `window` via a separate `executeScript` call.
- MAIN-world content script signals completion by **reloading the tab** (`location.reload()`) — the side panel listens via `chrome.tabs.onUpdated` for the reload, since `chrome.storage` writes from MAIN are silently dropped.
- Storage keys prefixed `__VTP_*` (e.g. `__VTP_CHINHGIO_STEP_DONE__`, `__VTP_SCAN_COMPLETE__`) are written from **ISOLATED-world** wrapper injections, not from MAIN.

When editing either module: never call `chrome.storage` from inside a MAIN-world function. Either inject a separate ISOLATED-world script for the storage write, or use the tab-reload pattern.

### Side panel as orchestrator

[src/ui/sidepanel.js](src/ui/sidepanel.js) is the controller that runs the per-bill / per-route loops for both modules from outside the page. The page-side scripts process **one item then exit** — the loop lives in the side panel. This is a deliberate design ([chinhgio_content.js v3.x](src/modules/chinhgio/chinhgio_content.js)) to avoid Chrome throttling background tabs that hold long-running JS loops.

For Sửa Giờ, the loop additionally hardens against background-tab throttling by:
- Using `MutationObserver`-based waits (`waitForElement` / `waitForElementGone` / `waitForElementBy`) instead of fixed `setTimeout` delays — observers fire even when timers are throttled.
- Sidepanel timeout per bill is 300s with retry-on-busy/timeout, since a throttled tab can run 2-3x slower.

### Module 2 sub-pipeline

Kiểm Kê Tuyến chains four scripts in order — keep this sequence in mind when changing any of them:

1. [kiemke_tuyen_auto.js](src/modules/kiemke/kiemke_tuyen_auto.js) — drives the 5-step ZK dropdown/dialog flow to enter the scan page
2. [gapton_settings.js](src/modules/kiemke/gapton_settings.js) — valid barcode prefixes (`SHOPEE`, `VTP`, `VGI`, `PKE`, `KMS`, `PSL`, `TPO`, …)
3. [gapton_smart_delay.js](src/modules/kiemke/gapton_smart_delay.js) — `MutationObserver` wait for ZK confirm
4. [gapton_core_scan.js](src/modules/kiemke/gapton_core_scan.js) — barcode loop + HUD + pagination + final F5

`gapton_core_scan.js` always finishes with `location.reload()` — this is the completion signal the side panel waits on. Don't remove it.

## ZK Framework selectors

The target site is built on ZK. Selectors used throughout: `.z-combobox`, `.z-combobox-input`, `.z-tab`, `.z-tab-text`, `a.z-tab-content`, `button.z-button`, `.z-loading-indicator`. ZK reuses class names heavily — match by **text content** (with NBSP normalization, see `normalizeText` in [kiemke_tuyen_auto.js](src/modules/kiemke/kiemke_tuyen_auto.js)) rather than relying on positional CSS selectors. Multiple fallback strategies are the norm here (e.g. `switchToUnscannedTab` has 3).

## Conventions

- Vietnamese for all user-facing strings, comments, and console logs (prefixed `[VTP …]`).
- Re-injection guards on every content script: `if (window.__VTP_X_RUNNING__) return; window.__VTP_X_RUNNING__ = true;`. Preserve these — Chrome can re-inject on SPA navigation.
- Toasts via `window.VTPNotification.show(msg, type)` from [src/shared/notification.js](src/shared/notification.js); avoid `alert()`.
- File-header comment blocks track version + bug-fix history (`v3.0 — Background-Tab Safe`, `Fix #23: …`). When making non-trivial changes, append a numbered fix line rather than rewriting history.
