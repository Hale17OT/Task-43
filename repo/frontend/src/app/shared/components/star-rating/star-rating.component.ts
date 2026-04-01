import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="star-rating">
      @for (star of stars; track star) {
        <span
          class="star"
          [class.filled]="star <= value"
          [class.readonly]="readonly"
          (click)="!readonly && rate(star)"
          (keydown.enter)="!readonly && rate(star)"
          [attr.tabindex]="readonly ? -1 : 0"
          [attr.aria-label]="'Rate ' + star + ' of 5'"
        >&#9733;</span>
      }
    </span>
  `,
  styles: [`
    .star-rating { display: inline-flex; gap: 2px; }
    .star {
      font-size: 1.25rem;
      color: var(--color-border);
      cursor: pointer;
      transition: color 0.15s ease;
      &.filled { color: #f59e0b; }
      &.readonly { cursor: default; }
      &:not(.readonly):hover { color: #fbbf24; }
      &:focus-visible { outline: 2px solid var(--color-primary); border-radius: 2px; }
    }
  `]
})
export class StarRatingComponent {
  @Input() value = 0;
  @Input() readonly = false;
  @Output() valueChange = new EventEmitter<number>();

  stars = [1, 2, 3, 4, 5];

  rate(star: number) {
    this.value = star;
    this.valueChange.emit(star);
  }
}
