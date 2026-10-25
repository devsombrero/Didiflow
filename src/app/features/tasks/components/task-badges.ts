import { Component, input } from '@angular/core';
import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from '../task.model';

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [attr.data-status]="status()">{{ labels[status()] }}</span>`,
  styleUrl: './task-badges.scss',
})
export class StatusBadge {
  readonly status = input.required<TaskStatus>();
  protected readonly labels = STATUS_LABELS;
}

@Component({
  selector: 'app-priority-badge',
  template: `<span class="priority" [attr.data-priority]="priority()">
    <span class="priority__dot" aria-hidden="true"></span>{{ labels[priority()] }}
  </span>`,
  styleUrl: './task-badges.scss',
})
export class PriorityBadge {
  readonly priority = input.required<TaskPriority>();
  protected readonly labels = PRIORITY_LABELS;
}

@Component({
  selector: 'app-progress-bar',
  template: `
    <div
      class="progress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="value()"
      [attr.aria-label]="'Progresso ' + value() + '%'"
    >
      <div class="progress__fill" [style.width.%]="value()"></div>
    </div>
    <span class="progress__value">{{ value() }}%</span>
  `,
  styleUrl: './task-badges.scss',
  host: { class: 'progress-host' },
})
export class ProgressBar {
  readonly value = input.required<number>();
}
