# Live Schema Flow Tracer & UX Debugger

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://marketplace.visualstudio.com)
[![Publisher](https://img.shields.io/badge/publisher-JayBoFaSho-purple.svg)](https://github.com/JayBoFaSho)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-green.svg)](#-license--attribution)
[![Pro Available](https://img.shields.io/badge/Flow%20Tracer-PRO%20Available-purple.svg)](#-free-vs-pro-editions)
[![Platform](https://img.shields.io/badge/IDE-VS%20Code%20%7C%20Cursor%20%7C%20Antigravity-orange.svg)](#)

**Live Schema Flow Tracer & UX Debugger** is a next-generation developer studio and real-time visual tracing extension for VS Code, Cursor, and modern AI IDEs. It provides live user journey mapping, bi-directional Mermaid & ERD schema synchronization, video export with voiceover dubbing & STT transcripts, multi-device viewport testing, and dynamic inline DAP breakpoints.

Developed and published by **JayBoFaSho**.

---

## 🌟 Key Highlights

- 🚀 **App Startup Confirmation & Viewport Presets**: Automatically detects application landing pages and tests responsive layouts across Web Desktop, Mobile, and Tablet presets with dynamic resolution calculators.
- 🗺️ **Live UX Flow Position Recognition**: Identifies user journey milestones in real time with canonical position signatures, breadcrumbs, route normalization, and UX phase classification.
- 🔀 **Flow Schema Merger & Junction Point Synthesis**: Ties independent recording runs and divergent branch pathways into unified, cohesive architectural flowcharts.
- 📊 **Universal Schema Import & Live Bi-Directional Editor**: Upload, visualize, and edit Mermaid flowcharts, ERDs, and state diagrams with live graph-to-code synchronization.
- 🎬 **Video Recording & Marketing Studio**: Export high-definition MP4, WebM, animated GIFs, SVG storyboard frames, or standalone interactive HTML5 players with zero dependencies.
- 🎙️ **Microphone Voiceover Dubbing & Speech-to-Text**: Synchronize audio narrations over recording sessions and export formatted transcripts to Markdown, Plain Text, SRT Subtitles, or Jira tables.
- 🎯 **Dynamic Breakpoints & Ghost Mouse Pin**: Set temporary DAP breakpoints directly onto active React/Vue handler lines and freeze screen coordinates via global hotkeys (Mac: `⌃⌘P`, `⌥⌘P` / Win: `Alt+Shift+P`, `Alt+Shift+D`).

---

## 📐 Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                     IDE Extension Host (TypeScript)                    │
│  - Webview Flow Lens Canvas (XYFlow / SVG Rendering Engine)            │
│  - Debug Adapter Protocol (DAP) Breakpoint Injector                    │
│  - Bi-directional Schema Parser (Mermaid Flowchart, ERD, State)        │
│  - Video & Audio Dubbing Studio (WebM/MP4, Live Size Estimator)        │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ IPC / WebSocket (ws://127.0.0.1:54321)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Native Capture Sidecar Daemon                       │
│  - Global OS-Level Hotkeys (Mac: ⌃⌘P / ⌥⌘P | Win: Alt+Shift+P)        │
│  - Transparent Click-Through Overlay (Ghost Mouse Pin)                 │
│  - Frame Timing & Event Coordinate Normalization                       │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Target Process Instrumentation
┌───────────────────────────────────▼────────────────────────────────────┐
│                     Target Application Under Test                      │
│  - Chrome DevTools Protocol (CDP) WebSocket Bridge                     │
│  - React Fiber (__reactFiber$) & Vue AST Source Resolution Probe       │
│  - DOM Event & URL History Interceptor (__flowtracer_probe)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Subsystems

1. **`packages/extension`**: VS Code extension host managing commands, DAP breakpoints, CDP sessions, and the Flow Lens webview.
2. **`packages/sidecar`**: Background capture daemon with WebSocket server on port 54321 and native macOS transparent click-through overlay (`bin/ghost-overlay`).
3. **`packages/tracer`**: Injected probe (`window.__flowtracer_probe`) that listens to DOM events, parses React Fiber (`__reactFiber$`), and hooks route changes.
4. **`demo-app`**: Ready-to-run demo application to test live recording, viewport proportions, and AST source resolution.

---

## ⌨️ Global & In-Webview Keyboard Shortcuts

| Action | macOS (No Alt Required) | macOS (Option Key) | Windows / Linux | Description |
|---|---|---|---|---|
| **Pause / Resume Recording (Ghost Pin)** | `⌃⌘P` (Control+Command+P) | `⌥⌘P` or `⌥⇧P` | `Alt+Shift+P` | Freezes coordinates with ghost pin overlay without stopping session |
| **Debug Active Step (Dynamic Breakpoint)** | `⌃⌘D` (Control+Command+D) | `⌥⌘D` or `⌥⇧D` | `Alt+Shift+D` | Sets inline DAP breakpoint at the handler code line |
| **Add Comment / User Note** | `⌃⌘C` (Control+Command+C) | `⌥⌘C` or `⌥⇧C` | `Alt+Shift+C` | Attaches architectural note to active step node |
| **Start / Stop Live Flow Trace** | `⌃⌘R` (Control+Command+R) | `⌥⌘R` | `Alt+Shift+R` | Toggles live event recording and AST capture |
| **Open / Toggle Localhost Preview** | `⌃⌘L` (Control+Command+L) | `⌥⌘L` | `Alt+Shift+L` | Opens the moveable, resizable center preview docker |

---

## 💻 Available Commands

Access these commands from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command Title | Identifier | Default Keybinding | Description |
|---|---|:---:|---|
| **Flow Tracer: Focus Flow Lens Sidebar** | `flowtracer.focusSidebar` | — | Focus the Flow Lens & UX Debugger sidebar |
| **Flow Tracer: App Startup Confirmation** | `flowtracer.confirmStartup` | — | Select landing page and preset/dynamic viewing proportions |
| **Flow Tracer: Start Live Recording** | `flowtracer.startRecorder` | `⌃⌘R` / `Alt+Shift+R` | Begin live event capture and AST resolution |
| **Flow Tracer: Stop Recording & View Flow** | `flowtracer.stopRecorder` | — | Terminate active recording and open the interactive canvas |
| **Flow Tracer: Pause/Resume Recording (Ghost Pin)** | `flowtracer.pauseRecorder` | `⌃⌘P` / `Alt+Shift+P` | Toggle screen coordinate freeze without losing session state |
| **Flow Tracer: Open Interactive Flow Viewer** | `flowtracer.openFlowViewer` | — | Launch the full-tab visual Flow Lens canvas |
| **Flow Tracer: Debug Active Step (Dynamic Breakpoint)** | `flowtracer.debugOperation` | `⌃⌘D` / `Alt+Shift+D` | Set a dynamic DAP breakpoint at the current step handler |
| **Flow Tracer: Export Flow (Mermaid & Playwright)** | `flowtracer.exportSession` | — | Generate `.mmd` diagrams and `.spec.ts` test specs |
| **Flow Tracer: Merge App Flow Schema** | `flowtracer.mergeFlows` | — | Unify multiple sessions or preset branches into one schema |
| **Flow Tracer: Upload / Import Schema** | `flowtracer.uploadSchema` | — | Load Mermaid, ERD, or JSON schema files from disk or clipboard |
| **Flow Tracer: Edit Schema Source** | `flowtracer.editSchema` | — | Open the live bi-directional schema code editor drawer |
| **Flow Tracer: Add Comment to Flow Node** | `flowtracer.addComment` | `⌃⌘C` / `Alt+Shift+C` | Attach architectural notes and annotations to graph nodes |
| **Flow Tracer: Open Localhost Preview (Center Editor)** | `flowtracer.openLocalhostPreview` | `⌃⌘L` / `Alt+Shift+L` | Open or focus the Localhost Preview Docker |
| **Flow Tracer: Record & Export Video** | `flowtracer.exportVideo` | — | Open the Video Recording Studio (MP4, WebM, GIF, HTML5) |
| **Flow Tracer: Export Action Highlights** | `flowtracer.exportActionHighlights` | — | Export vector SVG frames and storyboard bundles |
| **Flow Tracer: Copy Speech-to-Text Written Transcripts** | `flowtracer.copyTranscript` | — | Copy transcripts in Markdown, Plain Text, SRT, or Jira format |
| **Flow Tracer: Record Microphone Voiceover & Audio Dub** | `flowtracer.recordVoiceover` | — | Open the voiceover dubbing studio with live audio level meter |

---

## 🚦 Quick Start Guide

### 1. Build and Test
```bash
npm install
npm run build
npm test
```

### 2. Run the Sidecar Daemon
```bash
npm --workspace=packages/sidecar run start
```

### 3. Open Demo App in Browser
Launch `demo-app/index.html` or serve via a local server. Open the extension in VS Code (`F5`) and run `Flow Tracer: Start Live Recording`.

---

## ⚡ Free vs. Pro Editions

Flow Tracer is designed with an **open-core, offline-first** architecture. The core development and debugging engine is completely free for individual developer use, while studio-grade export and documentation accelerators are part of **Flow Tracer Pro**.

| Feature | Community / Free | Flow Tracer Pro |
|---|:---:|:---:|
| **Live UX Flow Position Recognition** | ✅ Full | ✅ Full |
| **Dynamic Breakpoints & Ghost Mouse Pin** | ✅ Full | ✅ Full |
| **Universal Schema Import & Bi-Directional Editor** | ✅ Full | ✅ Full |
| **Interactive Flow Viewer Canvas** | ✅ Full | ✅ Full |
| **Interactive HTML5 Player Export** | ✅ Full | ✅ Full |
| **WebM Video Export (Balanced & Compact)** | ✅ Full | ✅ Full |
| **Plain Text & Markdown Transcript Copy** | ✅ Full | ✅ Full |
| **Studio Video Exporter (MP4, GIF, Action Frame Bundles)** | — | ⚡ **PRO** |
| **High & Ultra HQ Compression Presets** | — | ⚡ **PRO** |
| **Microphone Voiceover Dubbing Studio** | — | ⚡ **PRO** |
| **One-Click Jira Issue Tables & SRT Subtitle Export** | — | ⚡ **PRO** |
| **Offline License Cryptographic Verification** | — | ⚡ **PRO** |

### Activating Pro
1. Obtain a license key from [Polar.sh](https://polar.sh/thrice-wise-enterprise/subscriptions).
2. Open VS Code Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
3. Run **`Flow Tracer: Enter License Key`** and paste your key.
4. Activation completes with an offline-verifiable signature bound to your machine. No continuous internet connection required!

---

## 📄 License & Attribution

- **Publisher**: **JayBoFaSho**
- **License**: **Functional Source License, Version 1.1, MIT Change License (FSL-1.1-MIT)**
- **Permitted Use**: Free for non-commercial and individual development use. Commercial and enterprise production use requires an authorized license key.
- **Conversion to MIT**: Each release automatically converts to standard open-source MIT License two (2) years after release.

