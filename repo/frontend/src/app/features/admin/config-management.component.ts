import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfigService } from '../../core/services/config.service';
import { ShimmerLoaderComponent } from '../../shared/components/shimmer-loader/shimmer-loader.component';

interface DictionaryEntry {
  id: string;
  org_id: string | null;
  category: string;
  key: string;
  value: Record<string, unknown>;
  created_at: string;
}

interface WorkflowStep {
  id: string;
  org_id: string | null;
  workflow_type: string;
  step_order: number;
  name: string;
  config: Record<string, unknown>;
}

@Component({
  selector: 'app-config-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ShimmerLoaderComponent],
  template: `
    <div class="page">
      <h2>Configuration</h2>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn" [class.active]="activeTab === 'dictionaries'" (click)="activeTab = 'dictionaries'">
          Dictionaries
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'workflows'" (click)="activeTab = 'workflows'">
          Workflow Steps
        </button>
      </div>

      <!-- Dictionaries Tab -->
      @if (activeTab === 'dictionaries') {
        <div class="section">
          <div class="section-header">
            <h3>Config Dictionaries</h3>
            <button class="btn btn-primary" (click)="showDictForm = !showDictForm">
              {{ showDictForm ? 'Cancel' : 'Add Entry' }}
            </button>
          </div>

          @if (showDictForm) {
            <div class="card form-card">
              <form [formGroup]="dictForm" (ngSubmit)="createDictEntry()" class="inline-form">
                <div class="form-group">
                  <label>Category</label>
                  <input class="input" formControlName="category" placeholder="e.g. credit_rules" />
                </div>
                <div class="form-group">
                  <label>Key</label>
                  <input class="input" formControlName="key" placeholder="e.g. LATE_DELIVERY" />
                </div>
                <div class="form-group">
                  <label>Value (JSON)</label>
                  <textarea class="input" formControlName="valueJson" rows="3" placeholder='{"changeAmount": -5}'></textarea>
                </div>
                @if (dictError) {
                  <div class="error-text">{{ dictError }}</div>
                }
                <button class="btn btn-primary" type="submit" [disabled]="dictForm.invalid || dictSaving">
                  {{ dictSaving ? 'Saving...' : 'Save' }}
                </button>
              </form>
            </div>
          }

          @if (dictLoadError) {
            <div class="error-banner">{{ dictLoadError }} <button class="retry-btn" (click)="loadDictionaries()">Retry</button></div>
          }
          @if (loadingDicts) {
            <app-shimmer-loader [lines]="4" />
          } @else {
            <div class="card table-card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Scope</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (entry of dictEntries; track entry.id) {
                    <tr>
                      <td>{{ entry.category }}</td>
                      <td><code>{{ entry.key }}</code></td>
                      <td class="value-cell">{{ entry.value | json }}</td>
                      <td>
                        <span class="badge" [ngClass]="entry.org_id ? 'badge-info' : 'badge-neutral'">
                          {{ entry.org_id ? 'Org' : 'Global' }}
                        </span>
                      </td>
                      <td>
                        <button class="btn btn-danger btn-sm" (click)="deleteDictEntry(entry.id)">Delete</button>
                      </td>
                    </tr>
                  }
                  @if (dictEntries.length === 0) {
                    <tr><td colspan="5" class="empty-text">No dictionary entries.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- Workflow Steps Tab -->
      @if (activeTab === 'workflows') {
        <div class="section">
          <div class="section-header">
            <h3>Workflow Steps</h3>
            <button class="btn btn-primary" (click)="showStepForm = !showStepForm">
              {{ showStepForm ? 'Cancel' : 'Add Step' }}
            </button>
          </div>

          @if (showStepForm) {
            <div class="card form-card">
              <form [formGroup]="stepForm" (ngSubmit)="createStep()" class="inline-form">
                <div class="form-group">
                  <label>Workflow Type</label>
                  <input class="input" formControlName="workflowType" placeholder="e.g. booking_approval" />
                </div>
                <div class="form-group">
                  <label>Step Order</label>
                  <input class="input" type="number" formControlName="stepOrder" min="0" />
                </div>
                <div class="form-group">
                  <label>Name</label>
                  <input class="input" formControlName="name" placeholder="e.g. Manager Review" />
                </div>
                <div class="form-group">
                  <label>Config (JSON, optional)</label>
                  <textarea class="input" formControlName="configJson" rows="2" placeholder='{"timeout": 3600}'></textarea>
                </div>
                @if (stepError) {
                  <div class="error-text">{{ stepError }}</div>
                }
                <button class="btn btn-primary" type="submit" [disabled]="stepForm.invalid || stepSaving">
                  {{ stepSaving ? 'Saving...' : 'Save' }}
                </button>
              </form>
            </div>
          }

          @if (stepLoadError) {
            <div class="error-banner">{{ stepLoadError }} <button class="retry-btn" (click)="loadWorkflowSteps()">Retry</button></div>
          }
          @if (loadingSteps) {
            <app-shimmer-loader [lines]="4" />
          } @else {
            <div class="card table-card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Order</th>
                    <th>Name</th>
                    <th>Config</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (step of workflowSteps; track step.id) {
                    <tr>
                      <td>{{ step.workflow_type }}</td>
                      <td>{{ step.step_order }}</td>
                      <td>{{ step.name }}</td>
                      <td class="value-cell">{{ step.config | json }}</td>
                      <td>
                        <button class="btn btn-danger btn-sm" (click)="deleteStep(step.id)">Delete</button>
                      </td>
                    </tr>
                  }
                  @if (workflowSteps.length === 0) {
                    <tr><td colspan="5" class="empty-text">No workflow steps.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tabs { display: flex; gap: 0; margin-bottom: var(--spacing-lg); }
    .tab-btn {
      padding: var(--spacing-sm) var(--spacing-md); border: 1px solid var(--color-border);
      background: var(--color-surface); cursor: pointer; font-size: 0.875rem; font-weight: 500;
      &:first-child { border-radius: var(--radius-md) 0 0 var(--radius-md); }
      &:last-child { border-radius: 0 var(--radius-md) var(--radius-md) 0; border-left: none; }
      &.active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
    }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-md); }
    .section-header h3 { margin: 0; }
    .form-card { margin-bottom: var(--spacing-md); max-width: 500px; }
    .inline-form { display: flex; flex-direction: column; gap: var(--spacing-sm); }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 4px; }
    .table-card { padding: 0; overflow-x: auto; }
    .value-cell { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; font-family: monospace; }
    .empty-text { text-align: center; color: var(--color-text-muted); padding: var(--spacing-lg); }
    .error-text { color: var(--color-danger); font-size: 0.85rem; }
    .btn-sm { padding: 4px 8px; font-size: 0.75rem; }
  `]
})
export class ConfigManagementComponent implements OnInit {
  activeTab: 'dictionaries' | 'workflows' = 'dictionaries';

