import { Pipe, PipeTransform } from '@angular/core';
import { AppWithNames, displayNameOrFallback } from './app-name.util';

@Pipe({ name: 'appDisplayName', standalone: true })
export class AppDisplayNamePipe implements PipeTransform {
  transform(app: AppWithNames | string | null | undefined, fallback = ''): string {
    return displayNameOrFallback(typeof app === 'string' ? { appName: app } : app, fallback);
  }
}
