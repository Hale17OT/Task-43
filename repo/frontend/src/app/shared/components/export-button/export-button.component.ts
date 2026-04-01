import { Component, Input } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-export-button',
  standalone: true,
  template: `
    <button class="btn btn-secondary" (click)="download()" [disabled]="downloading">
      {{ downloading ? 'Downloading...' : label }}
    </button>
    @if (toastVisible) {
      <span class="export-toast success">File saved to disk</span>
    }
    @if (errorVisible) {
      <span class="export-toast error">Export failed. <button class="retry-link" (click)="download()">Retry</button></span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: var(--spacing-sm); }
    .export-toast {
      font-size: 0.75rem;
      animation: fadeIn 0.2s ease;
    }
    .export-toast.success { color: var(--color-success); }
    .export-toast.error { color: var(--color-danger, #dc3545); }
    .retry-link { background: none; border: none; color: var(--color-primary); cursor: pointer; text-decoration: underline; font-size: 0.75rem; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  `]
})
export class ExportButtonComponent {
  @Input() url = '';
  @Input() label = 'Export';
  downloading = false;
  toastVisible = false;
  errorVisible = false;

  constructor(private http: HttpClient) {}

  private getExtensionFromUrl(): string {
    try {
      const params = new URLSearchParams(this.url.split('?')[1] || '');
      const format = params.get('format');
      if (format === 'xlsx') return 'xlsx';
      return 'csv';
    } catch {
      return 'csv';
    }
  }

  download() {
    if (!this.url || this.downloading) return;
    this.downloading = true;
    this.errorVisible = false;
    this.toastVisible = false;
    this.http.get(this.url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const ext = this.getExtensionFromUrl();
        a.download = `report_${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.downloading = false;
        this.toastVisible = true;
        setTimeout(() => (this.toastVisible = false), 3000);
      },
      error: () => {
        this.downloading = false;
        this.errorVisible = true;
        setTimeout(() => (this.errorVisible = false), 6000);
      },
    });
  }
}
