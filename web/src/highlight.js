// web/src/highlight.js
//
// A small, dependency-free tokenizer for the editable text view. The read-only
// view is highlighted by Chroma on the server; the edit overlay has to keep up
// with every keystroke, so it gets its own line scanner instead of a request
// per edit. It is deliberately forgiving: block comments and multi-line
// strings carry state between lines, while an unfamiliar language falls back
// to escaped plain text.
//
// The class names match the ones Chroma emits (.k, .s, .c, ...), so the same
// theme variables colour both views.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export function escapeHTML(s) {
  return s.replace(/[&<>]/g, c => ESC[c]);
}

function span(cls, text) {
  return text ? '<i class=' + cls + '>' + escapeHTML(text) + '</i>' : '';
}

const ALIASES = [
  [/typescript|tsx|\bts\b/, 'ts'],
  [/javascript|jsx|\bjs\b|ecmascript/, 'js'],
  [/golang|\bgo\b/, 'go'],
  [/python|\bpy\b/, 'py'],
  [/rust/, 'rust'],
  [/c\+\+|cpp|cxx|objective-c|objc/, 'cpp'],
  [/c#|csharp/, 'csharp'],
  [/java\b/, 'java'],
  [/kotlin|\bkt\b/, 'kotlin'],
  [/swift/, 'swift'],
  [/scala/, 'scala'],
  [/dart/, 'dart'],
  [/zig/, 'zig'],
  [/php/, 'php'],
  [/ruby|\brb\b/, 'rb'],
  [/lua/, 'lua'],
  [/sql/, 'sql'],
  [/yaml/, 'yaml'],
  [/toml/, 'toml'],
  [/ini|properties/, 'ini'],
  [/json/, 'json'],
  [/html|xml|svg|vue|svelte/, 'html'],
  [/css|scss|sass|less/, 'css'],
  [/markdown|\bmd\b/, 'markdown'],
  [/bash|shell|zsh|fish|sh\b|console/, 'shell'],
  [/makefile|make\b/, 'make'],
  [/docker/, 'docker'],
  [/hcl|terraform/, 'hcl'],
  [/\bc\b/, 'c'],
];

/** Map a Chroma lexer name (or a file extension-ish label) to a scanner. */
export function languageFamily(lang) {
  const s = String(lang || '').toLowerCase();
  if (!s || s === 'plain text' || s === 'text' || s === 'txt') return 'plain';
  for (const [re, family] of ALIASES) if (re.test(s)) return family;
  return 'plain';
}

const KEYWORD_TEXT = {
  js: 'as async await break case catch class const continue debugger default delete do else export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch this throw try typeof var void while with yield',
  ts: 'abstract any as asserts async await bigint boolean break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new number object of package private protected public readonly record return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield',
  rust: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while',
  cpp: 'alignas alignof and and_eq asm auto bitand bitor bool break case catch char class compl const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq',
  java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits yield',
  csharp: 'abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while',
  kotlin: 'as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external false field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline null object open operator out override package private protected public reified return sealed set super suspend tailrec this throw true try typealias typeof val var vararg when where while',
  swift: 'associatedtype break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self Self static struct subscript super switch throw throws true try typealias var where while',
  php: 'abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new null or print private protected public readonly require require_once return static switch throw trait true try unset use var while xor yield',
  rb: 'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield',
  lua: 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while',
  sql: 'add all alter and as asc between by case create delete desc distinct drop else end exists from full group having in inner insert into is join left like limit not null on or order outer right select set table then union update values when where with',
  shell: 'case do done elif else esac fi for function if in select then time until while',
  docker: 'add arg cmd copy entrypoint env expose from healthcheck label maintainer onbuild run shell stopsignal user volume workdir',
  make: 'define else endef endif export ifdef ifeq ifndef ifneq include override private undefine vpath',
};
const KEYWORDS = Object.fromEntries(Object.entries(KEYWORD_TEXT).map(([k, v]) => [k, new Set(v.split(/\s+/))]));
KEYWORDS.json = new Set(['true', 'false', 'null']);

const TYPES = new Set((
  'any bool boolean byte char double error float float32 float64 int int8 int16 int32 int64 ' +
  'long number object rune short signed string uint uint8 uint16 uint32 uint64 uintptr ' +
  'unsigned void unknown never bigint symbol'
).split(/\s+/));
const CONSTANTS = new Set(['true', 'false', 'null', 'nil', 'None', 'none', 'undefined', 'nullptr', 'NULL', 'NaN', 'Infinity']);
const TYPE_INTRODUCERS = new Set(['class', 'struct', 'interface', 'enum', 'type', 'trait', 'record', 'union']);
const FUNC_INTRODUCERS = new Set(['func', 'fn', 'def', 'function', 'sub']);

const LINE_COMMENTS = {
  js: ['//'], ts: ['//'], go: ['//'], rust: ['//'], c: ['//'], cpp: ['//'],
  java: ['//'], csharp: ['//'], kotlin: ['//'], swift: ['//'], scala: ['//'],
  dart: ['//'], zig: ['//'], php: ['//', '#'], rb: ['#'], py: ['#'], shell: ['#'],
  make: ['#'], yaml: ['#'], toml: ['#'], ini: ['#', ';'], sql: ['--'], lua: ['--'],
  hcl: ['#', '//'], docker: ['#'], json: [], html: [], css: [], markdown: [],
};

const BLOCK_COMMENTS = {
  js: ['/*', '*/'], ts: ['/*', '*/'], go: ['/*', '*/'], rust: ['/*', '*/'],
  c: ['/*', '*/'], cpp: ['/*', '*/'], java: ['/*', '*/'], csharp: ['/*', '*/'],
  kotlin: ['/*', '*/'], swift: ['/*', '*/'], scala: ['/*', '*/'], dart: ['/*', '*/'],
  zig: ['/*', '*/'], php: ['/*', '*/'], css: ['/*', '*/'], sql: ['/*', '*/'],
  hcl: ['/*', '*/'], json: ['/*', '*/'], html: ['<!--', '-->'], markdown: ['<!--', '-->'],
};

const MULTILINE_QUOTES = new Set(['js', 'ts', 'go', 'py']);
const TRIPLE_QUOTE = new Set(['py']);
const CASE_INSENSITIVE = new Set(['sql']);

const RE_WORD = /[A-Za-z_$][\w$]*/y;
const RE_NUMBER = /0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/y;
const RE_ATTR = /[A-Za-z_:@#][\w:.\-@#]*/y;

function keywordSet(fam) {
  return KEYWORDS[fam] || null;
}

function isWordFollowedByParen(line, at) {
  let i = at;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return line[i] === '(';
}

function scanString(line, start, fam) {
  const quote = line[start];
  if (fam === 'py' && line.startsWith(quote.repeat(3), start)) {
    const delim = quote.repeat(3);
    const end = line.indexOf(delim, start + 3);
    if (end < 0) return { end: line.length, close: false, delim };
    return { end: end + 3, close: true, delim };
  }
  let i = start + 1;
  while (i < line.length) {
    if (line[i] === '\\') { i += 2; continue; }
    if (line[i] === quote) return { end: i + 1, close: true, delim: quote };
    i++;
  }
  return { end: line.length, close: false, delim: quote };
}

// Scan one line of a C-like/Python/shell language. `st` carries block comments
// and multi-line strings from one line to the next.
function highlightCodeLine(line, fam, st) {
  let out = '';
  let plain = '';
  const flush = () => {
    if (plain) { out += escapeHTML(plain); plain = ''; }
  };
  const lc = LINE_COMMENTS[fam] || [];
  const bc = BLOCK_COMMENTS[fam] || null;
  const kw = keywordSet(fam);
  const lower = CASE_INSENSITIVE.has(fam);
  let i = 0;
  let expect = '';

  while (i < line.length) {
    if (st.quote) {
      const end = line.indexOf(st.quote, i);
      if (end < 0) {
        flush();
        out += span('s', line.slice(i));
        return out;
      }
      flush();
      out += span('s', line.slice(i, end + st.quote.length));
      i = end + st.quote.length;
      st.quote = '';
      continue;
    }
    if (st.blockEnd) {
      const end = line.indexOf(st.blockEnd, i);
      if (end < 0) {
        flush();
        out += span('c', line.slice(i));
        return out;
      }
      flush();
      out += span('c', line.slice(i, end + st.blockEnd.length));
      i = end + st.blockEnd.length;
      st.blockEnd = '';
      continue;
    }

    for (const tok of lc) {
      if (line.startsWith(tok, i)) {
        flush();
        out += span('c', line.slice(i));
        return out;
      }
    }

    if (bc && line.startsWith(bc[0], i)) {
      const end = line.indexOf(bc[1], i + bc[0].length);
      flush();
      if (end < 0) {
        out += span('c', line.slice(i));
        st.blockEnd = bc[1];
        return out;
      }
      out += span('c', line.slice(i, end + bc[1].length));
      i = end + bc[1].length;
      continue;
    }

    // C preprocessor directives sit at the start of a line (after indentation).
    if ((fam === 'c' || fam === 'cpp') && line[i] === '#' && line.slice(0, i).trim() === '') {
      flush();
      out += span('cp', line.slice(i));
      return out;
    }

    const ch = line[i];

    if (ch === '"' || ch === "'" || ch === '`') {
      const res = scanString(line, i, fam);
      flush();
      out += span('s', line.slice(i, res.end));
      if (!res.close && MULTILINE_QUOTES.has(fam) && (res.delim.length === 3 || res.delim === '`')) {
        st.quote = res.delim;
      }
      i = res.end;
      continue;
    }

    if (fam === 'shell' && ch === '$') {
      const m = /^\$(?:\{[^}]*\}|[A-Za-z_][\w]*|[0-9@*#?$!\-])/.exec(line.slice(i));
      if (m) {
        flush();
        out += span('nv', m[0]);
        i += m[0].length;
        continue;
      }
    }

    if (ch >= '0' && ch <= '9') {
      RE_NUMBER.lastIndex = i;
      const m = RE_NUMBER.exec(line);
      if (m) {
        flush();
        out += span('m', m[0]);
        i += m[0].length;
        continue;
      }
    }

    RE_WORD.lastIndex = i;
    const word = RE_WORD.exec(line);
    if (word) {
      const w = word[0];
      flush();
      let cls = '';
      const probe = lower ? w.toLowerCase() : w;
      if (expect) {
        cls = expect;
        expect = '';
      } else if (CONSTANTS.has(w)) {
        cls = 'no';
      } else if (kw && kw.has(probe)) {
        cls = 'k';
        if (TYPE_INTRODUCERS.has(probe)) expect = 'nc';
        else if (FUNC_INTRODUCERS.has(probe)) expect = 'nf';
        else if (probe === 'new') expect = 'nc';
      } else if (TYPES.has(w)) {
        cls = 'kt';
      } else if (isWordFollowedByParen(line, i + w.length)) {
        cls = 'nf';
      }
      out += cls ? span(cls, w) : escapeHTML(w);
      i += w.length;
      continue;
    }

    if (ch === '@' && /[A-Za-z_$]/.test(line[i + 1] || '')) {
      RE_WORD.lastIndex = i + 1;
      const dec = RE_WORD.exec(line);
      if (dec) {
        flush();
        out += span('nd', '@' + dec[0]);
        i += dec[0].length + 1;
        continue;
      }
    }

    if ('+-*/%=<>!&|^~?:'.includes(ch)) {
      flush();
      out += span('o', ch);
      i++;
      continue;
    }
    if ('(){}[],;.'.includes(ch)) {
      flush();
      out += span('p', ch);
      i++;
      continue;
    }

    plain += ch;
    i++;
  }
  flush();
  return out;
}

function highlightTag(tag) {
  let out = '';
  let i = 0;
  const open = /^<\/?([A-Za-z][\w:-]*)/.exec(tag);
  if (open) {
    out += span('p', tag.slice(0, open[0].length - open[1].length));
    out += span('nt', open[1]);
    i = open[0].length;
  } else {
    out += span('p', tag[0]);
    i = 1;
  }
  while (i < tag.length) {
    const ch = tag[i];
    if (/\s/.test(ch)) { out += escapeHTML(ch); i++; continue; }
    if (ch === '=') { out += span('o', '='); i++; continue; }
    if (ch === '>' || ch === '/') { out += span('p', ch); i++; continue; }
    if (ch === '"' || ch === "'") {
      const end = tag.indexOf(ch, i + 1);
      const stop = end < 0 ? tag.length : end + 1;
      out += span('s', tag.slice(i, stop));
      i = stop;
      continue;
    }
    RE_ATTR.lastIndex = i;
    const attr = RE_ATTR.exec(tag);
    if (attr) {
      out += span('na', attr[0]);
      i += attr[0].length;
      continue;
    }
    out += span('p', ch);
    i++;
  }
  return out;
}

function highlightHTMLLine(line, st) {
  let out = '';
  let plain = '';
  const flush = () => { if (plain) { out += escapeHTML(plain); plain = ''; } };
  let i = 0;
  while (i < line.length) {
    if (st.blockEnd) {
      const end = line.indexOf(st.blockEnd, i);
      if (end < 0) {
        flush();
        out += span('c', line.slice(i));
        return out;
      }
      flush();
      out += span('c', line.slice(i, end + st.blockEnd.length));
      i = end + st.blockEnd.length;
      st.blockEnd = '';
      continue;
    }
    if (line.startsWith('<!--', i)) {
      const end = line.indexOf('-->', i + 4);
      flush();
      if (end < 0) {
        out += span('c', line.slice(i));
        st.blockEnd = '-->';
        return out;
      }
      out += span('c', line.slice(i, end + 3));
      i = end + 3;
      continue;
    }
    if (line[i] !== '<') { plain += line[i++]; continue; }
    let j = i;
    let quote = '';
    while (j < line.length) {
      const c = line[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= line.length) { plain += line.slice(i); break; }
    flush();
    out += highlightTag(line.slice(i, j + 1));
    i = j + 1;
  }
  flush();
  return out;
}

function highlightMarkdownLine(line, st) {
  if (/^\s*(```|~~~)/.test(line)) {
    st.fence = !st.fence;
    return span('s', line);
  }
  if (st.fence) return span('s', line);
  if (/^#{1,6}\s/.test(line)) return span('gh', line);
  let out = '';
  let plain = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] === '`') {
      const end = line.indexOf('`', i + 1);
      if (end > i) {
        if (plain) { out += escapeHTML(plain); plain = ''; }
        out += span('s', line.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    plain += line[i++];
  }
  if (plain) out += escapeHTML(plain);
  return out;
}

function highlightKeyValueLine(line, fam, st) {
  const commentAt = (text, start) => {
    let quote = '';
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '\\') { i++; continue; }
        if (c === quote) quote = '';
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '#' || (fam === 'ini' && c === ';')) return i;
    }
    return -1;
  };

  // A table header in TOML, not a key/value pair.
  const header = /^(\s*)(\[[^\]]+\])(.*)$/.exec(line);
  if (fam === 'toml' && header) {
    return span('p', header[1]) + span('nc', header[2]) +
      highlightCodeLine(header[3], fam, st);
  }

  let sep = -1;
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' || (fam === 'ini' && c === ';')) break;
    if (c === ':' || c === '=') { sep = i; break; }
  }
  if (sep < 0) {
    const cut = commentAt(line, 0);
    if (cut >= 0) return escapeHTML(line.slice(0, cut)) + span('c', line.slice(cut));
    return escapeHTML(line);
  }
  const head = line.slice(0, sep);
  const lead = /^\s*/.exec(head)[0];
  const key = head.slice(lead.length).replace(/\s+$/, '');
  const gap = head.slice(lead.length + key.length);
  const sepText = line.slice(sep, sep + 1);
  const tail = line.slice(sep + 1);
  return escapeHTML(lead) + (key ? span('na', key) : '') + escapeHTML(gap) + span('p', sepText) +
    highlightCodeLine(tail, fam === 'ini' ? 'ini' : fam, st);
}

/**
 * Highlight a whole file for the editable overlay.
 * @param {string} text
 * @param {string} lang Chroma lexer name from /api/file
 * @returns {string} HTML with one text line per source line
 */
export function highlightText(text, lang) {
  const fam = languageFamily(lang);
  if (!fam || fam === 'plain') return escapeHTML(text);
  const st = { blockEnd: '', quote: '', fence: false };
  const lines = text.split('\n');
  const out = new Array(lines.length);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fam === 'html') out[i] = highlightHTMLLine(line, st);
    else if (fam === 'markdown') out[i] = highlightMarkdownLine(line, st);
    else if (fam === 'yaml' || fam === 'toml' || fam === 'ini') out[i] = highlightKeyValueLine(line, fam, st);
    else out[i] = highlightCodeLine(line, fam, st);
  }
  return out.join('\n');
}
