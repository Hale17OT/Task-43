import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-policy-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="policy-banner" [class.info-banner]="type === 'info'">
      {{ message }}
    </div>
  `,
  styles: [`
    .policy-banner { margin-bottom: var(--spacing-sm); }
    .info-banner {
      background: var(--color-primary-light);
      border-color: var(--color-primary);
      color: #1e40af;
    }
  `]
})
export class PolicyBannerComponent {
  @Input() message = '';
  @Input() type: 'warning' | 'info' = 'warning';
}
