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
  const MEMO_OPEN = "mlnl-cs:memo-open";
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

  // 예전에 글자만 저장한 메모는 문단 HTML로 바꿔 읽습니다
  const asHtml = (v) => {
    if (!v) return "";
    if (/^\s*</.test(v)) return v;
    const d = document.createElement("div");
    return v
      .split(/\n{2,}/)
      .map((para) => {
        d.textContent = para;
        return `<p>${d.innerHTML.replace(/\n/g, "<br>")}</p>`;
      })
      .join("");
  };

  const sections = [...document.querySelectorAll("section.part[data-part]")];
  if (sections.length) {
    const root = document.documentElement;
    root.classList.add("js-parts");
    const slug = location.pathname.split("/").filter(Boolean)[0] ?? "";
    const cards = [...document.querySelectorAll("[data-part-card]")];
    const tocs = [...document.querySelectorAll("[data-toc-for]")];
    const resume = document.querySelector("[data-resume]");
    const hub = document.getElementById("parts");
    const panel = document.querySelector("[data-memo-panel]");
    const status = document.querySelector("[data-memo-status]");
    let current = null;
    const noteKey = (sec) => `${slug}:${sec.dataset.part}`;
    const titleOf = (sec) => `파트 ${sections.indexOf(sec) + 1} · ${sec.querySelector("h2")?.textContent ?? ""}`;

    // 장의 첫 화면: 파트 카드 목록. 이어서 볼 파트가 있으면 그 버튼을 보여 줍니다
    const showHub = () => {
      root.classList.add("is-hub");
      current = null;
      for (const s of sections) s.classList.remove("is-current");
      const last = sections.find((s) => s.dataset.part === loadMap(LAST)[slug]);
      if (resume && last) {
        resume.href = `#part-${last.dataset.part}`;
        resume.textContent = `이어서 보기: 파트 ${sections.indexOf(last) + 1}`;
      }
      closeMemo(false);
    };
    const show = (sec) => {
      root.classList.remove("is-hub");
      if (current && current !== sec) saveMemo();
      current = sec;
      for (const s of sections) s.classList.toggle("is-current", s === sec);
      for (const t of tocs) t.classList.toggle("is-current", t.dataset.tocFor === sec.dataset.part);
      saveMap(LAST, { ...loadMap(LAST), [slug]: sec.dataset.part });
      if (memo) {
        memo.setContent(asHtml(loadMap(NOTES)[noteKey(sec)]));
        panel.querySelector("[data-memo-title]").textContent = titleOf(sec);
      }
      spy();
    };
    // 주소의 #가 파트이거나 파트 안의 제목이면 그 파트를 엽니다
    const target = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id && document.getElementById(id);
      if (!el) return null;
      const sec = el.matches("section.part") ? el : el.closest("section.part");
      return sec ? { sec, el } : null;
    };

    // 오른쪽 목차: 지금 읽는 제목만 진하게 (블로그의 목차와 같습니다)
    function spy() {
      const toc = tocs.find((t) => t.classList.contains("is-current"));
      if (!toc || !current) return;
      const heads = [...current.querySelectorAll("h2[id], h3[id]")];
      let on = heads[0];
      for (const h of heads) if (h.getBoundingClientRect().top < 120) on = h;
      for (const a of toc.querySelectorAll("a")) {
        if (on && a.getAttribute("href") === `#${on.id}`) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      }
    }
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          spy();
        });
      },
      { passive: true },
    );

    // 메모: 오른쪽에서 열리는 칸에 노션처럼 쓰는 편집기. 편집기 코드는 처음 열 때 불러옵니다
    let memo = null;
    let loading = null;
    let dirty = false;
    let timer = 0;
    function saveMemo() {
      clearTimeout(timer);
      if (!dirty || !current || !memo) return;
      dirty = false;
      const notes = loadMap(NOTES);
      const html = memo.editor.isEmpty ? "" : memo.editor.getHTML();
      if (html) notes[noteKey(current)] = html;
      else delete notes[noteKey(current)];
      saveMap(NOTES, notes);
      status.textContent = "저장했어요. 이 브라우저에만 남습니다";
      refreshParts();
    }
    async function openMemo() {
      if (!panel || !current) return;
      panel.hidden = false;
      root.classList.add("is-memo-open");
      saveMap(MEMO_OPEN, { open: true });
      panel.querySelector("[data-memo-title]").textContent = titleOf(current);
      if (!memo) {
        loading ??= import(panel.dataset.src)
          .then((mod) => {
            memo = mod.mount(panel.querySelector("[data-memo-editor]"), {
              content: asHtml(loadMap(NOTES)[noteKey(current)]),
              placeholder: "'/'로 블록 고르기 · # 제목 · - 목록 · [] 체크리스트",
              onChange: () => {
                dirty = true;
                status.textContent = "저장하는 중…";
                clearTimeout(timer);
                timer = setTimeout(saveMemo, 500);
              },
            });
          })
          .catch(() => {
            status.textContent = "편집기를 불러오지 못했어요. 새로고침해 보세요";
          });
        await loading;
      }
      memo?.focus();
    }
    function closeMemo(remember = true) {
      if (!panel || panel.hidden) return;
      saveMemo();
      panel.hidden = true;
      root.classList.remove("is-memo-open");
      if (remember) saveMap(MEMO_OPEN, { open: false });
    }
    for (const b of document.querySelectorAll("[data-memo-open]")) b.addEventListener("click", () => (panel?.hidden ? openMemo() : closeMemo()));
    panel?.querySelector("[data-memo-close]")?.addEventListener("click", () => closeMemo());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel && !panel.hidden) closeMemo();
    });
    window.addEventListener("pagehide", saveMemo);

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
        sec.classList.toggle("has-memo", hasMemo);
        const card = cards.find((a) => a.dataset.partCard === sec.dataset.part);
        if (card) {
          card.classList.toggle("is-done", isDone);
          card.classList.toggle("has-memo", hasMemo);
          card.querySelector("[data-card-state]").textContent = isDone ? "학습 완료" : quizzes.length && solved ? `문제 ${solved}/${quizzes.length}` : "";
        }
      }
      if (current) root.classList.toggle("part-has-memo", current.classList.contains("has-memo"));
    };

    const route = () => {
      const t = target();
      if (t) {
        show(t.sec);
        t.el.scrollIntoView?.();
        if (loadMap(MEMO_OPEN).open && window.matchMedia?.("(min-width: 1280px)").matches) openMemo();
      } else {
        showHub();
        if (location.hash === "#parts") hub?.scrollIntoView?.();
      }
      refreshParts();
    };
    route();
    window.addEventListener("hashchange", route);
    window.addEventListener("storage", (e) => {
      if (e.key !== NOTES) return;
      if (memo && current && !dirty) memo.setContent(asHtml(loadMap(NOTES)[noteKey(current)]));
      refreshParts();
    });
  }

  // 내 메모: 장 순서대로 모아 보여 줍니다. 메모 글자는 textContent로만 넣습니다
  // 저장된 메모 HTML에서 편집기가 만드는 태그만 남깁니다
  const ALLOWED = new Set(["P", "BR", "H1", "H2", "H3", "UL", "OL", "LI", "STRONG", "EM", "S", "CODE", "PRE", "BLOCKQUOTE", "HR", "A", "LABEL", "INPUT", "DIV", "SPAN", "U"]);
  function clean(html) {
    const src = new DOMParser().parseFromString(html, "text/html").body;
    const frag = document.createDocumentFragment();
    const walk = (from, to) => {
      for (const node of from.childNodes) {
        if (node.nodeType === 3) to.append(node.textContent);
        else if (node.nodeType === 1 && ALLOWED.has(node.tagName)) {
          const copy = document.createElement(node.tagName.toLowerCase());
          if (node.tagName === "A" && /^https?:/i.test(node.getAttribute("href") ?? "")) {
            copy.href = node.getAttribute("href");
            copy.rel = "noopener";
          }
          if (node.tagName === "INPUT") {
            if (node.getAttribute("type") !== "checkbox") continue;
            copy.type = "checkbox";
            copy.disabled = true;
            copy.checked = node.hasAttribute("checked");
          }
          for (const attr of ["data-type", "data-checked"]) if (node.hasAttribute(attr)) copy.setAttribute(attr, node.getAttribute(attr));
          walk(node, copy);
          to.append(copy);
        } else if (node.nodeType === 1) walk(node, to);
      }
    };
    walk(src, frag);
    return frag;
  }

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
        const body = el("div", "note-text prose");
        body.append(clean(asHtml(notes[`${ch.slug}:${p.id}`])));
        item.append(link, body);
        box.append(item);
        count++;
      }
      frag.append(box);
    }
    if (count) notesBox.replaceChildren(frag);
  }

  // 글꼴 고르기 (블로그와 같은 목록)
  const fontPick = document.querySelector("[data-font-pick]");
  if (fontPick instanceof HTMLSelectElement) {
    fontPick.value = document.documentElement.dataset.font || "pretendard";
    fontPick.addEventListener("change", () => {
      window.__applyFont?.(fontPick.value);
      try {
        localStorage.setItem("mlnl-cs:font", fontPick.value);
      } catch {
        // 저장이 막혀 있으면 이번 페이지에만 적용됩니다
      }
    });
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
