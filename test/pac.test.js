"use strict";

const assert = require("assert");
const path = require("path");
const pac = require(path.join(__dirname, "..", "pac.js"));

function proxyDirective(pacScript) {
  const m = pacScript.match(/return "([^"]+)"; DIRECT/);
  return m ? m[1] : null;
}

function findResult(pacScript, host) {
  const fn = new Function(pacScript + "\nreturn FindProxyForURL;")();
  return fn("https://" + host + "/x", host);
}
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok - " + name);
  } catch (e) {
    console.error("  FAIL - " + name);
    console.error("    " + (e && e.message));
    process.exitCode = 1;
  }
}

console.log("pac.js tests");

test("socks5 по умолчанию", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.ok(p.includes('return "SOCKS5 127.0.0.1:10808; DIRECT"'));
});

test("http-прокси при scheme=http", () => {
  const p = pac.buildPacScript("127.0.0.1", 10809, "http");
  assert.ok(p.includes('return "PROXY 127.0.0.1:10809; DIRECT"'));
  assert.ok(!p.includes("SOCKS5"));
});

test("youtube.com через прокси", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "www.youtube.com"), "SOCKS5 127.0.0.1:10808; DIRECT");
});

test("googlevideo.com через прокси", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "rr3---sn-abc.googlevideo.com"), "SOCKS5 127.0.0.1:10808; DIRECT");
});

test("посторонний домен — DIRECT", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "example.com"), "DIRECT");
});

test("поддомен не youtube — DIRECT (notyoutube.com)", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "notyoutube.com"), "DIRECT");
});

test("точный домен youtubei.googleapis.com через прокси", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "youtubei.googleapis.com"), "SOCKS5 127.0.0.1:10808; DIRECT");
});

test("yt-N.googleusercontent.com через прокси", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "yt3.googleusercontent.com"), "SOCKS5 127.0.0.1:10808; DIRECT");
});

test("googleusercontent.com целиком — DIRECT", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.strictEqual(findResult(p, "foo.googleusercontent.com"), "DIRECT");
});

test("недопустимый порт заменяется дефолтом", () => {
  const p = pac.buildPacScript("127.0.0.1", 0);
  assert.ok(p.includes(":10808"));
});

test("некорректный host заменяется дефолтом", () => {
  const p = pac.buildPacScript("   ", 10808);
  assert.ok(p.includes("SOCKS5 127.0.0.1:10808"));
});

test("сгенерированный скрипт — синтаксически валидный JS", () => {
  new Function(pac.buildPacScript("h", 1, "http"));
  new Function(pac.buildPacScript("h", 1, "socks5"));
});

test("домены в регулярке экранированы", () => {
  const p = pac.buildPacScript("127.0.0.1", 10808);
  assert.ok(p.includes("youtube\\.com"));
});

console.log(passed + " тестов пройдено");