  // Dictionaries
  dictEntries: DictionaryEntry[] = [];
  loadingDicts = true;
  showDictForm = false;
  dictForm: FormGroup;
  dictSaving = false;
  dictError = '';
  dictLoadError = '';

  // Workflow Steps
  workflowSteps: WorkflowStep[] = [];
  loadingSteps = true;
  showStepForm = false;
  stepForm: FormGroup;
  stepSaving = false;
  stepError = '';
  stepLoadError = '';

  constructor(private configService: ConfigService, private fb: FormBuilder) {
    this.dictForm = this.fb.group({
      category: ['', Validators.required],
      key: ['', Validators.required],
      valueJson: ['{}', Validators.required],
    });
    this.stepForm = this.fb.group({
      workflowType: ['', Validators.required],
      stepOrder: [0, [Validators.required, Validators.min(0)]],
      name: ['', Validators.required],
      configJson: ['{}'],
    });
  }

  ngOnInit() {
    this.loadDictionaries();
    this.loadWorkflowSteps();
  }

  // ---- Dictionaries ----
  loadDictionaries() {
    this.loadingDicts = true;
    this.configService.listDictionaries().subscribe({
      next: (res) => { this.dictEntries = res.data; this.loadingDicts = false; },
      error: () => { this.loadingDicts = false; this.dictLoadError = 'Failed to load dictionaries.'; },
    });
  }

  createDictEntry() {
    this.dictSaving = true;
    this.dictError = '';
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(this.dictForm.value.valueJson);
    } catch {
      this.dictError = 'Invalid JSON in value field';
      this.dictSaving = false;
      return;
    }

    this.configService.createDictionary({
      category: this.dictForm.value.category,
      key: this.dictForm.value.key,
      value,
    }).subscribe({
      next: () => {
        this.dictSaving = false;
        this.showDictForm = false;
        this.dictForm.reset({ category: '', key: '', valueJson: '{}' });
        this.loadDictionaries();
      },
      error: (err) => {
        this.dictSaving = false;
        this.dictError = err.error?.message ?? 'Failed to create entry';
      },
    });
  }

  deleteDictEntry(id: string) {
    if (!confirm('Delete this dictionary entry?')) return;
    this.configService.deleteDictionary(id).subscribe({
      next: () => this.loadDictionaries(),
    });
  }

  // ---- Workflow Steps ----
  loadWorkflowSteps() {
    this.loadingSteps = true;
    this.configService.listWorkflowSteps().subscribe({
      next: (res) => { this.workflowSteps = res.data; this.loadingSteps = false; },
      error: () => { this.loadingSteps = false; this.stepLoadError = 'Failed to load workflow steps.'; },
    });
  }

  createStep() {
    this.stepSaving = true;
    this.stepError = '';
    let config: Record<string, unknown> = {};
    try {
      if (this.stepForm.value.configJson) {
        config = JSON.parse(this.stepForm.value.configJson);
      }
    } catch {
      this.stepError = 'Invalid JSON in config field';
      this.stepSaving = false;
      return;
    }

    this.configService.createWorkflowStep({
      workflowType: this.stepForm.value.workflowType,
      stepOrder: this.stepForm.value.stepOrder,
      name: this.stepForm.value.name,
      config,
    }).subscribe({
      next: () => {
        this.stepSaving = false;
        this.showStepForm = false;
        this.stepForm.reset({ workflowType: '', stepOrder: 0, name: '', configJson: '{}' });
        this.loadWorkflowSteps();
      },
      error: (err) => {
        this.stepSaving = false;
        this.stepError = err.error?.message ?? 'Failed to create step';
      },
    });
  }

  deleteStep(id: string) {
    if (!confirm('Delete this workflow step?')) return;
    this.configService.deleteWorkflowStep(id).subscribe({
      next: () => this.loadWorkflowSteps(),
    });
  }
}
