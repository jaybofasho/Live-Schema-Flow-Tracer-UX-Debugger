# Live Schema Flow Tracer & UX Debugger

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://marketplace.visualstudio.com)
[![Publisher](https://img.shields.io/badge/publisher-JayBoFaSho-purple.svg)](https://github.com/JayBoFaSho)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#-license--attribution)
[![Platform](https://img.shields.io/badge/IDE-VS%20Code%20%7C%20Cursor%20%7C%20Antigravity-orange.svg)](#)

**Live Schema Flow Tracer & UX Debugger** is a next-generation developer studio and real-time visual tracing extension for VS Code and modern AI IDEs. It provides live user journey mapping, bi-directional Mermaid & ERD schema synchronization, video export with voiceover dubbing & STT transcripts, multi-device viewport testing, and dynamic inline DAP breakpoints.

Developed and published by **JayBoFaSho**.

---

## 🌟 Key Highlights

- 🚀 **App Startup Confirmation & Viewport Presets**: Automatically detects application landing pages and tests responsive layouts across Web Desktop, Mobile, and Tablet presets with dynamic resolution calculators.
- 🗺️ **Live UX Flow Position Recognition**: Identifies user journey milestones in real time with canonical position signatures, breadcrumbs, route normalization, and UX phase classification.
- 🔀 **Flow Schema Merger & Junction Point Synthesis**: Ties independent recording runs and divergent branch pathways into unified, cohesive architectural flowcharts.
- 📊 **Universal Schema Import & Live Bi-Directional Editor**: Upload, visualize, and edit Mermaid flowcharts, ERDs, and state diagrams with live graph-to-code synchronization.
- 🎬 **Video Recording & Marketing Studio**: Export high-definition MP4, WebM, animated GIFs, SVG storyboard frames, or standalone interactive HTML5 players with zero dependencies.
- 🎙️ **Microphone Voiceover Dubbing & Speech-to-Text**: Synchronize audio narrations over recording sessions and export formatted transcripts to Markdown, Plain Text, SRT Subtitles, or Jira tables.
- 🎯 **Dynamic Breakpoints & Ghost Mouse Pin**: Set temporary DAP breakpoints directly onto active React/Vue handler lines and freeze screen coordinates via global OS hotkeys (`Alt+Shift+P`, `Alt+Shift+D`).

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
│  - Global OS-Level Hotkeys (Alt+Shift+P, Alt+Shift+D)                  │
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

## 🚀 Core Features

### 1. Smart App Startup & Multi-Device Proportions
When starting a debugging or recording session, the extension automatically inspects your workspace to locate the entry landing page (`index.html`, `App.tsx`, `page.tsx`, etc.). 

- **Popular Device Presets**:
  - **Desktop Web**: Full HD 1080p (`1920x1080`), Laptop HD (`1440x900`), Standard Web (`1280x720`)
  - **Mobile Phones**: iPhone 15 Pro (`393x852`, 3x), Pixel 8 (`412x915`, 2.6x), Galaxy S24 (`360x780`, 3x)
  - **Tablets**: iPad Pro 12.9" (`1024x1366`, 2x), iPad Air (`820x1180`, 2x), Galaxy Tab S9 (`800x1280`, 2x)
- **Dynamic Resolution Customizer**:
  - Real-time aspect ratio calculation (16:9, 19.5:9, 4:3, 16:10, 1:1)
  - Instant portrait/landscape orientation toggle
  - Custom pixel dimension inputs with high-DPI scaling simulation

### 2. Live UX Flow Position Recognition
As users click, type, and navigate, the tracer computes a real-time **Canonical Position Signature** representing where the user is in the UX lifecycle:
- **Phase Detection**: Automatically tags steps into phases such as `Authentication`, `Onboarding`, `Discovery`, `Checkout`, and `Administration`.
- **Breadcrumbs & Route Normalization**: Strips dynamic URL noise (`/users/123` ➔ `/users/:id`) to maintain clean, unified nodes.
- **Return Cycle Detection**: Recognizes when users return to a previously visited screen (e.g. back to Dashboard) and loops edges back rather than cluttering the graph with redundant nodes.

### 3. Flow Schema Merger & Junction Point Synthesis
Easily combine multiple recording sessions or pre-defined sub-flows (e.g., Auth Flow + Checkout Flow + Settings Flow):
- Identifies shared intersection nodes (e.g., `Landing Page`, `Dashboard`).
- Synthesizes diamond-syntax junction decision points in generated Mermaid diagrams.
- Allows testing edge cases in isolation and fusing them into an end-to-end master schema.

### 4. Universal Schema Upload & Live Bi-Directional Editor
Work directly with your existing architectural documentation:
- **Import Formats**: Mermaid Flowcharts (`graph TD / flowchart LR`), Entity-Relationship Diagrams (`erDiagram`), and State Machines (`stateDiagram-v2`).
- **Interactive Node Annotations**: Attach persistent comments, reminders, and PR notes (`%% @comment [node_id]: note`) directly to any node.
- **Live Source Drawer**: An integrated side-drawer lets you edit the raw schema code in real time while watching the visual canvas update instantly.

### 5. Studio-Grade Video Recording & Marketing Exporter
Turn recording sessions into polished engineering demonstrations and marketing collateral:
- **Export Formats**:
  - **Standalone Interactive HTML5 Player (`.html`)**: Fully self-contained, zero-dependency player with a scrubber timeline, speed controls (0.5x to 2x), and step beacons.
  - **MP4 Video (`.mp4`)**: Universal H.264 video for documentation, Jira tickets, and slide decks.
  - **WebM Video (`.webm`)**: Modern VP9 container with alpha channel support.
  - **Animated GIF (`.gif`)**: Lightweight looped preview for GitHub READMEs and chat threads.
  - **Action Highlight Frames (`.json / .svg`)**: Vector frames with cursor beacons and step badges.
- **Compression & Scaling Studio**:
  - Live file size estimator (`formattedSize`, estimated bitrate, frame count).
  - Presets: *Balanced (720p)*, *Ultra HQ (1080p)*, *High Quality*, *Compact (<10MB)*, and *Max Compression (<25MB)*.
  - Resolution scaling (0.5x, 0.75x, 1.0x, 1.5x, 2.0x).

### 6. Microphone Audio Dubbing & Speech-to-Text Written Records
Add professional voiceover commentary to your user flow captures:
- **Microphone Integration**: Built-in voiceover capture with live responsive VU audio meters.
- **Synchronized Audio Tracks**: Dubbed audio tracks are embedded into video exports and HTML5 players.
- **Speech-to-Text (STT)**: Automatically transcribes spoken commentary and links transcripts to corresponding user actions.
- **One-Click Multi-Format Copy**:
  - **Markdown**: Formatted list of timestamped steps for PR descriptions and technical docs.
  - **Plain Text**: Clean bulleted log for Slack and team messages.
  - **SRT Subtitles**: Timed subtitle file for importing into video editing tools.
  - **Jira Issue Table**: Pre-formatted Markdown table with columns for Step, Phase, Action, and Spoken Note.

### 7. Dynamic Inline Debugging (DAP) & Ghost Mouse Pin
- **`⌃⌘P` / `⌥⌘P` (Mac) or `Alt+Shift+P` (Win)**: Freezes screen coordinates with a transparent, click-through overlay showing the active step counter and timestamp. All mouse events pass straight through to the underlying application.
- **`⌃⌘D` / `⌥⌘D` (Mac) or `Alt+Shift+D` (Win)**: Dynamically resolves the clicked element through React Fiber or Vue AST and sets an inline breakpoint in VS Code at the exact file and handler function (e.g. `LoginForm.tsx:handleSubmit`).

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

## ⚙️ Extension Settings

Configure Live Schema Flow Tracer via `Settings > Extensions > Flow Tracer`:

- `flowtracer.sidecarPort`: Local WebSocket port for the native capture sidecar (default: `54321`).
- `flowtracer.cdpPort`: Chrome DevTools Protocol remote debugging port (default: `9222`).
- `flowtracer.defaultViewport`: Default viewing proportions preset (`Desktop HD`, `iPhone 15 Pro`, etc.).
- `flowtracer.defaultVideoPreset`: Default compression preset for video exports (`balanced`, `ultra`, `compact`).
- `flowtracer.enableActionHighlights`: Toggle glowing cursor beacons in exported recordings (default: `true`).
- `flowtracer.speechLanguage`: Target language code for Speech-to-Text transcription (default: `en-US`).

---

## 🚦 Quick Start Guide

1. **Install and Activate**:
   Click on the **Live Flow Tracer** icon in your Activity Bar or run `Flow Tracer: Focus Flow Lens Sidebar`.
2. **Confirm App Startup**:
   Run `Flow Tracer: App Startup Confirmation` to auto-detect your project's landing page and select your target viewing proportions (Desktop, Mobile, or Tablet).
3. **Record & Explore**:
   Click **Start Live Recording**. Click around your application. Watch nodes, breadcrumbs, and UX phases populate live in the Flow Lens view!
4. **Debug & Export**:
   - Hit `Alt+Shift+D` to set a dynamic breakpoint at the active step.
   - Click **Record & Export Video** to generate a demonstration video or interactive HTML5 player.
   - Click **Copy Transcript** to paste formatted release notes into your pull request.

---

## 📄 License & Attribution

- **Publisher**: **JayBoFaSho**
- **License**: MIT License
- **Issues & Contributions**: Please report issues and feature suggestions through your repository's issue tracker.
