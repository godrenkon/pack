(() => {
  "use strict";

  const STORAGE_KEY = "white-room-clicker-v2";
  const TARGET = 999999999999999999999999n;
  const UNITS = ["", "万", "億", "兆", "京", "垓"];
  const $ = (id) => document.getElementById(id);
  const els = {
    home: $("home-screen"), game: $("game-screen"),
    homeStatus: $("home-status"), newGame: $("new-game-button"), load: $("load-button"), records: $("records-button"),
    main: $("main-button"), homeButton: $("home-button"),
    hudClicks: $("hud-clicks"), hudAuto: $("hud-auto"), wallClicks: $("wall-clicks"), wallAuto: $("wall-auto"),
    cursors: $("auto-cursors"), message: $("game-message"),
    saveModal: $("save-modal"), saveSlots: $("save-slots"), saveDescription: $("save-modal-description"),
    confirmModal: $("confirm-modal"), recordsModal: $("records-modal"), clearModal: $("clear-modal"),
    personalRanking: $("personal-ranking"), clearTime: $("clear-time"), clearRank: $("clear-rank"),
    backupExport: $("backup-export"), backupImportButton: $("backup-import-button"), backupImport: $("backup-import")
  };

  let state = loadState();
  let currentSlot = null;
  let game = null;
  let screen = "home";
  let lastFrame = performance.now();
  let savePickerMode = "load";

  function defaultGame() {
    return {
      clicks: 0n,
      clickPower: 1n,
      autoPerSecond: 0n,
      levels: { power: 0, turbo: 0, auto: 0, factory: 0 },
      elapsedMs: 0,
      autoProgressMs: 0,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  function defaultState() { return { version: 2, slots: [null, null, null, null, null], personalRanks: [] }; }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const slots = Array.from({ length: 5 }, (_, i) => parsed.slots?.[i] || null);
      return { version: 2, slots, personalRanks: Array.isArray(parsed.personalRanks) ? parsed.personalRanks : [] };
    } catch { return defaultState(); }
  }
  function serializeGame(source) {
    return { ...source, clicks: source.clicks.toString(), clickPower: source.clickPower.toString(), autoPerSecond: source.autoPerSecond.toString() };
  }
  function hydrateGame(source) {
    const fresh = defaultGame();
    if (!source) return fresh;
    return {
      ...fresh, ...source,
      clicks: BigInt(source.clicks || 0), clickPower: BigInt(source.clickPower || 1), autoPerSecond: BigInt(source.autoPerSecond || 0),
      levels: { ...fresh.levels, ...(source.levels || {}) }
    };
  }
  function persist() {
    if (game && currentSlot !== null) {
      game.updatedAt = Date.now();
      state.slots[currentSlot] = serializeGame(game);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateHome();
  }
  function hasSave() { return state.slots.some(Boolean); }
  function firstEmptySlot() { return state.slots.findIndex((slot) => !slot); }

  function displayNumber(value) {
    const n = typeof value === "bigint" ? value : BigInt(value);
    if (n < 10000n) return n.toString();
    const groups = [];
    let rest = n;
    while (rest > 0n) { groups.push(rest % 10000n); rest /= 10000n; }
    return groups.reverse().map((group, index) => {
      const unitIndex = groups.length - 1 - index;
      const digits = index === 0 ? group.toString() : group.toString().padStart(4, "0");
      return `${digits}${UNITS[unitIndex] || `e${unitIndex * 4}`}`;
    }).join("");
  }
  function formatTime(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function boardNumber(text) {
    const parts = text.match(/\d+(?:万|億|兆|京|垓|e\d+)?/g) || [text];
    const mustSplit = text.length > 22 || parts.length > 4;
    els.wallClicks.classList.toggle("two-lines", mustSplit);
    els.wallClicks.innerHTML = mustSplit
      ? `<span>${parts.slice(0, Math.ceil(parts.length / 2)).join("")}</span><span>${parts.slice(Math.ceil(parts.length / 2)).join("")}</span>`
      : text;
  }
  function cost(kind) {
    const level = game.levels[kind];
    const base = { power: 25n, turbo: 250n, auto: 100n, factory: 1500n }[kind];
    return base * (2n ** BigInt(level));
  }
  function updateGameUI() {
    if (!game) return;
    const clicks = displayNumber(game.clicks), auto = displayNumber(game.autoPerSecond);
    els.hudClicks.textContent = clicks;
    els.hudAuto.textContent = auto;
    boardNumber(clicks);
    els.wallAuto.textContent = auto;
    els.cursors.classList.toggle("active", game.autoPerSecond > 0n);
    ["power", "turbo", "auto", "factory"].forEach((kind) => {
      const element = $(`${kind}-cost`);
      const price = cost(kind);
      element.textContent = `コスト: ${displayNumber(price)}`;
      $("upgrade-" + kind).disabled = game.clicks < price || game.completed;
    });
  }
  function updateHome() {
    const saved = hasSave();
    els.newGame.textContent = saved ? "新しいゲーム" : "スタート";
    els.homeStatus.textContent = saved ? "セーブデータを選んで、続きから遊べます" : "最初のゲームを始めよう";
  }
  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }
  function goHome() {
    persist();
    screen = "home";
    currentSlot = null;
    game = null;
    els.game.hidden = true;
    els.home.hidden = false;
    hide("confirm-modal");
    updateHome();
  }
  function startSlot(slot) {
    currentSlot = slot;
    game = hydrateGame(state.slots[slot]);
    state.slots[slot] = serializeGame(game);
    persist();
    screen = "game";
    els.home.hidden = true;
    els.game.hidden = false;
    hide("save-modal");
    updateGameUI();
    els.message.textContent = `セーブデータ ${slot + 1} でプレイ中`;
  }
  function openSavePicker(mode) {
    savePickerMode = mode;
    els.saveDescription.textContent = mode === "new"
      ? "空いているセーブデータを選んで、新しく始めます。"
      : "ロードするデータを選んでください。空き枠を押すと新しく始められます。";
    els.saveSlots.innerHTML = "";
    state.slots.forEach((slot, index) => {
      const button = document.createElement("button");
      button.className = `save-slot${slot ? " has-save" : ""}`;
      if (slot) {
        const saved = hydrateGame(slot);
        button.innerHTML = `<strong>DATA ${index + 1}</strong><span>${displayNumber(saved.clicks)} click</span><em>${displayNumber(saved.autoPerSecond)}/s</em>`;
      } else button.innerHTML = `<strong>DATA ${index + 1}</strong><span>空きデータ</span><em>ここから開始</em>`;
      button.addEventListener("click", () => {
        if (slot && savePickerMode === "new") {
          els.message.textContent = "そのデータは使用中です。空きデータを選んでください。";
          return;
        }
        if (!slot) state.slots[index] = serializeGame(defaultGame());
        startSlot(index);
      });
      els.saveSlots.append(button);
    });
    show("save-modal");
  }
  function startNewGame() {
    const empty = firstEmptySlot();
    if (empty >= 0) {
      state.slots[empty] = serializeGame(defaultGame());
      startSlot(empty);
    } else openSavePicker("new");
  }
  function addClicks(amount) {
    if (!game || game.completed) return;
    game.clicks += amount;
    if (game.clicks >= TARGET) completeGame();
    updateGameUI();
  }
  function buy(kind) {
    if (!game || game.completed) return;
    const price = cost(kind);
    if (game.clicks < price) {
      els.message.textContent = "クリック数が足りません";
      return;
    }
    game.clicks -= price;
    game.levels[kind] += 1;
    if (kind === "power") game.clickPower += 1n;
    if (kind === "turbo") game.clickPower *= 2n;
    if (kind === "auto") game.autoPerSecond += 1n;
    if (kind === "factory") game.autoPerSecond = game.autoPerSecond === 0n ? 1n : game.autoPerSecond * 2n;
    els.message.textContent = `${$("upgrade-" + kind).querySelector("strong").textContent} を強化！`;
    persist();
    updateGameUI();
  }
  function completeGame() {
    if (game.completed) return;
    game.completed = true;
    const entry = { timeMs: game.elapsedMs, completedAt: Date.now() };
    state.personalRanks.push(entry);
    state.personalRanks.sort((a, b) => a.timeMs - b.timeMs);
    state.personalRanks = state.personalRanks.slice(0, 10);
    const rank = state.personalRanks.findIndex((candidate) => candidate === entry) + 1;
    persist();
    els.clearTime.textContent = `クリア時間: ${formatTime(game.elapsedMs)}`;
    els.clearRank.textContent = `個人ランキング: ${rank} 位`;
    show("clear-modal");
  }
  function updateRanking() {
    els.personalRanking.innerHTML = "";
    if (!state.personalRanks.length) {
      const item = document.createElement("li"); item.textContent = "まだクリア記録はありません"; els.personalRanking.append(item); return;
    }
    state.personalRanks.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = `${formatTime(entry.timeMs)} (${new Date(entry.completedAt).toLocaleDateString("ja-JP")})`;
      els.personalRanking.append(item);
    });
  }
  function exportBackup() {
    persist();
    const raw = JSON.stringify(state);
    if (window.AndroidSave?.exportBackup) {
      window.AndroidSave.exportBackup(utf8ToBase64(raw));
      return;
    }
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "white-room-clicker-save.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importBackupText(text) {
    try {
        const imported = JSON.parse(text);
        if (!Array.isArray(imported.slots)) throw new Error("invalid");
        state = {
          version: 2,
          slots: Array.from({ length: 5 }, (_, i) => imported.slots[i] || null),
          personalRanks: Array.isArray(imported.personalRanks) ? imported.personalRanks : []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        updateHome(); updateRanking();
        alert("バックアップを読み込みました");
    } catch { alert("このファイルは読み込めませんでした"); }
  }
  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { importBackupText(reader.result); els.backupImport.value = ""; };
    reader.readAsText(file);
  }
  function utf8ToBase64(text) { return btoa(unescape(encodeURIComponent(text))); }
  function base64ToUtf8(value) { return decodeURIComponent(escape(atob(value))); }
  window.__receiveAndroidBackup = (base64) => importBackupText(base64ToUtf8(base64));
  function frame(now) {
    const dt = Math.min(1000, now - lastFrame);
    lastFrame = now;
    if (screen === "game" && game && !game.completed) {
      game.elapsedMs += dt;
      if (game.autoPerSecond > 0n) {
        game.autoProgressMs += dt;
        const fullSeconds = Math.floor(game.autoProgressMs / 1000);
        if (fullSeconds > 0) {
          game.autoProgressMs -= fullSeconds * 1000;
          addClicks(game.autoPerSecond * BigInt(fullSeconds));
        }
      }
    }
    requestAnimationFrame(frame);
  }

  els.newGame.addEventListener("click", startNewGame);
  els.load.addEventListener("click", () => openSavePicker("load"));
  els.records.addEventListener("click", () => { updateRanking(); show("records-modal"); });
  els.main.addEventListener("pointerdown", (event) => { event.preventDefault(); addClicks(game?.clickPower || 1n); });
  document.querySelectorAll("[data-upgrade]").forEach((button) => button.addEventListener("click", () => buy(button.dataset.upgrade)));
  els.homeButton.addEventListener("click", () => show("confirm-modal"));
  $("confirm-home").addEventListener("click", goHome);
  $("clear-home").addEventListener("click", () => { hide("clear-modal"); goHome(); });
  document.querySelectorAll(".modal-close").forEach((button) => button.addEventListener("click", () => hide(button.dataset.close)));
  els.backupExport.addEventListener("click", exportBackup);
  els.backupImportButton.addEventListener("click", () => {
    if (window.AndroidSave?.requestImport) window.AndroidSave.requestImport();
    else els.backupImport.click();
  });
  els.backupImport.addEventListener("change", () => importBackup(els.backupImport.files[0]));
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });
  setInterval(() => { if (screen === "game") persist(); }, 5000);

  updateHome();
  requestAnimationFrame(frame);
})();
