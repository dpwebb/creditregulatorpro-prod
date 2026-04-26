import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import pty from "node-pty";

const PORT = Number(process.env.PORT || 3031);
const WORKDIR = process.env.WORKDIR || "/opt/creditregulatorpro-staging/app";
const PREVIEW_URL = process.env.PREVIEW_URL || "https://staging.creditregulatorpro.com/login";
const CODEX_BIN = process.env.CODEX_BIN || "codex";

const app = express();
app.use(express.json({ limit: "1mb" }));

let currentPreviewUrl = PREVIEW_URL;
let term = null;
let termOpen = false;
let lastExit = null;
let lastTerminalSize = { cols: 120, rows: 35 };
let auditLog = [];
let auditBuffer = "";
const clients = new Set();

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) client.send(message);
  }
}

function appendAuditEntry(level, text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return;

  const timestamp = new Date().toISOString().replace("T", " ").replace(/\..+/, "");
  const entry = `[${timestamp}] ${level}: ${cleaned}`;

  auditLog.push(entry);
  if (auditLog.length > 2000) {
    auditLog = auditLog.slice(-1000);
  }

  broadcast({ type: "audit", data: entry + "\n" });
}

function getSessionState() {
  return {
    running: termOpen,
    previewUrl: currentPreviewUrl,
    workdir: WORKDIR,
    codexBin: CODEX_BIN,
    lastExit,
    terminalSize: lastTerminalSize,
    auditLog: auditLog.join("\n"),
  };
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function killSession() {
  if (!term) return;
  try {
    term.kill();
  } catch {}
  term = null;
  termOpen = false;
}

function normalizeTerminalSize(size = {}) {
  return {
    cols: Math.max(40, Number(size.cols || lastTerminalSize.cols || 120)),
    rows: Math.max(12, Number(size.rows || lastTerminalSize.rows || 35)),
  };
}

function createSession(initialSize = lastTerminalSize) {
  killSession();

  const { cols, rows } = normalizeTerminalSize(initialSize);
  lastTerminalSize = { cols, rows };

  const shell = process.env.SHELL || "/bin/bash";
  const command = `cd ${shellEscape(WORKDIR)} && ${shellEscape(CODEX_BIN)}`;

  term = pty.spawn(shell, ["-lc", command], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: WORKDIR,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  termOpen = true;
  lastExit = null;

  appendAuditEntry("system", `Started Codex in ${WORKDIR} (${cols}x${rows})`);
  broadcast({ type: "session", data: getSessionState() });
  broadcast({ type: "output", data: `\r\n[system] Started Codex in ${WORKDIR} (${cols}x${rows})\r\n` });

  term.onData((data) => {
    broadcast({ type: "output", data });

    const cleanedChunk = String(data)
      .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/\x1B\][^\x07]*(\x07|\x1B\\)/g, "")
      .replace(/\x1B[@-_]/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/\r/g, "");

    if (!cleanedChunk) return;

    auditBuffer += cleanedChunk;
    const lines = auditBuffer.split("\n");
    auditBuffer = lines.pop() || "";

    for (const rawLine of lines) {
      const plain = String(rawLine).trim();
      if (!plain) continue;
      if (/^[╭╰│─┌┐└┘\s]+$/.test(plain)) continue;
      if (plain.startsWith("│") || plain.startsWith("╭") || plain.startsWith("╰")) continue;
      if (plain.startsWith("›")) continue;
      if (plain.startsWith(">")) continue;
      if (plain.includes("gpt-5.5 default ·")) continue;
      if (plain.includes("/model to change")) continue;
      if (plain.startsWith("directory:")) continue;
      if (plain.startsWith("model:")) continue;
      if (plain.startsWith("Tip:")) continue;
      if (plain.startsWith("OpenAI Codex")) continue;

      if (/bubblewrap/i.test(plain)) {
        appendAuditEntry("warning", plain);
        continue;
      }

      if (/^Booting MCP server:/i.test(plain)) {
        appendAuditEntry("system", plain);
        continue;
      }

      appendAuditEntry("codex", plain);
    }
  });

  term.onExit(({ exitCode, signal }) => {
    termOpen = false;
    lastExit = { exitCode, signal, at: new Date().toISOString() };
    appendAuditEntry("system", `Codex exited. code=${exitCode} signal=${signal}`);
    broadcast({ type: "output", data: `\r\n[system] Codex exited. code=${exitCode} signal=${signal}\r\n` });
    broadcast({ type: "session", data: getSessionState() });
    term = null;
  });
}

