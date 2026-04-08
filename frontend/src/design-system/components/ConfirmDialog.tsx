import { type MouseEvent, type ReactNode } from "react";

import { Button } from "./Button";
import { Card } from "./Card";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  isLoading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="confirm-dialog__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
        onClick={(event: MouseEvent<HTMLDivElement>) => {
          event.stopPropagation();
        }}
      >
        <Card className="confirm-dialog__sheet">
          <h2 id="confirm-dialog-title" className="confirm-dialog__title">
            {title}
          </h2>
          <p className="confirm-dialog__message">{message}</p>
          {children}
          <div className="confirm-dialog__actions">
            <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
              {cancelLabel}
            </Button>
            <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={isLoading}>
              {isLoading ? "Please wait..." : confirmLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
