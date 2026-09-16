import { Pipe, PipeTransform } from '@angular/core';
import { formatAppName } from './app-name.util';

@Pipe({ name: 'appName', standalone: true })
export class AppNamePipe implements PipeTransform {
  transform(rawName: string | null | undefined): string {
    return formatAppName(rawName);
  }
}
