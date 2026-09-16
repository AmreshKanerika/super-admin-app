import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ConsoleUser, ConsoleUserRole } from '../models';
import { API_BASE_URL } from '../core/api-config';

export interface CreateConsoleUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: ConsoleUserRole;
}

@Injectable({ providedIn: 'root' })
export class ConsoleUsersService {
  private http = inject(HttpClient);

  private readonly users = signal<ConsoleUser[]>([]);
  private loaded = false;

  list() {
    if (!this.loaded) {
      this.loaded = true;
      this.refresh();
    }
    return this.users;
  }

  async refresh(): Promise<void> {
    try {
      this.users.set(await firstValueFrom(this.http.get<ConsoleUser[]>(`${API_BASE_URL}/platform/console-users`)));
    } catch (err) {
      console.error('Failed to load console users', err);
    }
  }

  async create(request: CreateConsoleUserRequest): Promise<ConsoleUser> {
    const created = await firstValueFrom(this.http.post<ConsoleUser>(`${API_BASE_URL}/platform/console-users`, request));
    // The temporary password is for the caller to show once, right now — it doesn't belong sitting
    // in this shared list signal a moment longer than that.
    this.users.update((list) => [...list, { ...created, temporaryPassword: undefined }]);
    return created;
  }
}
