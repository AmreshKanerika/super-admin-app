import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from './loading.service';

// Drives the single global loading indicator — every HTTP call (any API, any component) counts
// against it, so there is one consistent "the app is doing something" signal instead of each page
// inventing its own local "Refreshing…" spinner.
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  loading.start();
  return next(req).pipe(finalize(() => loading.stop()));
};
