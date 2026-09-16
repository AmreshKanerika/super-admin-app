import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GlobalLoadingIndicatorComponent } from './core/ui/global-loading-indicator.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, GlobalLoadingIndicatorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'super-admin';
}
