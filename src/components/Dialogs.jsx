import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// A tiny promise-based dialog system: `await dialogs.confirm(...)` etc.
export function useDialogState() {
  const [current, setCurrent] = useState(null);

  const open = useCallback(
    (render) =>
      new Promise((resolve) => {
        setCurrent({
          render,
          close: (value) => {
            setCurrent(null);
            resolve(value);
          },
        });
      }),
    [],
  );

  return useMemo(
    () => ({
      isOpen: current !== null,
      current,
      open,
      confirm: ({ title, message, confirmLabel = 'OK', danger = false }) =>
        open((close) => (
          <ChoiceDialog
            title={title}
            message={message}
            choices={[{ value: true, label: confirmLabel, primary: true, danger }]}
            close={(v) => close(v === true)}
          />
        )),
      choose: ({ title, message, choices }) =>
        open((close) => <ChoiceDialog title={title} message={message} choices={choices} close={close} />),
    }),
    [current, open],
  );
}

export function DialogHost({ dialogs }) {
  const { current } = dialogs;
  if (!current) return null;
  return current.render(current.close);
}

export function Modal({ title, onClose, children, footer, className = '', onSubmit }) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Runs once per dialog: re-running on every render would steal focus while typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Focus the first field (or the primary button) when the dialog opens.
    const el =
      ref.current?.querySelector('[data-autofocus]') ?? ref.current?.querySelector('input, select, textarea, button.primary');
    el?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const Body = onSubmit ? 'form' : 'div';
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Body
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onSubmit={
          onSubmit &&
          ((e) => {
            e.preventDefault();
            onSubmit();
          })
        }
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </Body>
    </div>
  );
}

function ChoiceDialog({ title, message, choices, close }) {
  return (
    <Modal
      title={title}
      onClose={() => close(null)}
      className="modal-small"
      footer={
        <>
          <button type="button" onClick={() => close(null)}>
            Cancel
          </button>
          {choices.map((c) => (
            <button
              key={String(c.value)}
              type="button"
              className={`${c.primary ? 'primary' : ''} ${c.danger ? 'danger' : ''}`}
              onClick={() => close(c.value)}
            >
              {c.label}
            </button>
          ))}
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
