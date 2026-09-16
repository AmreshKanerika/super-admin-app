import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NgIf],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  username = '';
  password = '';
  showPassword = signal(false);
  motionPaused = signal(false);
  submitting = signal(false);
  error = signal(
    this.route.snapshot.queryParamMap.get('denied') ? "Your account isn't set up for this console yet. Ask a super admin to add you." : ''
  );
  year = new Date().getFullYear();

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  async submit(): Promise<void> {
    if (!this.username.trim() || !this.password) {
      this.error.set('Enter your username and password.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');

    const result = await this.auth.login(this.username.trim(), this.password);

    this.submitting.set(false);
    if (result.success) {
      this.router.navigateByUrl('/overview');
    } else {
      this.error.set(result.error ?? 'Sign-in failed. Please try again.');
    }
  }
}
