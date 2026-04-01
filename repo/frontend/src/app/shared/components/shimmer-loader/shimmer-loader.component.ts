import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-shimmer-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="shimmer-container">
      @for (line of lineArray; track line) {
        <div class="shimmer shimmer-line" [style.width]="getWidth(line)"></div>
      }
    </div>
  `,
  styles: [`
    .shimmer-container { display: flex; flex-direction: column; gap: var(--spacing-sm); }
    .shimmer-line { height: 16px; }
  `]
})
export class ShimmerLoaderComponent {
  @Input() lines = 3;

  get lineArray(): number[] {
    return Array.from({ length: this.lines }, (_, i) => i);
  }

  getWidth(index: number): string {
    const widths = ['100%', '80%', '60%', '90%', '70%'];
    return widths[index % widths.length];
  }
}
