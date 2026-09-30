import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../core/api-config';
import { ProcessingInsights } from '../models';

/** File-processing numbers for one organization, read by the backend from the organization's own schema. */
@Injectable({ providedIn: 'root' })
export class ProcessingInsightsService {
  private http = inject(HttpClient);

  /** from/to are yyyy-MM months (inclusive). Leave both out for the latest month with activity. */
  get(orgId: string, from?: string, to?: string): Promise<ProcessingInsights> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return firstValueFrom(
      this.http.get<ProcessingInsights>(`${API_BASE_URL}/platform/organizations/${orgId}/processing-insights`, { params })
    );
  }
}