function resizeSession(cols, rows) {
  const safe = normalizeTerminalSize({ cols, rows });
  lastTerminalSize = safe;

  if (!term) return;
  try {
    term.resize(safe.cols, safe.rows);
  } catch {}
}

function normalizeStartSize(message) {
  return {
    cols: Math.max(40, Number(message.cols || lastTerminalSize.cols || 120)),
    rows: Math.max(12, Number(message.rows || lastTerminalSize.rows || 35)),
  };
}

app.get("/config", (_req, res) => {
  res.json(getSessionState());
});

app.post("/api/preview", (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: "Preview URL must start with http:// or https://" });
  }
  currentPreviewUrl = url;
  broadcast({ type: "session", data: getSessionState() });
  res.json({ ok: true, ...getSessionState() });
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Codex Browser UI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm/css/xterm.css" />
  <style>
    :root {
      --bg: #0b1020;
      --panel: #11182b;
      --panel2: #0f172a;
      --border: #24324d;
      --text: #e5edf9;
      --muted: #9fb0cf;
      --accent: #4f8cff;
      --danger: #ff5d6c;
      --ok: #4ade80;
      --splitter-size: 10px;
      --inner-splitter-size: 8px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font: 14px system-ui, sans-serif;
      overflow: hidden;
    }
    body.is-resizing-x { cursor: col-resize; user-select: none; }
    body.is-resizing-y { cursor: row-resize; user-select: none; }
    .app {
      display: grid;
      grid-template-rows: auto 1fr;
      height: 100%;
      overflow: hidden;
    }
    .topbar {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid var(--border);
      background: #0d1528;
    }
    .brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .workspace {
      display: grid;
      grid-template-columns: minmax(300px, 1fr) var(--splitter-size) minmax(320px, 1fr);
      min-width: 0;
      min-height: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .left-pane {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(180px, 1fr) var(--inner-splitter-size) minmax(120px, 220px) auto;
      overflow: hidden;
      background: var(--panel2);
    }
    .panel {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: var(--panel2);
      overflow: hidden;
    }
    .right-panel {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      background: var(--panel2);
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,.02);
      min-width: 0;
      overflow: hidden;
    }
    .grow { flex: 1; min-width: 0; }
    .resizer-x, .resizer-y {
      position: relative;
      background: #20304f;
      z-index: 20;
    }
    .resizer-x { cursor: col-resize; }
    .resizer-y { cursor: row-resize; background: #1a2741; }
    .resizer-x::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 3px;
      height: 72px;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: rgba(255,255,255,.25);
      box-shadow: -6px 0 0 rgba(255,255,255,.18), 6px 0 0 rgba(255,255,255,.18);
      pointer-events: none;
    }
    .resizer-y::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 72px;
      height: 3px;
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: rgba(255,255,255,.25);
      box-shadow: 0 -6px 0 rgba(255,255,255,.18), 0 6px 0 rgba(255,255,255,.18);
      pointer-events: none;
    }
    .button, .input {
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 12px;
      min-width: 0;
    }
    .button { cursor: pointer; flex: 0 0 auto; }
    .button.primary { background: var(--accent); border-color: var(--accent); color: white; }
    .button.danger { background: #2b1320; border-color: #703040; color: #ffd7dc; }
    .input { width: 100%; }
    .promptbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 10px;
      padding: 12px;
      border-top: 1px solid var(--border);
      min-width: 0;
      overflow: hidden;
      align-items: end;
      background: var(--panel2);
    }
    .prompt-input {
      resize: none;
      overflow-y: auto;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.4;
      min-height: 52px;
      max-height: 180px;
    }
    #terminal {
      min-width: 0;
      min-height: 0;
      padding: 16px;
      overflow: hidden;
    }
    #terminal .xterm {
      height: 100%;
      width: 100%;
    }
    .audit-wrap {
      min-width: 0;
      min-height: 0;
      padding: 12px 16px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: #0c1428;
    }
    .preview-wrap {
      position: relative;
      min-width: 0;
      min-height: 0;
      background: #000;
      overflow: hidden;
    }
    .preview-wrap.drag-shield::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 10;
      background: transparent;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: white;
    }
    .status {
      font-size: 12px;
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      flex: 0 0 auto;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #64748b;
    }
    .dot.ok { background: var(--ok); }
    .dot.off { background: var(--danger); }
    @media (max-width: 1100px) {
      body.is-resizing-x, body.is-resizing-y { cursor: default; }
      .workspace {
        grid-template-columns: 1fr;
        grid-template-rows: minmax(320px, 1fr) var(--splitter-size) minmax(320px, 1fr);
      }
      .resizer-x { cursor: row-resize; }
      .resizer-x::after {
        width: 72px;
        height: 3px;
        box-shadow: 0 -6px 0 rgba(255,255,255,.18), 0 6px 0 rgba(255,255,255,.18);
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="brand">
        <strong>Codex Browser UI</strong>
        <div class="muted">workdir: ${WORKDIR}</div>
      </div>
      <button id="startBtn" class="button primary">Start</button>
      <button id="restartBtn" class="button">Restart</button>
      <button id="stopBtn" class="button danger">Stop</button>
    </div>

    <div class="workspace" id="workspace">
      <section class="left-pane" id="leftPane">
        <section class="panel">
          <div class="panel-header">
            <strong>Codex Terminal</strong>
            <div class="grow"></div>
            <div class="status"><span id="runDot" class="dot off"></span><span id="runText">stopped</span></div>
          </div>
          <div id="terminal"></div>
        </section>

        <div class="resizer-y" id="resizerY"></div>

        <section class="panel">
          <div class="panel-header">
            <strong>Audit Log</strong>
            <div class="grow"></div>
            <button id="clearAuditBtn" class="button">Clear Display</button>
          </div>
          <div class="audit-wrap" id="auditLog"></div>
        </section>

        <div class="promptbar">
          <textarea id="promptInput" class="input prompt-input" rows="2" placeholder="Type a Codex prompt and press Send..."></textarea>
          <button id="sendBtn" class="button primary">Send</button>
          <button id="clearBtn" class="button">Clear</button>
        </div>
      </section>

      <div class="resizer-x" id="resizerX"></div>

      <section class="right-panel">
        <div class="panel-header">
          <strong>Staging Preview</strong>
          <div class="grow"></div>
          <input id="previewUrl" class="input" style="max-width:420px" value="${currentPreviewUrl}" />
          <button id="applyPreviewBtn" class="button">Apply</button>
          <button id="reloadPreviewBtn" class="button">Reload</button>
          <button id="openPreviewBtn" class="button">Open</button>
        </div>
        <div class="preview-wrap" id="previewWrap">
          <iframe id="previewFrame" src="${currentPreviewUrl}"></iframe>
        </div>
        <div class="promptbar" style="grid-template-columns:1fr;">
          <div class="muted">After a successful change, commit and push staging, then reload preview.</div>
        </div>
      </section>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/xterm/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
  <script>
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      theme: { background: "#0f172a", foreground: "#e5edf9" },
      fontSize: 14,
      scrollback: 5000
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById("terminal"));
    fitAddon.fit();

    const state = {
      ws: null,
      previewUrl: ${JSON.stringify(PREVIEW_URL)},
      isDraggingX: false,
      isDraggingY: false
    };

    const el = {
      startBtn: document.getElementById("startBtn"),
      restartBtn: document.getElementById("restartBtn"),
      stopBtn: document.getElementById("stopBtn"),
      sendBtn: document.getElementById("sendBtn"),
      clearBtn: document.getElementById("clearBtn"),
      clearAuditBtn: document.getElementById("clearAuditBtn"),
      promptInput: document.getElementById("promptInput"),
      previewUrl: document.getElementById("previewUrl"),
      applyPreviewBtn: document.getElementById("applyPreviewBtn"),
      reloadPreviewBtn: document.getElementById("reloadPreviewBtn"),
      openPreviewBtn: document.getElementById("openPreviewBtn"),
      previewFrame: document.getElementById("previewFrame"),
      previewWrap: document.getElementById("previewWrap"),
      runDot: document.getElementById("runDot"),
      runText: document.getElementById("runText"),
      workspace: document.getElementById("workspace"),
      leftPane: document.getElementById("leftPane"),
      resizerX: document.getElementById("resizerX"),
      resizerY: document.getElementById("resizerY"),
      auditLog: document.getElementById("auditLog")
    };

    function setRunning(running) {
      el.runDot.className = "dot " + (running ? "ok" : "off");
      el.runText.textContent = running ? "running" : "stopped";
    }

    function sendMessage(payload) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(payload));
        return true;
      }
      return false;
    }

    function getCurrentTerminalSize() {
      fitAddon.fit();
      return {
        cols: Math.max(40, term.cols || 120),
        rows: Math.max(12, term.rows || 35)
      };
    }

    function sendResize() {
      const size = getCurrentTerminalSize();
      sendMessage({ type: "resize", cols: size.cols, rows: size.rows });
    }

    function refitSoon() {
      setTimeout(sendResize, 25);
      setTimeout(sendResize, 75);
      setTimeout(sendResize, 150);
      setTimeout(sendResize, 300);
      setTimeout(sendResize, 500);
    }

    function appendAudit(text) {
      el.auditLog.textContent += text;
      el.auditLog.scrollTop = el.auditLog.scrollHeight;
    }

    function setWorkspaceColumnsByRatio(ratio) {
      if (window.innerWidth < 1100) return;
      const safeRatio = Math.max(0.25, Math.min(ratio, 0.8));
      el.workspace.style.gridTemplateColumns = safeRatio + "fr 10px " + (1 - safeRatio) + "fr";
      localStorage.setItem("codex-ui-split-ratio-x", String(safeRatio));
      refitSoon();
    }

    function applySavedXLayout() {
      if (window.innerWidth < 1100) return;
      const saved = Number(localStorage.getItem("codex-ui-split-ratio-x"));
      if (!saved || Number.isNaN(saved)) {
        resetXLayout(false);
        return;
      }
      setWorkspaceColumnsByRatio(saved);
    }

    function resetXLayout(clearSaved = true) {
      if (clearSaved) localStorage.removeItem("codex-ui-split-ratio-x");
      if (window.innerWidth < 1100) {
        el.workspace.style.gridTemplateColumns = "";
        refitSoon();
        return;
      }
      setWorkspaceColumnsByRatio(0.5);
    }

    function setXLayoutFromPointer(clientX) {
      if (window.innerWidth < 1100) return;
      const rect = el.workspace.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      setWorkspaceColumnsByRatio(ratio);
    }

    function setLeftPaneRows(topPx) {
      const minTop = 180;
      const minBottom = 120;
      const promptHeight = 76;
      const splitter = 8;
      const total = el.leftPane.getBoundingClientRect().height;
      const maxTop = total - minBottom - promptHeight - splitter;
      const safeTop = Math.max(minTop, Math.min(topPx, maxTop));
      const safeBottom = Math.max(minBottom, total - safeTop - promptHeight - splitter);
      el.leftPane.style.gridTemplateRows = safeTop + "px 8px " + safeBottom + "px auto";
      localStorage.setItem("codex-ui-left-top-height", String(safeTop));
      refitSoon();
    }

    function applySavedYLayout() {
      const saved = Number(localStorage.getItem("codex-ui-left-top-height"));
      if (!saved || Number.isNaN(saved)) return;
      setLeftPaneRows(saved);
    }

    function resetYLayout() {
      localStorage.removeItem("codex-ui-left-top-height");
      el.leftPane.style.gridTemplateRows = "minmax(180px, 1fr) 8px minmax(120px, 220px) auto";
      refitSoon();
    }

    function setYLayoutFromPointer(clientY) {
      const rect = el.leftPane.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      setLeftPaneRows(relativeY);
    }

    function beginResizeX() {
      if (window.innerWidth < 1100) return;
      state.isDraggingX = true;
      document.body.classList.add("is-resizing-x");
      el.previewWrap.classList.add("drag-shield");
    }

    function endResizeX() {
      if (!state.isDraggingX) return;
      state.isDraggingX = false;
      document.body.classList.remove("is-resizing-x");
      el.previewWrap.classList.remove("drag-shield");
      refitSoon();
    }

    function beginResizeY() {
      state.isDraggingY = true;
      document.body.classList.add("is-resizing-y");
    }

    function endResizeY() {
      if (!state.isDraggingY) return;
      state.isDraggingY = false;
      document.body.classList.remove("is-resizing-y");
      refitSoon();
    }

    function autoSizePrompt() {
      el.promptInput.style.height = "auto";
      el.promptInput.style.height = Math.min(el.promptInput.scrollHeight, 180) + "px";
    }

    function connectWs() {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      state.ws = new WebSocket(protocol + "://" + location.host + "/ws");

      state.ws.addEventListener("open", () => refitSoon());

      state.ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "output") {
          term.write(msg.data);
          refitSoon();
        }
        if (msg.type === "audit") {
          appendAudit(msg.data);
        }
        if (msg.type === "session") {
          const data = msg.data || {};
          setRunning(!!data.running);
          if (data.previewUrl) {
            state.previewUrl = data.previewUrl;
            el.previewUrl.value = data.previewUrl;
            if (el.previewFrame.src !== data.previewUrl) el.previewFrame.src = data.previewUrl;
          }
          if (typeof data.auditLog === "string" && !el.auditLog.textContent) {
            el.auditLog.textContent = data.auditLog;
            el.auditLog.scrollTop = el.auditLog.scrollHeight;
          }
          if (data.running) refitSoon();
        }
      });

      state.ws.addEventListener("close", () => {
        setTimeout(connectWs, 1000);
      });
    }

    el.startBtn.onclick = () => {
      const size = getCurrentTerminalSize();
      sendMessage({ type: "start", cols: size.cols, rows: size.rows });
      refitSoon();
    };

    el.restartBtn.onclick = () => {
      const size = getCurrentTerminalSize();
      sendMessage({ type: "restart", cols: size.cols, rows: size.rows });
      refitSoon();
    };

    el.stopBtn.onclick = () => sendMessage({ type: "stop" });
    el.clearBtn.onclick = () => term.clear();
    el.clearAuditBtn.onclick = () => { el.auditLog.textContent = ""; };

    function sendPrompt() {
      const value = el.promptInput.value;
      if (!value.trim()) return;

      const sent = sendMessage({ type: "input", data: value + "\\n" });

      if (!sent) {
        appendAudit("[ui-error] WebSocket is not connected. Prompt was not sent.\\n");
        return;
      }

      el.promptInput.value = "";
      autoSizePrompt();
    }

    el.sendBtn.onclick = sendPrompt;
    el.promptInput.addEventListener("input", autoSizePrompt);
    el.promptInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendPrompt();
      }
    });

    el.applyPreviewBtn.onclick = async () => {
      const url = el.previewUrl.value.trim();
      if (!/^https?:\\/\\//i.test(url)) return alert("Preview URL must start with http:// or https://");
      state.previewUrl = url;
      el.previewFrame.src = url;
      sendMessage({ type: "setPreviewUrl", url });
      await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
    };

    el.reloadPreviewBtn.onclick = () => {
      el.previewFrame.src = state.previewUrl;
    };

    el.openPreviewBtn.onclick = () => {
      window.open(state.previewUrl, "_blank", "noopener,noreferrer");
    };

    el.resizerX.addEventListener("mousedown", () => beginResizeX());
    el.resizerX.addEventListener("dblclick", () => resetXLayout());

    el.resizerY.addEventListener("mousedown", () => beginResizeY());
    el.resizerY.addEventListener("dblclick", () => resetYLayout());

    window.addEventListener("mousemove", (event) => {
      if (state.isDraggingX) setXLayoutFromPointer(event.clientX);
      if (state.isDraggingY) setYLayoutFromPointer(event.clientY);
    });

    window.addEventListener("mouseup", () => {
      endResizeX();
      endResizeY();
    });

    window.addEventListener("mouseleave", () => {
      endResizeX();
      endResizeY();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth < 1100) {
        el.workspace.style.gridTemplateColumns = "";
      } else {
        applySavedXLayout();
      }
      applySavedYLayout();
      refitSoon();
    });

    connectWs();
    applySavedXLayout();
    applySavedYLayout();
    autoSizePrompt();
    refitSoon();
    term.focus();
  </script>
</body>
</html>`);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "session", data: getSessionState() }));
  ws.send(JSON.stringify({ type: "output", data: "\\r\\n[system] Browser connected.\\r\\n" }));

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.type === "start") {
      const size = normalizeStartSize(message);
      if (!termOpen) createSession(size);
      return;
    }

    if (message.type === "stop") {
      killSession();
      broadcast({ type: "session", data: getSessionState() });
      return;
    }

    if (message.type === "restart") {
      const size = normalizeStartSize(message);
      createSession(size);
      return;
    }

    if (message.type === "input" && term && typeof message.data === "string") {
      appendAuditEntry("user", String(message.data).trim());
      term.write(message.data);
      return;
    }

    if (message.type === "resize") {
      resizeSession(message.cols, message.rows);
      return;
    }

    if (message.type === "setPreviewUrl") {
      const url = String(message.url || "").trim();
      if (/^https?:\/\//i.test(url)) {
        currentPreviewUrl = url;
        broadcast({ type: "session", data: getSessionState() });
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Codex browser UI running at http://0.0.0.0:" + PORT);
  console.log("Open: http://187.127.252.51:" + PORT);
});
