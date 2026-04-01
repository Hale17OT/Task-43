import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  constructor(private http: HttpClient) {}

  listDictionaries(category?: string): Observable<{ data: any[] }> {
    const url = category ? `/api/config/dictionaries?category=${category}` : '/api/config/dictionaries';
    return this.http.get<{ data: any[] }>(url);
  }

  createDictionary(entry: { category: string; key: string; value: Record<string, unknown> }): Observable<{ entry: any }> {
    return this.http.post<{ entry: any }>('/api/config/dictionaries', entry);
  }

  deleteDictionary(id: string): Observable<void> {
    return this.http.delete<void>(`/api/config/dictionaries/${id}`);
  }

  listWorkflowSteps(workflowType?: string): Observable<{ data: any[] }> {
    const url = workflowType ? `/api/config/workflow-steps?workflowType=${workflowType}` : '/api/config/workflow-steps';
    return this.http.get<{ data: any[] }>(url);
  }

  createWorkflowStep(step: { workflowType: string; stepOrder: number; name: string; config?: Record<string, unknown> }): Observable<{ step: any }> {
    return this.http.post<{ step: any }>('/api/config/workflow-steps', step);
  }

  deleteWorkflowStep(id: string): Observable<void> {
    return this.http.delete<void>(`/api/config/workflow-steps/${id}`);
  }
}
