"use strict";

// Генератор PAC-скрипта. Подключается через importScripts() в service worker
// и через require() в тестах (Node).

const PAC_YT_DOMAINS = [
  "youtube.com",
  "youtu.be",
  "yt.be",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "youtube-nocookie.com",
  "youtubekids.com",
  "youtubeeducation.com",
  "youtubego.com",
  "withyoutube.com",
  "gvt1.com"
];

const PAC_YT_EXACT_DOMAINS = [
  "youtubei.googleapis.com",
  "youtube.googleapis.com",
  "youtubeembeddedplayer.googleapis.com",
  "ytimg.l.google.com",
  "youtube-ui.l.google.com",
  "wide-youtube.l.google.com"
];

function escapeDomains(domains) {
  return domains.map((d) => d.replace(/\./g, "\\.")).join("|");
}

// scheme: "socks5" (по умолчанию) -> директива SOCKS5,
//         "http"            -> директива PROXY (HTTP-прокси).
function buildPacScript(host, port, scheme) {
  const h = (typeof host === "string" && host.trim()) ? host.trim() : "127.0.0.1";
  const p = Number(port) || 10808;
  const directive = scheme === "http" ? "PROXY" : "SOCKS5";
  const domainPattern = escapeDomains(PAC_YT_DOMAINS);
  const exactPattern = escapeDomains(PAC_YT_EXACT_DOMAINS);

  return "function FindProxyForURL(url, host) {\n" +
    "  try {\n" +
    "    if (!host) return \"DIRECT\";\n" +
    "    if (\n" +
    "      /(^|\\.)(" + domainPattern + ")$/i.test(host) ||\n" +
    "      /(^|\\.)(" + exactPattern + ")$/i.test(host) ||\n" +
    "      /^yt[0-9]*\\.googleusercontent\\.com$/i.test(host)\n" +
    "    ) {\n" +
    "      return \"" + directive + " " + h + ":" + p + "; DIRECT\";\n" +
    "    }\n" +
    "  } catch (e) {}\n" +
    "  return \"DIRECT\";\n" +
    "}";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildPacScript, PAC_YT_DOMAINS, PAC_YT_EXACT_DOMAINS };
}
