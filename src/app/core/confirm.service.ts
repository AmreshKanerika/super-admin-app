import { Injectable, signal } from '@angular/core';

export interface DiffLine {
  label: string;
  from: string;
  to: string;
}

export interface ConfirmExtraInput {
  type: 'date' | 'number' | 'text';
  label?: string;
  value?: any;
  min?: any;
  max?: any;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  diffLines?: DiffLine[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireTypedText?: string;
  reasonRequired?: boolean;
  // Optional extra input (e.g. a date picker) that the modal will render and pass to onConfirm
  extraInput?: ConfirmExtraInput;
  // When provided, ConfirmHostComponent runs this itself on confirm and keeps the dialog open with
  // a loading state until it settles. The function receives the reason and optional extra input value.
  onConfirm?: (reason: string, extra?: any) => Promise<void>;
}

export interface ConfirmResult {
  confirmed: boolean;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly active = signal<ConfirmRequest | null>(null);
  private resolver: ((result: ConfirmResult) => void) | null = null;

  open(request: ConfirmRequest): Promise<ConfirmResult> {
    this.active.set(request);
    return new Promise<ConfirmResult>((resolve) => {
      this.resolver = resolve;
    });
  }

  resolve(result: ConfirmResult): void {
    this.active.set(null);
    this.resolver?.(result);
    this.resolver = null;
  }
}
