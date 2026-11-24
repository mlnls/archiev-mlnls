// 체크한 개념과 실습을 이 브라우저(localStorage)에 남기고 진행 막대를 그립니다.
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
})();
