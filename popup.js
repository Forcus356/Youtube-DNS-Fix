"use strict";

const CONFIG = {
  DEFAULT_HOST: "127.0.0.1",
  DEFAULT_PORT: 10808,
  DEFAULT_SCHEME: "socks5",
  DEFAULT_MODE: "pac",
  PORT_MIN: 1,
  PORT_MAX: 65535,
  STORAGE_KEYS: {
    IS_ENABLED: "isProxyEnabled",
    HOST: "host",
    PORT: "port",
    SCHEME: "scheme",
    MODE: "mode"
  },
  ACTIONS: {
    TOGGLE_PROXY: "toggleProxy",
    GET_STATE: "getState"
  },
  TOAST_TIMEOUT_MS: 2500
};

const toggle = document.getElementById("proxyToggle");
const toggleCard = document.getElementById("toggleCard");
const subLabel = document.getElementById("subLabel");
const hostInput = document.getElementById("hostInput");
const portInput = document.getElementById("portInput");
const configInput = document.getElementById("configInput");
const parseBtn = document.getElementById("parseBtn");
const errorMsg = document.getElementById("errorMsg");
const tipBox = document.getElementById("tipBox");
const modalOverlay = document.getElementById("modalOverlay");
const modalClose = document.getElementById("modalClose");
const helpLink = document.getElementById("helpLink");
const toast = document.getElementById("toast");
const modeBtns = Array.from(document.querySelectorAll(".mode-btn"));

const state = {
  host: CONFIG.DEFAULT_HOST,
  port: CONFIG.DEFAULT_PORT,
  scheme: CONFIG.DEFAULT_SCHEME,
  mode: CONFIG.DEFAULT_MODE
};

// Пока пользователь сам не тронул тумблер в этом открытии попапа,
// его положение задаёт фактическое состояние прокси из background.
let toggleDirty = false;

function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), CONFIG.TOAST_TIMEOUT_MS);
}

function showError(msg) {
  if (!errorMsg) return;
  errorMsg.textContent = msg;
  errorMsg.classList.add("show");
}

function hideError() {
  if (!errorMsg) return;
  errorMsg.classList.remove("show");
}

function showDiag(text) {
  const el = document.getElementById("diagLine");
  if (el) el.textContent = text;
}

function protoLabel() {
  const proto = state.scheme === "http" ? "HTTP" : "SOCKS5";
  const mode = state.mode === "fixed" ? ", весь трафик" : "";
  return proto + mode;
}

function updateUI() {
  const host = state.host;
  const port = state.port;

  if (hostInput && document.activeElement !== hostInput) hostInput.value = host;
  if (portInput && document.activeElement !== portInput) portInput.value = port;

  if (toggle.checked) {
    toggleCard.classList.add("active");
    subLabel.textContent = `YouTube через ${protoLabel()} ${host}:${port}`;
  } else {
    toggleCard.classList.remove("active");
    subLabel.textContent = `${protoLabel()} ${host}:${port} (нажмите для включения)`;
  }
}

async function refresh() {
  try {
    const st = await chrome.runtime.sendMessage({ action: CONFIG.ACTIONS.GET_STATE });
    if (st) {
      state.host = st.host || CONFIG.DEFAULT_HOST;
      state.port = Number(st.port) || CONFIG.DEFAULT_PORT;
      state.scheme = st.scheme || CONFIG.DEFAULT_SCHEME;
      state.mode = st.mode || CONFIG.DEFAULT_MODE;
      // Тумблер отражает фактическое состояние прокси, а не дефолт HTML:
      // без этой строки попап всегда показывал «выключен» при открытии.
      if (!toggleDirty) toggle.checked = !!st.isProxyEnabled;

      if (modeBtns.length) {
        modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
      }

      if (st.levelOfControl) {
        const control = st.levelOfControl.indexOf("this_extension") !== -1
          ? "этим расширением"
          : (st.controlledByOther ? "ДРУГИМ расширением" : st.levelOfControl);
        const eff = st.isProxyEnabled ? "применён" : "не применён";
        showDiag(`proxy: ${eff} · контроль: ${control}`);
      }

      if (st.controlledByOther) {
        showError(
          "⚠️ Настройки прокси сейчас контролируются другим расширением. " +
          "Отключите его и полностью перезапустите браузер (Chrome отдаёт контроль " +
          "только после перезапуска), затем снова включите тумблер."
        );
      }
    }
  } catch (e) {
    console.error("Ошибка при загрузке состояния:", e);
  }
  updateUI();
}

function applyProxy(enabled, silent) {
  return chrome.runtime.sendMessage({
    action: CONFIG.ACTIONS.TOGGLE_PROXY,
    enabled: enabled,
    host: state.host,
    port: state.port,
    scheme: state.scheme,
    mode: state.mode
  }).then((res) => {
    if (res && res.error) {
      if (!silent) showToast("Ошибка: " + res.error);
      showError(res.error);
      return false;
    }
    return true;
  }).catch((e) => {
    if (!silent) showToast("Не удалось изменить состояние: " + e.message);
    return false;
  });
}

