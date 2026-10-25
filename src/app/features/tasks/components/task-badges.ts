import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from '../task.model';

const STATUS_ICONS: Record<TaskStatus, string> = {
  not_started: 'radio_button_unchecked',
  in_progress: 'pending',
  blocked: 'block',
  done: 'check_circle',
  cancelled: 'cancel',
};

@Component({
  selector: 'app-status-badge',
  imports: [MatIconModule],
  template: `<span class="badge" [attr.data-status]="status()"
    ><mat-icon aria-hidden="true">{{ icons[status()] }}</mat-icon
    >{{ labels[status()] }}</span
  >`,
  styleUrl: './task-badges.scss',
})
export class StatusBadge {
  readonly status = input.required<TaskStatus>();
  protected readonly labels = STATUS_LABELS;
  protected readonly icons = STATUS_ICONS;
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
  imports: [MatProgressBarModule],
  template: `
    <mat-progress-bar
      mode="determinate"
      [value]="value()"
      [attr.aria-label]="'Progresso ' + value() + '%'"
    />
    <span class="progress__value">{{ value() }}%</span>
  `,
  styleUrl: './task-badges.scss',
  host: { class: 'progress-host' },
})
export class ProgressBar {
  readonly value = input.required<number>();
}
