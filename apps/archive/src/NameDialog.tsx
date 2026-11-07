import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initial?: string;
  confirmLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}

/** 폴더 이름을 받는 작은 창. 저장에 실패하면 창을 닫지 않고 이유를 보여 줍니다 */
export function NameDialog({ title, initial = "", confirmLabel, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다");
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="name-dialog" onClose={onClose} onCancel={onClose} aria-label={title}>
      <form onSubmit={submit}>
        <h2>{title}</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="예: 2026 제주" autoFocus aria-label="폴더 이름" />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onClose}>
            취소
          </button>
          <button className="primary" disabled={busy || !name.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
