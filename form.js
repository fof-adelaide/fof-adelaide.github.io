/* The multi-step form. All of its wording comes from config.js. */
(function () {
  'use strict';
  const C = window.FOF_CONFIG;
  // The stickers are decoration, so the form has to work even if they fail to load.
  const noop = () => {};
  const NO_SCENE = { start: noop, celebrate: noop, setPaused: noop, canPause: false };
  let scene = window.FOFScene || NO_SCENE;
  const card = document.getElementById('card');
  const inner = document.getElementById('card-inner');
  const statusBox = document.getElementById('status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover)').matches;

  // Each option lights up in the next chapter colour. They're all light fills, so the black check reads the same
  // on every chip and black text stays above 4.5:1. That rules out Purple and Dark Blue here.
  const ON_COLOURS = ['#FF7676', '#E4FF97', '#33DFDF', '#24CB71'];
  const PROGRESS_SHAPES = [
    'M11 1a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z',
    'M3 1h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z',
    'M11 1l9 5v10l-9 5-9-5V6Z',
    'M2 21V11a9 9 0 0 1 18 0v10Z',
  ];
  const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
  const ARROW = '<svg viewBox="0 0 20 20"><path d="M2 10h15.5M11 3.5l6.5 6.5-6.5 6.5"/></svg>'; // Funnel Sans has no arrow glyph
  const OTHER = '__other';
  const ERROR_ID = 'form-error';

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children || []) if (child) node.appendChild(child);
    return node;
  }

  const questions = C.questions;
  const refs = {};
  let index = 0, busy = false, invalid = null, motionPaused = false;

  const firstName = () => {
    const input = refs.name && refs.name.input;
    return input ? input.value.trim().split(/\s+/)[0] : '';
  };
  const withName = (text) => text.replace('{name}', () => firstName()).replace(/,\s*\./, '.').replace(/\s+!/, '!');

  /* ---------- Build ---------- */
  function buildOption(q, option, i, isOther) {
    const label = typeof option === 'string' ? option : option.label;
    const hint = typeof option === 'string' ? null : option.hint;
    const on = ON_COLOURS[i % ON_COLOURS.length];
    const input = el('input', { type: q.type === 'multi' ? 'checkbox' : 'radio', name: q.id, value: isOther ? OTHER : label });
    const text = el('span', { text: label }, hint ? [el('small', { text: hint })] : []);
    const face = el('span', { class: 'face' }, [el('span', { class: 'mark', html: TICK }), text]);
    const wrap = el('label', { class: 'option', style: `--on:${on}` }, [input, face]);
    input.addEventListener('change', () => {
      clearError();
      if (input.checked) {
        wrap.classList.remove('just-picked');
        void wrap.offsetWidth; // Restart the pop if it's picked again quickly.
        wrap.classList.add('just-picked');
      }
      syncOther(q);
    });
    if (isOther) {
      // Only jump to the field after a real tap, so arrow keys can still move through the options.
      // This runs before the change event, so open the field first.
      input.addEventListener('click', (e) => {
        if (!input.checked || e.detail === 0) return;
        syncOther(q);
        const field = refs[q.id].otherInput;
        field.focus({ preventScroll: true });
        setTimeout(() => field.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' }), reducedMotion ? 0 : 300);
      });
    }
    return wrap;
  }

  function syncOther(q) {
    const ref = refs[q.id];
    if (ref.otherField) ref.otherField.classList.toggle('open', ref.otherOption.checked);
  }

  function buildStep(q) {
    const titleId = `title-${q.id}`;
    const hintId = q.hint ? `hint-${q.id}` : null;
    const section = el('section', { class: `step step--${q.type}`, hidden: true });
    const ref = { q, section };
    refs[q.id] = ref;

    if (q.type === 'text') {
      ref.title = el('label', { for: `q-${q.id}` });
      ref.heading = el('h1', { class: 'q-title', id: titleId, tabindex: '-1' }, [ref.title]);
    } else {
      ref.title = el('h1', { class: 'q-title', id: titleId, tabindex: '-1' });
      ref.heading = ref.title;
    }
    section.appendChild(ref.heading);
    if (q.hint) section.appendChild(el('p', { class: 'q-hint', id: hintId, text: q.hint }));
    const answers = el('div', { class: 'answers' });
    section.appendChild(answers);

    if (q.type === 'text') {
      ref.input = el('input', { class: 'text-input', id: `q-${q.id}`, type: 'text', placeholder: q.placeholder, autocomplete: q.autocomplete, maxlength: q.maxLength, enterkeyhint: 'next', required: true, 'aria-describedby': hintId });
      ref.input.addEventListener('input', clearError);
      answers.appendChild(ref.input);
      return section;
    }

    const options = q.options.map((o, n) => buildOption(q, o, n, false));
    if (q.other) {
      const otherOption = buildOption(q, q.other.label, q.options.length, true);
      options.push(otherOption);
      ref.otherOption = otherOption.querySelector('input');
    }
    ref.group = el('div', { class: `options${q.layout === 'list' ? ' options--list' : ''}`, role: q.type === 'multi' ? 'group' : 'radiogroup', 'aria-labelledby': titleId, 'aria-describedby': hintId, 'aria-required': q.type === 'single' ? 'true' : null }, options);
    answers.appendChild(ref.group);
    if (q.other) {
      const fieldId = `other-${q.id}`;
      const field = q.other.rows
        ? el('textarea', { class: 'text-area', id: fieldId, rows: q.other.rows, maxlength: q.other.maxLength, required: true })
        : el('input', { class: 'text-input', id: fieldId, type: 'text', maxlength: q.other.maxLength, required: true });
      field.addEventListener('input', clearError);
      ref.otherInput = field;
      ref.otherField = el('div', { class: 'other-field' }, [el('div', {}, [el('div', { class: 'inner' }, [el('label', { class: 'other-label', for: fieldId, text: q.other.fieldLabel }), field])])]);
      answers.appendChild(ref.otherField);
    }
    return section;
  }

  const progressText = el('span', { class: 'tag' });
  const progressShapes = questions.map((q, i) => el('span', {
    html: `<svg viewBox="0 0 22 22"><path d="${PROGRESS_SHAPES[i % PROGRESS_SHAPES.length]}"/></svg>`,
    style: `--done:${ON_COLOURS[i % ON_COLOURS.length]}`,
  }));
  const progress = el('div', { class: 'progress' }, [progressText, el('div', { class: 'progress-shapes', 'aria-hidden': 'true' }, progressShapes)]);

  const steps = questions.map(buildStep);
  const honeypot = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
  const errorBox = el('p', { class: 'error', id: ERROR_ID, role: 'alert' });
  const backBtn = el('button', { type: 'button', class: 'btn-back', text: C.back });
  const nextLabel = el('span');
  const nextBtn = el('button', { type: 'submit', class: 'btn' }, [nextLabel, el('span', { class: 'arrow', html: ARROW, 'aria-hidden': 'true' })]);
  const actions = el('div', { class: 'actions' }, [backBtn, nextBtn]);
  const form = el('form', { novalidate: true }, [
    progress,
    ...steps,
    el('div', { class: 'hp', 'aria-hidden': 'true' }, [el('label', { text: 'Leave this empty' }, [honeypot])]),
    errorBox,
    actions,
  ]);
  inner.replaceChildren(form);

  // The card animates to the height of whatever is inside it. Its physics body follows along.
  new ResizeObserver(() => { card.style.height = `${inner.offsetHeight}px`; }).observe(inner);

  /* ---------- Reading and checking answers ---------- */
  function readAnswer(q) {
    const ref = refs[q.id];
    if (q.type === 'text') return ref.input.value.trim();
    const checked = [...ref.group.querySelectorAll('input:checked')];
    const otherText = ref.otherInput ? ref.otherInput.value.trim() : '';
    if (q.type === 'single') {
      if (!checked.length) return '';
      return checked[0].value === OTHER ? otherText : checked[0].value;
    }
    return { picked: checked.filter((c) => c.value !== OTHER).map((c) => c.value), other: ref.otherOption && ref.otherOption.checked ? otherText : '' };
  }

  function validate(q) {
    const ref = refs[q.id];
    if (q.type === 'text') return ref.input.value.trim() ? null : { message: q.error, focus: ref.input, target: ref.input };
    if (!ref.group.querySelector('input:checked')) return { message: q.error, focus: ref.group.querySelector('input'), target: ref.group };
    if (ref.otherOption && ref.otherOption.checked && !ref.otherInput.value.trim()) return { message: q.other.error, focus: ref.otherInput, target: ref.otherInput };
    return null;
  }

  function clearError() {
    errorBox.textContent = '';
    if (!invalid) return;
    invalid.node.removeAttribute('aria-invalid');
    if (invalid.describedBy) invalid.node.setAttribute('aria-describedby', invalid.describedBy);
    else invalid.node.removeAttribute('aria-describedby');
    invalid = null;
  }

  function showError(problem) {
    clearError();
    errorBox.textContent = problem.message;
    const node = problem.target;
    invalid = { node, describedBy: node.getAttribute('aria-describedby') };
    // aria-invalid isn't allowed on a plain group of checkboxes, but the error is still linked to it.
    if (node.getAttribute('role') !== 'group') node.setAttribute('aria-invalid', 'true');
    node.setAttribute('aria-describedby', [invalid.describedBy, ERROR_ID].filter(Boolean).join(' '));
    problem.focus.focus({ preventScroll: true });
    if (!reducedMotion) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out' });
    errorBox.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  /* ---------- Moving between steps ---------- */
  function renderChrome() {
    const isLast = index === questions.length - 1;
    const count = C.progress.replace('{n}', index + 1).replace('{total}', questions.length);
    progressText.textContent = count;
    document.title = `${count}: ${C.pageTitle}`;
    progressShapes.forEach((shape, i) => {
      shape.className = i < index ? 'done' : i === index ? 'now' : '';
    });
    backBtn.hidden = index === 0;
    nextLabel.textContent = isLast ? C.submit : C.next;
    nextBtn.classList.toggle('btn--big', isLast);
    actions.classList.toggle('is-last', isLast);
    const q = questions[index];
    refs[q.id].title.textContent = withName(q.title);
  }

  async function goTo(nextIndex, direction) {
    busy = true;
    const from = steps[index], to = steps[nextIndex];
    if (!reducedMotion) {
      try {
        await from.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).finished;
      } catch (e) { /* The animation was interrupted, so carry on. */ }
    }
    from.getAnimations().forEach((a) => a.cancel());
    from.hidden = true;
    index = nextIndex;
    renderChrome();
    to.hidden = false;
    // The question only fades, so it never moves. The answers slide in beneath it.
    if (!reducedMotion) {
      to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      to.querySelector('.answers').animate([{ transform: `translateX(${18 * direction}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' });
    }
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    refs[questions[index].id].heading.focus({ preventScroll: true });
    busy = false;
  }

  backBtn.addEventListener('click', () => {
    if (busy || index === 0) return;
    clearError();
    goTo(index - 1, -1);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = validate(questions[index]);
    if (problem) { showError(problem); return; }
    clearError();
    if (index < questions.length - 1) {
      goTo(index + 1, 1);
    } else {
      sendAnswers();
    }
  });

  /* ---------- Saving ---------- */
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function post(payload) {
    if (!C.sheetEndpoint) {
      console.info('Preview mode: nothing was saved. Add sheetEndpoint in config.js.', payload);
      await wait(700);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      // Plain text keeps this a simple request, which Apps Script can answer across origins.
      const res = await fetch(C.sheetEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reply = await res.json();
      if (!reply.ok) throw new Error(reply.error || 'Not saved');
    } finally {
      clearTimeout(timer);
    }
  }

  function sendErrorMessage(err) {
    if (navigator.onLine === false) return C.sendErrors.offline;
    if (err && err.name === 'AbortError') return C.sendErrors.timeout;
    return C.sendErrors.failed;
  }

  function setSending(on) {
    // aria-disabled rather than disabled, so focus stays on the button if the send fails.
    if (on) nextBtn.setAttribute('aria-disabled', 'true'); else nextBtn.removeAttribute('aria-disabled');
    nextLabel.textContent = on ? C.sending : C.submit;
    backBtn.hidden = on;
    statusBox.textContent = on ? C.sending : '';
  }

  async function sendAnswers() {
    busy = true;
    clearError();
    setSending(true);
    const wants = readAnswer(refs.wants.q);
    const payload = {
      name: readAnswer(refs.name.q),
      role: readAnswer(refs.role.q),
      experience: readAnswer(refs.experience.q),
      wants: wants.picked,
      other: wants.other,
      website: honeypot.value,
    };
    try {
      if (payload.website) await wait(400); // A bot filled in the hidden field, so don't send it anywhere.
      else await post(payload);
      const from = nextBtn.getBoundingClientRect();
      await showThanks();
      scene.celebrate(from);
    } catch (err) {
      console.error('The answers could not be saved:', err);
      setSending(false);
      errorBox.textContent = sendErrorMessage(err);
      busy = false;
    }
  }

  // Measures the sticker's text on one line and tells the CSS how many ems wide it is, so the type shrinks to fit a long
  // name and follows the card if its width changes. A name too long to fit at the smallest size gets plain thanks.
  function fitWordSticker(word) {
    const TILT_ROOM = 1.03;
    word.style.whiteSpace = 'nowrap';
    word.style.maxWidth = 'none';
    const ems = (word.offsetWidth / parseFloat(getComputedStyle(word).fontSize)) * TILT_ROOM;
    word.style.whiteSpace = '';
    word.style.maxWidth = '';
    const smallest = 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (ems * smallest > word.parentElement.clientWidth) {
      word.textContent = C.thanks.word.replace(/,?\s*\{name\}/, '');
      word.style.removeProperty('--fit');
    } else {
      word.style.setProperty('--fit', ems.toFixed(3));
    }
  }

  async function showThanks() {
    const T = C.thanks;
    const word = el('p', { class: 'word-sticker', text: withName(T.word) });
    const title = el('h1', { class: 'thanks-title', tabindex: '-1', text: T.title });
    // The progress row stays where it was, now finished, so the card's contents don't jump.
    const finished = progressShapes.map((shape) => { const copy = shape.cloneNode(true); copy.className = 'done'; return copy; });
    const thanks = el('div', { class: 'thanks' }, [
      el('div', { class: 'progress' }, [el('span', { class: 'tag', text: T.tag }), el('div', { class: 'progress-shapes', 'aria-hidden': 'true' }, finished)]),
      word,
      title,
      el('p', { class: 'thanks-body', text: T.body }),
      el('div', { class: 'thanks-foot' }, [
        T.hint && scene.canPause && !motionPaused ? el('p', { class: 'thanks-hint', text: T.hint }) : null,
        el('img', { class: 'thanks-sticker', src: 'assets/thanks-sticker.svg', alt: '' }),
      ]),
    ]);
    if (!reducedMotion) {
      try { await form.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' }).finished; } catch (e) { /* Carry on. */ }
    }
    inner.replaceChildren(thanks);
    fitWordSticker(word);
    document.fonts.ready.then(() => fitWordSticker(word));
    statusBox.textContent = '';
    document.title = `${T.pageTitle}: ${C.pageTitle}`;
    title.focus({ preventScroll: true });
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  /* ---------- Motion control: a person can always stop the background ---------- */
  function bindMotionToggle() {
    const toggle = document.getElementById('motion-toggle');
    if (!scene.canPause) return;
    const KEY = 'fof-motion-paused';
    try { motionPaused = localStorage.getItem(KEY) === '1'; } catch (e) { /* Storage may be unavailable. */ }
    const render = () => { toggle.textContent = motionPaused ? C.motion.play : C.motion.pause; };
    render();
    toggle.hidden = false;
    if (motionPaused) scene.setPaused(true);
    toggle.addEventListener('click', () => {
      motionPaused = !motionPaused;
      scene.setPaused(motionPaused);
      render();
      try { localStorage.setItem(KEY, motionPaused ? '1' : '0'); } catch (e) { /* Storage may be unavailable. */ }
    });
  }

  /* ---------- Go ---------- */
  document.getElementById('preview-note').hidden = !!C.sheetEndpoint;
  steps[0].hidden = false;
  renderChrome();
  bindMotionToggle();
  try {
    scene.start();
  } catch (err) {
    console.error('The background could not start:', err);
    scene = NO_SCENE;
    document.getElementById('motion-toggle').hidden = true;
  }
  if (canHover && refs.name) refs.name.input.focus({ preventScroll: true });
})();
