// 체크한 개념과 실습, 푼 문제를 이 브라우저(localStorage)에 남기고 진행 막대를 그립니다.
// 서버로 보내는 것은 없습니다. 저장이 막힌 브라우저에서도 체크 자체는 그 페이지에서 동작합니다.
(() => {
  const KEY = "mlnl-cs:progress";

  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const write = (value) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // 저장을 막아 둔 브라우저에서는 이 페이지에서만 유지됩니다
    }
  };

  let done = read();
  // 파트 화면이 있는 쪽에서 아래에서 채웁니다
  let refreshParts = () => {};

  function render() {
    const keys = Object.keys(done);
    for (const el of document.querySelectorAll("[data-progress]")) {
      const scope = el.dataset.progress;
      const total = Number(el.dataset.total) || 0;
      const count = scope === "*" ? keys.filter((k) => k.includes(":s:")).length : keys.filter((k) => k.startsWith(`${scope}:`)).length;
      // 내용이 바뀌어 사라진 항목의 기록이 남아 있어도 전체를 넘지 않게 합니다
      const n = Math.min(total, count);
      el.querySelector(".n").textContent = String(n);
      el.style.setProperty("--p", total ? `${(n / total) * 100}%` : "0%");
      el.classList.toggle("is-done", total > 0 && n === total);
    }
  }

  function sync() {
    for (const box of document.querySelectorAll("input[data-key]")) box.checked = Boolean(done[box.dataset.key]);
    render();
  }

  document.addEventListener("change", (e) => {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || !box.dataset.key) return;
    done = read();
    if (box.checked) done[box.dataset.key] = 1;
    else delete done[box.dataset.key];
    write(done);
    render();
    refreshParts();
  });

  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    if (!window.confirm("체크한 기록을 모두 지울까요?")) return;
    done = {};
    write(done);
    sync();
  });

  // 다른 탭에서 체크하면 이 탭도 맞춥니다
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    done = read();
    sync();
    refreshParts();
  });

  sync();

  // 문제: 보기를 누르거나 답을 적으면 바로 맞았는지 보여 주고 해설을 펼칩니다. 처음 고른 답을 기억합니다
  const QUIZ = "mlnl-cs:quiz";
  const loadQuiz = () => {
    try {
      const value = JSON.parse(localStorage.getItem(QUIZ) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const saveQuiz = (value) => {
    try {
      localStorage.setItem(QUIZ, JSON.stringify(value));
    } catch {
      // 저장이 막혀 있으면 이 페이지에서만 기억합니다
    }
  };
  let answers = loadQuiz();
  /** 띄어쓰기, 대소문자, 천 단위 쉼표를 무시하고 비교합니다 */
  const norm = (s) => String(s).toLowerCase().replace(/[\s,]/g, "");

  function showQuiz(quiz) {
    const state = answers[quiz.dataset.quiz];
    const result = quiz.querySelector(".quiz-result");
    const explain = quiz.querySelector(".quiz-explain");
    const options = [...quiz.querySelectorAll(".quiz-option")];
    const form = quiz.querySelector(".quiz-input");
    quiz.classList.toggle("is-answered", Boolean(state));
    quiz.classList.toggle("is-right", Boolean(state?.ok));
    quiz.classList.toggle("is-wrong", Boolean(state && !state.ok));
    options.forEach((button, n) => {
      button.disabled = Boolean(state);
      button.classList.toggle("is-picked", state?.pick === n);
      button.classList.toggle("is-correct", Boolean(state) && button.hasAttribute("data-correct"));
    });
    if (form) {
      const input = form.querySelector("input");
      input.disabled = Boolean(state);
      form.querySelector("button").disabled = Boolean(state);
      if (state) input.value = state.pick;
      else input.value = "";
    }
    if (result) {
      if (!state) result.textContent = "";
      else if (state.ok) result.textContent = "맞았습니다.";
      else if (form) result.textContent = `아쉽습니다. 답은 ${form.dataset.answers.split("\u0001")[0]}입니다.`;
      else result.textContent = "아쉽습니다. 표시한 보기가 정답입니다.";
    }
    if (explain) explain.open = Boolean(state);
  }

  function score(set) {
    const quizzes = [...set.querySelectorAll("[data-quiz]")];
    const done = quizzes.filter((q) => answers[q.dataset.quiz]);
    let bar = set.querySelector(".quiz-score");
    // 본문 중간에 하나씩 둔 문제에는 점수 줄을 달지 않습니다
    if (!done.length || quizzes.length < 2) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "quiz-score";
      bar.innerHTML = '<span></span><button type="button">다시 풀기</button>';
      bar.querySelector("button").addEventListener("click", () => {
        answers = loadQuiz();
        for (const q of quizzes) delete answers[q.dataset.quiz];
        saveQuiz(answers);
        for (const q of quizzes) showQuiz(q);
        score(set);
        refreshParts();
      });
      set.append(bar);
    }
    const right = done.filter((q) => answers[q.dataset.quiz].ok).length;
    bar.querySelector("span").textContent = `${quizzes.length}문제 중 ${done.length}개 풀고 ${right}개 맞힘`;
  }

  function answer(quiz, pick, ok) {
    answers = loadQuiz();
    if (answers[quiz.dataset.quiz]) return;
    answers[quiz.dataset.quiz] = { pick, ok };
    saveQuiz(answers);
    showQuiz(quiz);
    const set = quiz.closest("[data-quiz-set]");
    if (set) score(set);
    refreshParts();
  }

  for (const quiz of document.querySelectorAll("[data-quiz]")) {
    quiz.querySelectorAll(".quiz-option").forEach((button, n) => {
      button.addEventListener("click", () => answer(quiz, n, button.hasAttribute("data-correct")));
    });
    const form = quiz.querySelector(".quiz-input");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = form.querySelector("input").value;
      if (!value.trim()) return;
      const ok = form.dataset.answers.split("\u0001").some((a) => norm(a) === norm(value));
      answer(quiz, value.trim(), ok);
    });
    showQuiz(quiz);
  }
  for (const set of document.querySelectorAll("[data-quiz-set]")) score(set);
  window.addEventListener("storage", (e) => {
    if (e.key !== QUIZ) return;
    answers = loadQuiz();
    for (const quiz of document.querySelectorAll("[data-quiz]")) showQuiz(quiz);
    for (const set of document.querySelectorAll("[data-quiz-set]")) score(set);
    refreshParts();
  });

  // 장을 파트로 나눠 한 번에 하나씩 보여 줍니다. 파트의 문제를 모두 풀어야 "학습 완료"를 체크할 수 있고,
  // 파트마다 메모를 남깁니다. 진행, 메모, 마지막으로 본 파트는 모두 이 브라우저에만 남습니다
  const NOTES = "mlnl-cs:notes";
  const LAST = "mlnl-cs:last";
  const loadMap = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  };
  const saveMap = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장이 막혀 있으면 이 페이지에서만 유지됩니다
    }
  };

  const sections = [...document.querySelectorAll("section.part[data-part]")];
  if (sections.length) {
    document.documentElement.classList.add("js-parts");
    const slug = location.pathname.split("/").filter(Boolean)[0] ?? "";
    const links = [...document.querySelectorAll("[data-part-link]")];
    const memo = document.querySelector("[data-memo]");
    const status = document.querySelector("[data-memo-status]");
    const panel = document.querySelector(".parts-panel");
    if (panel && window.matchMedia?.("(max-width: 1023px)").matches) panel.open = false;
    let current = sections[0];
    const noteKey = (sec) => `${slug}:${sec.dataset.part}`;

    const hub = document.querySelector("[data-hub], #parts");
    const cards = [...document.querySelectorAll("[data-part-card]")];
    const resume = document.querySelector("[data-resume]");
    // 장의 첫 화면: 파트 카드 목록. 이어서 볼 파트가 있으면 그 버튼을 보여 줍니다
    const showHub = () => {
      document.documentElement.classList.add("is-hub");
      for (const s of sections) s.classList.remove("is-current");
      for (const a of links) a.classList.remove("is-current");
      const last = sections.find((s) => s.dataset.part === loadMap(LAST)[slug]);
      if (resume && last) {
        const n = sections.indexOf(last) + 1;
        resume.href = `#part-${last.dataset.part}`;
        resume.textContent = `이어서 보기: 파트 ${n}`;
      }
    };
    const show = (sec) => {
      document.documentElement.classList.remove("is-hub");
      current = sec;
      for (const s of sections) s.classList.toggle("is-current", s === sec);
      for (const a of links) {
        const on = a.dataset.partLink === sec.dataset.part;
        a.classList.toggle("is-current", on);
        if (on) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      }
      if (memo) {
        memo.value = loadMap(NOTES)[noteKey(sec)] ?? "";
        status.textContent = "이 브라우저에만 저장됩니다";
      }
      saveMap(LAST, { ...loadMap(LAST), [slug]: sec.dataset.part });
    };
    // 주소의 #가 파트이거나 파트 안의 제목이면 그 파트를 엽니다
    const target = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id && document.getElementById(id);
      if (!el) return null;
      const sec = el.matches("section.part") ? el : el.closest("section.part");
      return sec ? { sec, el } : null;
    };

    refreshParts = () => {
      const progress = read();
      const notes = loadMap(NOTES);
      for (const sec of sections) {
        const quizzes = [...sec.querySelectorAll("[data-quiz]")];
        const solved = quizzes.filter((q) => answers[q.dataset.quiz]).length;
        const box = sec.querySelector(".part-end input[data-key]");
        const hint = sec.querySelector("[data-part-hint]");
        const ready = solved === quizzes.length;
        box.disabled = !ready && !box.checked;
        hint.textContent = !quizzes.length
          ? ""
          : ready
            ? `이 파트의 문제 ${quizzes.length}개를 모두 풀었어요`
            : `이 파트의 문제 ${quizzes.length}개 중 ${solved}개를 풀었어요. 모두 풀면 체크할 수 있어요`;
        const isDone = Boolean(progress[box.dataset.key]);
        const hasMemo = Boolean(notes[noteKey(sec)]);
        const link = links.find((a) => a.dataset.partLink === sec.dataset.part);
        link?.classList.toggle("is-done", isDone);
        link?.classList.toggle("has-memo", hasMemo);
        const card = cards.find((a) => a.dataset.partCard === sec.dataset.part);
        if (card) {
          card.classList.toggle("is-done", isDone);
          card.classList.toggle("has-memo", hasMemo);
          card.querySelector("[data-card-state]").textContent = isDone
            ? "학습 완료"
            : quizzes.length && solved
              ? `문제 ${solved}/${quizzes.length}`
              : "";
        }
      }
    };

    const route = () => {
      const t = target();
      if (t) {
        show(t.sec);
        t.el.scrollIntoView?.();
      } else {
        showHub();
        if (location.hash === "#parts") hub?.scrollIntoView?.();
      }
    };
    route();
    refreshParts();
    window.addEventListener("hashchange", route);

    let timer = 0;
    memo?.addEventListener("input", () => {
      clearTimeout(timer);
      status.textContent = "저장하는 중…";
      const sec = current;
      timer = setTimeout(() => {
        const notes = loadMap(NOTES);
        if (memo.value.trim()) notes[noteKey(sec)] = memo.value;
        else delete notes[noteKey(sec)];
        saveMap(NOTES, notes);
        status.textContent = "저장했어요. 이 브라우저에만 남습니다";
        refreshParts();
      }, 400);
    });
    window.addEventListener("storage", (e) => {
      if (e.key !== NOTES) return;
      if (memo && document.activeElement !== memo) memo.value = loadMap(NOTES)[noteKey(current)] ?? "";
      refreshParts();
    });
  }

  // 내 메모: 장 순서대로 모아 보여 줍니다. 메모 글자는 textContent로만 넣습니다
  const notesBox = document.querySelector("[data-notes]");
  const bookMap = document.getElementById("book-map");
  if (notesBox && bookMap) {
    const notes = loadMap(NOTES);
    const chapters = JSON.parse(bookMap.textContent || "[]");
    const el = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    };
    let count = 0;
    const frag = document.createDocumentFragment();
    for (const ch of chapters) {
      const items = ch.parts.filter((p) => notes[`${ch.slug}:${p.id}`]);
      if (!items.length) continue;
      const box = el("section", "notes-chapter");
      const h = el("h2");
      const a = el("a", null, `${ch.num} ${ch.title}`);
      a.href = `/${ch.slug}/`;
      h.append(a);
      box.append(h);
      for (const p of items) {
        const item = el("div", "note");
        const link = el("a", "note-part", p.title);
        link.href = `/${ch.slug}/#part-${encodeURIComponent(p.id)}`;
        item.append(link, el("p", "note-text", notes[`${ch.slug}:${p.id}`]));
        box.append(item);
        count++;
      }
      frag.append(box);
    }
    if (count) notesBox.replaceChildren(frag);
  }

  // 용어 사전: 입력한 글자가 용어나 뜻에 들어 있는 줄만 남깁니다
  const filter = document.querySelector("[data-filter]");
  if (filter instanceof HTMLInputElement) {
    const rows = [...document.querySelectorAll(".term-row[data-search]")];
    const groups = [...document.querySelectorAll("[data-group]")];
    const empty = document.querySelector("[data-empty]");
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      for (const row of rows) row.hidden = q !== "" && !row.dataset.search.includes(q);
      for (const g of groups) g.hidden = !g.querySelector(".term-row:not([hidden])");
      if (empty) empty.hidden = groups.some((g) => !g.hidden);
    });
  }
})();
