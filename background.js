"use strict";

importScripts("pac.js");

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
  }
};

function setProxy(value) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: value, scope: "regular" }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function getProxySettings() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({ incognito: false }, (details) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(details);
    });
  });
}

// Chrome разрешает управлять прокси только одному расширению.
// Если levelOfControl указывает на другое расширение — настройки применить
// не выйдет, и это нужно явно показать пользователю, а не глотать ошибку.
function assertControllable(details) {
  const level = details && details.levelOfControl;
  if (level === "controllable_by_this_extension" || level === "controlled_by_this_extension") return;
  throw new Error(
    "Прокси контролируется другим расширением. Отключите второе прокси-расширение и перезапустите браузер."
  );
}

function normalizePort(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < CONFIG.PORT_MIN || p > CONFIG.PORT_MAX) return null;
  return p;
}
// Источник правды — фактические настройки прокси Chrome, а не флаг в storage:
// флаг мог сброситься при сбое синхронизации, а применённый PAC/fixed_servers
// продолжает реально работать.
function isProxyEffectivelyEnabled(details) {
  if (!details || !details.value) return false;
  const mode = details.value.mode;
  if (mode !== "pac_script" && mode !== "fixed_servers") return false;
  const level = details.levelOfControl || "";
  return level.indexOf("this_extension") !== -1;
}
// PAC-режим: проксируем только домены YouTube (через pac.js).
// Особенность Chromium: для SOCKS5 из PAC-скрипта DNS может резолвиться
// локально — у части провайдеров это ломает резолвинг, поэтому режим
// "fixed" дублирует поведение расширений типа Proxy Connector.
function buildProxyValue(host, port, scheme, mode) {
  if (mode === "fixed") {
    return {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: scheme === "http" ? "http" : "socks5",
          host: host,
          port: port
        },
        bypassList: ["localhost", "127.0.0.1", "[::1]"]
      }
    };
  }
  return {
    mode: "pac_script",
    pacScript: {
      data: buildPacScript(host, port, scheme),
      mandatory: false
    }
  };
}

async function enableProxy(host, port, scheme, mode) {
  const h = (typeof host === "string" && host.trim()) ? host.trim() : CONFIG.DEFAULT_HOST;
  const p = normalizePort(port);
  if (!p) {
    console.error("Некорректный порт:", port);
    return { ok: false, error: "Некорректный порт: " + port };
  }
  const s = scheme === "http" ? "http" : "socks5";
  const m = mode === "fixed" ? "fixed" : CONFIG.DEFAULT_MODE;
  try {
    const current = await getProxySettings();
    assertControllable(current);
    await setProxy(buildProxyValue(h, p, s, m));
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.IS_ENABLED]: true,
      [CONFIG.STORAGE_KEYS.HOST]: h,
      [CONFIG.STORAGE_KEYS.PORT]: p,
      [CONFIG.STORAGE_KEYS.SCHEME]: s,
      [CONFIG.STORAGE_KEYS.MODE]: m
    });
    return { ok: true };
  } catch (err) {
    console.error("Ошибка активации прокси:", err);
    // Не глушим прокси при сбое записи флага: если setProxy прошёл,
    // PAC/fixed продолжают работать, и флаг подтянется из факта в getState.
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

async function disableProxy() {
  try {
    await setProxy({ mode: "system" });
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.IS_ENABLED]: false });
    return { ok: true };
  } catch (err) {
    console.error("Ошибка деактивации прокси:", err);
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

// Service worker MV3 засыпает и просыпается: применённый PAC переживает сон,
// но после конфликта с другим расширением или его отключения состояние может
// разъехаться, поэтому сверяем storage с фактическими настройками при каждом
// запуске SW.
async function syncOnStartup() {
  try {
    const st = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.IS_ENABLED,
      CONFIG.STORAGE_KEYS.HOST,
      CONFIG.STORAGE_KEYS.PORT,
      CONFIG.STORAGE_KEYS.SCHEME,
      CONFIG.STORAGE_KEYS.MODE
    ]);
    if (st[CONFIG.STORAGE_KEYS.IS_ENABLED]) {
      const res = await enableProxy(
        st[CONFIG.STORAGE_KEYS.HOST],
        st[CONFIG.STORAGE_KEYS.PORT],
        st[CONFIG.STORAGE_KEYS.SCHEME],
        st[CONFIG.STORAGE_KEYS.MODE]
      );
      if (!res.ok) {
        // Не выключаем применённый PAC/fixed: возможно, он уже работает,
        // а ошибка — транзиентная (например, контроль ещё не освобождён).
        console.warn("Стартовая синхронизация не смогла переприменить прокси:", res.error);
      }
    }
    // Ветка "выключено" намеренно ничего не применяет: если пользователь
    // выключил фикс, а PAC от другого сценария остался — выключение через
    // тумблер уже вернуло mode: system; повторно не мешаем.
  } catch (e) {
    console.error("Ошибка при стартовой синхронизации прокси:", e);
  }
}

chrome.runtime.onStartup.addListener(syncOnStartup);
chrome.runtime.onInstalled.addListener(syncOnStartup);
syncOnStartup();

if (chrome.proxy && chrome.proxy.onProxyError) {
  chrome.proxy.onProxyError.addListener((details) => {
    console.warn("Chrome Proxy Warning:", details);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === CONFIG.ACTIONS.TOGGLE_PROXY) {
        const res = request.enabled
          ? await enableProxy(request.host, request.port, request.scheme, request.mode)
          : await disableProxy();
        sendResponse({ success: res.ok, error: res.error || null });
      } else if (request.action === CONFIG.ACTIONS.GET_STATE) {
        const st = await chrome.storage.local.get([
          CONFIG.STORAGE_KEYS.IS_ENABLED,
          CONFIG.STORAGE_KEYS.HOST,
          CONFIG.STORAGE_KEYS.PORT,
          CONFIG.STORAGE_KEYS.SCHEME,
          CONFIG.STORAGE_KEYS.MODE
        ]);
        let details = null;
        let control = "unknown";
        let controlledByOther = false;
        try {
          details = await getProxySettings();
          control = details.levelOfControl || "unknown";
          controlledByOther = !(control === "controllable_by_this_extension" || control === "controlled_by_this_extension");
        } catch (e) {
          control = "error: " + ((e && e.message) || String(e));
        }
        const storedEnabled = !!st[CONFIG.STORAGE_KEYS.IS_ENABLED];
        const actualEnabled = details ? isProxyEffectivelyEnabled(details) : storedEnabled;
        if (details && actualEnabled !== storedEnabled) {
          await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.IS_ENABLED]: actualEnabled });
        }
        sendResponse({
          isProxyEnabled: actualEnabled,
          host: st[CONFIG.STORAGE_KEYS.HOST] || CONFIG.DEFAULT_HOST,
          port: st[CONFIG.STORAGE_KEYS.PORT] || CONFIG.DEFAULT_PORT,
          scheme: st[CONFIG.STORAGE_KEYS.SCHEME] || CONFIG.DEFAULT_SCHEME,
          mode: st[CONFIG.STORAGE_KEYS.MODE] || CONFIG.DEFAULT_MODE,
          levelOfControl: control,
          controlledByOther: controlledByOther
        });
      }
    } catch (e) {
      console.error(e);
      sendResponse({ success: false, error: String(e) });
    }
  })();
  return true;
});
