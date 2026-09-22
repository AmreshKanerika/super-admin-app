import { Pipe, PipeTransform } from '@angular/core';
import { PlanWithNames, planDisplayNameOrFallback } from './plan-name.util';

@Pipe({ name: 'planDisplayName', standalone: true })
export class PlanDisplayNamePipe implements PipeTransform {
  transform(plan: PlanWithNames | null | undefined, fallback = ''): string {
    return planDisplayNameOrFallback(plan, fallback);
  }
}
