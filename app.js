(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'unplugged-py';
  const TIMEOUT_MS = 5000;
  const state = { solved: [], streak: 0, current: null, currentSolved: true, sound: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const code = $('code');
  let puzzles = [], puzzle, worker, ready = false, runId = 0, timer;

  const pyRepr = (v) =>
    v === null ? 'None' : v === true ? 'True' : v === false ? 'False'
    : typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
    : Array.isArray(v) ? `[${v.map(pyRepr).join(', ')}]` : String(v);
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});

  // --- sound: tiny square-wave chiptunes, no files ---
  let ac;
  function beep(notes, dur = 0.08, type = 'square') {
    if (!state.sound) return;
    ac ??= new AudioContext();
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * dur;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
    });
  }
  const sfx = { run: () => beep([660, 880], 0.05), fail: () => beep([220, 160], 0.14, 'sawtooth'), win: () => beep([523, 659, 784, 1047, 784, 1047], 0.09) };

  // --- confetti: chunky pixels ---
  function confetti() {
    const c = $('confetti'), ctx = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    const colors = ['#39ff7a', '#ffb000', '#ff4fa3', '#4fe3ff', '#eaffef'];
    const bits = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, s: 6 + Math.floor(Math.random() * 3) * 3, col: colors[Math.floor(Math.random() * colors.length)] }));
    const end = performance.now() + 2200;
    (function frame(now) {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const b of bits) { b.x += b.vx; b.y += b.vy; b.vy += 0.08; ctx.fillStyle = b.col; ctx.fillRect(Math.round(b.x), Math.round(b.y), b.s, b.s); }
      if (now < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
    })(performance.now());
    const banner = $('clear'); banner.hidden = false; banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
    setTimeout(() => { banner.hidden = true; }, 1700);
  }

  // --- python worker ---
  function startWorker() {
    ready = false;
    setRun('LOADING PYTHON…', true);
    worker = new Worker('worker.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') { ready = true; setRun('RUN ▶', false); return; }
      if (data.id !== runId) return;
      clearTimeout(timer);
      setRun('RUN ▶', false);
      render(data);
    };
    worker.onerror = () => { setRun('PYTHON FAILED TO LOAD', true); };
  }
  function setRun(label, disabled) { $('run').textContent = label; $('run').disabled = disabled; }

  function run() {
    if (!ready) return;
    sfx.run();
    setRun('RUNNING…', true);
    $('out').replaceChildren(el('p', 'dim', '> running tests_'));
    $('score').textContent = '';
    const id = ++runId;
    worker.postMessage({ id, code: code.value, fn: puzzle.fn, cases: puzzle.cases });
    timer = setTimeout(() => {
      if (id !== runId) return;
      worker.terminate();
      render({ error: `TimeoutError: still running after ${TIMEOUT_MS / 1000}s. Infinite loop?`, results: [], stdout: '' });
      startWorker();
    }, TIMEOUT_MS);
  }

  function render({ error, results, stdout }) {
    const out = $('out');
    out.replaceChildren();
    if (stdout) out.append(el('pre', 'stdout', stdout.trimEnd()));
    if (error) out.append(el('pre', 'err', error));
    for (const r of results) {
      const row = el('div', `test ${r.ok ? 'ok' : 'bad'}`);
      row.append(el('span', 'mark', r.ok ? '✔' : '✘'), el('span', 'call', `${puzzle.fn}(${r.args.map(pyRepr).join(', ')})`));
      const d = el('span', 'detail');
      if (r.ok) d.textContent = `→ ${pyRepr(r.got)}`;
      else {
        d.append(`expected ${pyRepr(r.expected)}, got `);
        d.append(el('b', null, r.crash ? r.got : typeof r.got === 'string' && r.got.startsWith('<') ? r.got : pyRepr(r.got)));
      }
      row.append(d);
      out.append(row);
    }
    const passed = results.filter((r) => r.ok).length;
    $('score').textContent = results.length ? `${passed}/${results.length} PASSED` : 'ERROR';
    if (!error && results.length && passed === results.length) win();
    else { sfx.fail(); $('out').parentElement.classList.remove('shake'); void out.offsetWidth; $('out').parentElement.classList.add('shake'); }
  }

  function win() {
    sfx.win();
    confetti();
    if (!state.currentSolved) {
      state.currentSolved = true;
      state.streak += 1;
      if (!state.solved.includes(puzzle.id)) state.solved.push(puzzle.id);
      save();
      updateStats();
    }
    $('out').append(el('p', 'win', `LEVEL CLEAR! 🔥 ${state.streak} in a row. Refresh for the next one.`));
  }

  function updateStats() {
    $('streak').textContent = state.streak;
    $('solved').textContent = state.solved.length;
    $('total').textContent = puzzles.length;
    $('sound').textContent = state.sound ? '🔊' : '🔇';
  }

  // --- puzzle selection: skipping an unsolved puzzle breaks the streak ---
  function pick() {
    if (state.current && !state.currentSolved) state.streak = 0;
    const others = puzzles.filter((p) => p.id !== state.current);
    const fresh = others.filter((p) => !state.solved.includes(p.id));
    const pool = fresh.length ? fresh : others;
    puzzle = pool[Math.floor(Math.random() * pool.length)];
    state.current = puzzle.id;
    state.currentSolved = false;
    save();
    show();
  }

  let typing;
  function show() {
    const n = puzzles.indexOf(puzzle) + 1;
    $('pnum').textContent = `PUZZLE #${String(n).padStart(2, '0')}${state.solved.includes(puzzle.id) ? ' ✔' : ''}`;
    $('plevel').textContent = '★'.repeat(puzzle.level) + '☆'.repeat(3 - puzzle.level);
    $('ptitle').textContent = puzzle.title.toUpperCase();
    $('hint').hidden = true;
    $('hint').textContent = `HINT: ${puzzle.hint}`;
    code.value = puzzle.starter;
    syncGutter();
    $('out').replaceChildren(el('p', 'dim', '> press RUN to test your code_'));
    $('score').textContent = '';
    clearInterval(typing);
    const p = $('prompt'), text = puzzle.prompt;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { p.textContent = text; return; }
    let i = 0;
    p.textContent = '';
    typing = setInterval(() => { p.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typing); }, 14);
    updateStats();
  }

  // --- editor: line numbers, tab = 4 spaces, auto-indent. That's it. ---
  function syncGutter() {
    const lines = code.value.split('\n').length;
    $('gutter').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  }
  function insert(text) {
    const { selectionStart: s, selectionEnd: e } = code;
    code.setRangeText(text, s, e, 'end');
    syncGutter();
  }
  code.addEventListener('input', syncGutter);
  code.addEventListener('scroll', () => { $('gutter').scrollTop = code.scrollTop; });
  code.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insert('    '); return; }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const s = code.selectionStart, lineStart = code.value.lastIndexOf('\n', s - 1) + 1;
      const strip = code.value.slice(lineStart, lineStart + 4).match(/^ */)[0].length;
      code.setRangeText('', lineStart, lineStart + strip, 'preserve');
      code.selectionStart = code.selectionEnd = Math.max(lineStart, s - strip);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const before = code.value.slice(0, code.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const indent = line.match(/^ */)[0] + (/:\s*$/.test(line) ? '    ' : '');
      insert('\n' + indent);
    }
  });

  $('run').addEventListener('click', run);
  $('next').addEventListener('click', pick);
  $('reset').addEventListener('click', () => { code.value = puzzle.starter; syncGutter(); code.focus(); });
  $('hintBtn').addEventListener('click', () => { $('hint').hidden = false; beep([440], 0.06); });
  $('sound').addEventListener('click', () => { state.sound = !state.sound; save(); updateStats(); });

  startWorker();
  fetch('puzzles.json').then((r) => r.json()).then((p) => { puzzles = p; pick(); });
})();
