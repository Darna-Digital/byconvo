/**
 * In-app prompt/confirm dialogs.
 *
 * The desktop build runs inside Electron's renderer, where `window.prompt` and
 * `window.confirm` are not implemented — calling them silently does nothing, so
 * any action gated behind them (new branch, rename, delete…) appears dead. This
 * hook provides promise-based replacements that render a real modal and work in
 * both the browser and the Electron shell.
 *
 * Usage:
 *   const dialogs = useDialogs();
 *   // mount once near the app root:
 *   {dialogs.element}
 *   // then await it anywhere:
 *   const name = await dialogs.prompt("New branch name:");
 */
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";

type DialogRequest =
  | {
      kind: "prompt";
      message: string;
      value: string;
      confirmLabel: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      message: string;
      confirmLabel: string;
      danger: boolean;
      resolve: (value: boolean) => void;
    };

export interface PromptOptions {
  defaultValue?: string;
  confirmLabel?: string;
}

export interface ConfirmOptions {
  confirmLabel?: string;
  danger?: boolean;
}

export interface Dialogs {
  /** Mount this once near the app root so the modal can render. */
  element: ReactElement | null;
  /** Promise-based `window.prompt`. Resolves to the entered text, or null if cancelled. */
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>;
  /** Promise-based `window.confirm`. Resolves to true if confirmed. */
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

export function useDialogs(): Dialogs {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const prompt = useCallback(
    (message: string, options?: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setRequest({
          kind: "prompt",
          message,
          value: options?.defaultValue ?? "",
          confirmLabel: options?.confirmLabel ?? "OK",
          resolve,
        });
      }),
    [],
  );

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({
          kind: "confirm",
          message,
          confirmLabel: options?.confirmLabel ?? "OK",
          danger: options?.danger ?? false,
          resolve,
        });
      }),
    [],
  );

  // Focus the primary control on open, selecting prompt text for quick replace.
  useEffect(() => {
    if (request === null) return;
    if (request.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }
  }, [request]);

  const cancel = useCallback(() => {
    setRequest((current) => {
      if (current === null) return null;
      if (current.kind === "prompt") current.resolve(null);
      else current.resolve(false);
      return null;
    });
  }, []);

  const accept = useCallback(() => {
    setRequest((current) => {
      if (current === null) return null;
      if (current.kind === "prompt") current.resolve(current.value);
      else current.resolve(true);
      return null;
    });
  }, []);

  const element =
    request === null ? null : (
      <div
        className="dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) cancel();
        }}
      >
        <div
          className="dialog"
          role="dialog"
          aria-modal="true"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            } else if (event.key === "Enter" && request.kind === "confirm") {
              event.preventDefault();
              accept();
            }
          }}
        >
          <div className="dialog-message">{request.message}</div>
          {request.kind === "prompt" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                accept();
              }}
            >
              <input
                ref={inputRef}
                className="dialog-input"
                type="text"
                value={request.value}
                onChange={(event) =>
                  setRequest((current) =>
                    current !== null && current.kind === "prompt"
                      ? { ...current, value: event.target.value }
                      : current,
                  )
                }
              />
            </form>
          )}
          <div className="dialog-actions">
            <button type="button" className="dialog-button" onClick={cancel}>
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={`dialog-button dialog-button-primary${
                request.kind === "confirm" && request.danger ? " dialog-button-danger" : ""
              }`}
              onClick={accept}
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );

  return { element, prompt, confirm };
}
