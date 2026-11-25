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

  function render() {
    const keys = Object.keys(done);
    for (const el of document.querySelectorAll("[data-progress]")) {
      const scope = el.dataset.progress;
      const total = Number(el.dataset.total) || 0;
      const count = scope === "*" ? keys.length : keys.filter((k) => k.startsWith(`${scope}:`)).length;
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
  });

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
