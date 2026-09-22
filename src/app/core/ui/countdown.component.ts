import { Component, Input } from '@angular/core';
import { countdownLabel, countdownTone, daysUntil } from '../status.util';

@Component({
  selector: 'app-countdown',
  standalone: true,
  template: `<span class="cd mono" [class]="tone()">{{ label() }}</span>`,
  styles: [
    `
      .cd {
        font-weight: 600;
        font-size: 12.5px;
      }
      .success {
        color: #176b4d;
      }
      .warning {
        color: #825c0a;
      }
      .critical {
        color: #a63340;
      }
    `
  ]
})
export class CountdownComponent {
  @Input({ required: true }) date!: string;

  days(): number {
    return daysUntil(this.date);
  }

  tone() {
    return countdownTone(this.days());
  }

  label(): string {
    return countdownLabel(this.days());
  }
}
