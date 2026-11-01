import test from 'node:test';
import assert from 'node:assert/strict';

import { highlightText, languageFamily, escapeHTML } from './highlight.js';

test('maps common Chroma lexer names to scanners', () => {
  assert.equal(languageFamily('Go'), 'go');
  assert.equal(languageFamily('JavaScript'), 'js');
  assert.equal(languageFamily('TypeScript'), 'ts');
  assert.equal(languageFamily('C++'), 'cpp');
  assert.equal(languageFamily('C#'), 'csharp');
  assert.equal(languageFamily('Python'), 'py');
  assert.equal(languageFamily('Plain Text'), 'plain');
  assert.equal(languageFamily(''), 'plain');
});

test('escapes HTML and highlights keywords, strings, and comments', () => {
  const html = highlightText('const x = "a<b"; // hi', 'JavaScript');
  assert.match(html, /<i class=k>const<\/i>/);
  assert.match(html, /<i class=s>"a&lt;b"<\/i>/);
  assert.match(html, /<i class=c>\/\/ hi<\/i>/);
});

test('carries block comments across lines', () => {
  const html = highlightText('/* a\nb */\nfunc main() {}', 'Go');
  assert.match(html, /<i class=c>\/\* a<\/i>\n<i class=c>b \*\/<\/i>/);
  assert.match(html, /<i class=nf>main<\/i>/);
});

test('carries Python triple-quoted strings across lines', () => {
  const html = highlightText('def f():\n    """a\n    b"""\n    return 1', 'Python');
  assert.match(html, /    <i class=s>"""a<\/i>\n<i class=s>    b"""<\/i>/);
  assert.match(html, /<i class=k>return<\/i>/);
});

test('highlights HTML tags and attribute names safely', () => {
  const html = highlightText('<div class="x">hi</div>', 'HTML');
  assert.match(html, /<i class=nt>div<\/i>/);
  assert.match(html, /<i class=na>class<\/i>/);
  assert.ok(!html.includes('<div'));
});

test('highlights YAML keys and TOML table headers', () => {
  assert.match(highlightText('a: 1', 'YAML'), /<i class=na>a<\/i><i class=p>:<\/i>/);
  assert.match(highlightText('[tool]\nname = "x"', 'TOML'), /<i class=nc>\[tool\]<\/i>/);
});

test('falls back to escaped plain text for unknown languages', () => {
  assert.equal(highlightText('<script>alert(1)</script>', 'Plain Text'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHTML('a & b < c'), 'a &amp; b &lt; c');
});