async function saveSettings(silent = false) {
  const hostVal = (hostInput ? hostInput.value.trim() : "") || CONFIG.DEFAULT_HOST;
  const portVal = Number(portInput ? portInput.value.trim() : CONFIG.DEFAULT_PORT);

  if (!Number.isInteger(portVal) || portVal < CONFIG.PORT_MIN || portVal > CONFIG.PORT_MAX) {
    if (!silent) showToast(`⚠️ Укажите порт от ${CONFIG.PORT_MIN} до ${CONFIG.PORT_MAX}`);
    return false;
  }

  state.host = hostVal;
  state.port = portVal;
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.HOST]: hostVal,
    [CONFIG.STORAGE_KEYS.PORT]: portVal
  });

  if (toggle.checked) {
    const ok = await applyProxy(true, silent);
    if (ok && !silent) showToast(`✅ Настройки ${hostVal}:${portVal} применены на лету!`);
    if (!ok) toggle.checked = false;
  } else if (!silent) {
    showToast(`✅ Настройки ${hostVal}:${portVal} сохранены`);
  }

  updateUI();
  return true;
}

toggle.addEventListener("change", () => { toggleDirty = true; });

toggle.addEventListener("change", async () => {
  hideError();
  await saveSettings(true);
  const ok = await applyProxy(toggle.checked, true);
  if (ok && toggle.checked) {
    showToast("✅ Фикс включён");
  } else if (!ok) {
    toggle.checked = !toggle.checked;
  }
  updateUI();
});

if (modeBtns.length) {
  modeBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode = btn.dataset.mode === "fixed" ? "fixed" : CONFIG.DEFAULT_MODE;
      modeBtns.forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
      await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.MODE]: state.mode });
      if (toggle.checked) {
        const ok = await applyProxy(true, true);
        if (ok) showToast(state.mode === "fixed" ? "✅ Режим: весь трафик через прокси" : "✅ Режим: PAC (только YouTube)");
        else toggle.checked = false;
      }
      updateUI();
    });
  });
}

[hostInput, portInput].forEach((input) => {
  if (!input) return;
  input.addEventListener("change", () => saveSettings());
  input.addEventListener("blur", () => saveSettings());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
});

if (helpLink) {
  helpLink.addEventListener("click", () => {
    modalOverlay.classList.add("show");
    hideError();
    if (tipBox) tipBox.classList.remove("show");
  });
}

if (modalClose) {
  modalClose.addEventListener("click", () => modalOverlay.classList.remove("show"));
}

if (modalOverlay) {
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("show");
  });
}

if (parseBtn) {
  parseBtn.addEventListener("click", () => {
    const raw = configInput ? configInput.value.trim() : "";
    if (!raw) {
      if (tipBox) tipBox.classList.add("show");
      return;
    }
    hideError();
    try {
      const cfg = JSON.parse(raw.replace(/[\u201C\u201D]/g, '"').replace(/\/\/[^\n\r]*/g, ""));
      const inbounds = (cfg.inbounds || []).filter((i) => i && (i.protocol === "socks" || i.protocol === "http") && i.listen === "127.0.0.1");
      const pool = inbounds.length ? inbounds : (cfg.inbounds || []).filter((i) => i && (i.protocol === "socks" || i.protocol === "http"));
      if (!pool.length) throw new Error("Не найден socks/http inbound в конфиге");
      // Предпочитаем socks-инбаунд: из PAC-скрипта Chromium надёжнее работает именно он.
      const pick = pool.find((i) => i.protocol === "socks") || pool[0];
      const port = Number((pick.port && pick.port.port) ? pick.port.port : pick.port);
      if (!Number.isInteger(port) || port < CONFIG.PORT_MIN || port > CONFIG.PORT_MAX) throw new Error("Не удалось прочитать порт из конфига");
      state.port = port;
      state.scheme = pick.protocol === "http" ? "http" : "socks5";
      if (hostInput) hostInput.value = state.host;
      if (portInput) portInput.value = port;
      chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.PORT]: port,
        [CONFIG.STORAGE_KEYS.SCHEME]: state.scheme
      });
      showToast(`✅ Найден ${state.scheme === "http" ? "HTTP" : "SOCKS5"} порт ${port}`);
      if (modalOverlay) modalOverlay.classList.remove("show");
      if (toggle.checked) applyProxy(true, true);
      updateUI();
    } catch (e) {
      showError("Не удалось разобрать конфиг: " + e.message);
      if (tipBox) tipBox.classList.add("show");
    }
  });
}

refresh();

const verTag = document.getElementById("verTag");
if (verTag) {
  const v = chrome.runtime.getManifest();
  verTag.textContent = "v" + v.version;
}
