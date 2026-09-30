import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModalShellComponent } from '../../core/ui/modal-shell.component';
import { ApplicationsService } from '../../services/applications.service';
import { ToastService } from '../../core/toast.service';
import { Application, JsonValue, MigrationTypeConfig, MigrationTypeSaveResponse } from '../../models';
import { displayNameOrFallback } from '../../core/app-name.util';
import { parseInsertStatement, SqlValue } from './migration-insert-parser';

type JsonFieldKey =
  | 'migrationFormAttributes'
  | 'migrationAdditionalFormAttributes'
  | 'migrationSourceForm'
  | 'migrationTargetForm'
  | 'targetMigrationDetails'
  | 'migrationAttributes'
  | 'migrationEncryptionConfig'
  | 'preMigrationInfo';

interface JsonFieldSpec {
  key: JsonFieldKey;
  column: string;
  label: string;
  hint: string;
  placeholder: string;
  /** Holds credentials in the existing rows, so the form says so. */
  sensitive?: boolean;
}

const JSON_FIELDS: JsonFieldSpec[] = [
  {
    key: 'migrationFormAttributes',
    column: 'migration_form_attributes',
    label: 'Migration screen settings',
    hint: 'Which steps the migration screen shows and which files it accepts.',
    placeholder: '{"schedule": "optional", "sourceFile": "optional", "targetConnection": "enable", "supportedFileTypes": [".zip"], "maxSupportedFileSize": "50"}'
  },
  {
    key: 'migrationAdditionalFormAttributes',
    column: 'migration_additional_form_attributes',
    label: 'Additional questions form',
    hint: 'Extra questions asked before the migration runs.',
    placeholder: '{"form": [{"id": "migrationTypes", "name": "Migration Types", "type": "multiselect", "options": ["…"], "position": 1}]}'
  },
  {
    key: 'migrationSourceForm',
    column: 'migration_source_form',
    label: 'Source form',
    hint: 'Fields asked for the source.',
    placeholder: '{"form": [{"id": "folderPath", "name": "Folder", "type": "text", "position": 1, "validators": {"required": true}}]}'
  },
  {
    key: 'migrationTargetForm',
    column: 'migration_target_form',
    label: 'Target form',
    hint: 'Fields asked for the target.',
    placeholder: '{"form": [{"id": "fileType", "name": "File Type", "type": "select", "options": ["ZIP"], "position": 1}]}'
  },
  {
    key: 'targetMigrationDetails',
    column: 'target_migration_details',
    label: 'Target migration details',
    hint: 'Defaults for the target. Use {} when there are none.',
    placeholder: '{}'
  },
  {
    key: 'migrationAttributes',
    column: 'migration_attributes',
    label: 'Storage settings',
    hint: 'Blob storage the migration reads and writes.',
    placeholder: '{"blobPath": "core.windows.net", "blobAccountName": "…", "blobAccountKey": "…", "blobContainerName": "…"}',
    sensitive: true
  },
  {
    key: 'migrationEncryptionConfig',
    column: 'migration_encryption_config',
    label: 'Encryption settings',
    hint: 'Which submitted fields are encrypted, and where the key comes from.',
    placeholder: '{"keysToEncrypt": ["clientSecret"], "encryptionAPIURL": "https://…/api/getEncryptionKey"}'
  },
  {
    key: 'preMigrationInfo',
    column: 'pre_migration_info',
    label: 'Pre-migration settings',
    hint: 'Pre-migration mode and the endpoints it calls.',
    placeholder: '{"premigrationMode": "file", "preMigrationAPIURL": "https://…"}'
  }
];

const PROCESSING_TYPES = ['AZURE_FUNCTIONS', 'API'];
const MAX_IMAGE_BYTES = 1_400_000;
const URL_PATTERN = /^https?:\/\/\S+$/i;

@Component({
  selector: 'app-migration-type-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalShellComponent],
  templateUrl: './migration-type-form.component.html',
  styleUrl: './migration-type-form.component.scss'
})
export class MigrationTypeFormComponent implements OnInit {
  @Input({ required: true }) app!: Application;
  /** Shown as "Step 1 of 2" when this is part of creating the application. */
  @Input() stepLabel: string | null = null;
  @Output() saved = new EventEmitter<MigrationTypeSaveResponse>();
  @Output() closed = new EventEmitter<void>();

  private applications = inject(ApplicationsService);
  private toast = inject(ToastService);

  readonly jsonFields = JSON_FIELDS;
  readonly processingTypes = PROCESSING_TYPES;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly existingId = signal<number | null>(null);
  readonly lastModified = signal<string | null>(null);

  readonly name = signal('');
  readonly description = signal('');
  readonly processingType = signal('AZURE_FUNCTIONS');
  readonly inventorySupported = signal(false);
  readonly migrationTypeUrl = signal('');
  readonly healthCheckApiUrl = signal('');
  readonly encryptionApiUrl = signal('');
  readonly migrationBlobFolder = signal('');
  readonly sourceFileImage = signal<string | null>(null);
  readonly targetFileImage = signal<string | null>(null);

  /** Raw editor text per JSON field; parsed on save and validated as typed. */
  readonly jsonText = signal<Record<JsonFieldKey, string>>(emptyJsonText());

  readonly importOpen = signal(false);
  readonly importText = signal('');
  readonly importError = signal<string | null>(null);

  readonly jsonErrors = computed<Partial<Record<JsonFieldKey, string>>>(() => {
    const errors: Partial<Record<JsonFieldKey, string>> = {};
    const text = this.jsonText();
    for (const field of JSON_FIELDS) {
      const raw = text[field.key].trim();
      if (!raw) continue;
      try {
        JSON.parse(raw);
      } catch (error) {
        errors[field.key] = `Not valid JSON: ${(error as Error).message}`;
      }
    }
    return errors;
  });

  readonly urlErrors = computed(() => ({
    migrationTypeUrl: this.urlError(this.migrationTypeUrl()),
    healthCheckApiUrl: this.urlError(this.healthCheckApiUrl()),
    encryptionApiUrl: this.urlError(this.encryptionApiUrl())
  }));

  readonly canSave = computed(
    () =>
      !this.saving() &&
      !!this.name().trim() &&
      Object.keys(this.jsonErrors()).length === 0 &&
      !Object.values(this.urlErrors()).some(Boolean)
  );

  get appLabel(): string {
    return displayNameOrFallback(this.app, this.app.appId);
  }

  async ngOnInit(): Promise<void> {
    this.name.set(this.appLabel);
    try {
      const existing = await this.applications.getMigrationType(this.app.appId);
      if (existing) this.fill(existing);
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, "Couldn't load the saved migration details"), 'critical');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  setJson(key: JsonFieldKey, value: string): void {
    this.jsonText.update((current) => ({ ...current, [key]: value }));
  }

  formatJson(key: JsonFieldKey): void {
    const raw = this.jsonText()[key].trim();
    if (!raw || this.jsonErrors()[key]) return;
    this.setJson(key, JSON.stringify(JSON.parse(raw), null, 2));
  }

  async onImagePicked(which: 'source' | 'target', event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.show('Choose an image file (PNG, JPG, SVG…).', 'critical');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.toast.show('That image is too large. Use one under 1.4 MB.', 'critical');
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    (which === 'source' ? this.sourceFileImage : this.targetFileImage).set(dataUrl);
  }

  clearImage(which: 'source' | 'target'): void {
    (which === 'source' ? this.sourceFileImage : this.targetFileImage).set(null);
  }

  applyImport(): void {
    try {
      const row = parseInsertStatement(this.importText());
      this.fillFromRow(row);
      this.importError.set(null);
      this.importOpen.set(false);
      this.importText.set('');
      this.toast.show('Form filled from the INSERT statement. Review it, then save.', 'success');
    } catch (error) {
      this.importError.set((error as Error).message);
    }
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    const text = this.jsonText();
    const json = (key: JsonFieldKey): JsonValue => (text[key].trim() ? (JSON.parse(text[key]) as JsonValue) : null);
    const config: MigrationTypeConfig = {
      name: this.name().trim(),
      description: blankToNull(this.description()),
      sourceFileImage: this.sourceFileImage(),
      targetFileImage: this.targetFileImage(),
      migrationTypeUrl: blankToNull(this.migrationTypeUrl()),
      migrationAdditionalFormAttributes: json('migrationAdditionalFormAttributes'),
      migrationFormAttributes: json('migrationFormAttributes'),
      targetMigrationDetails: json('targetMigrationDetails'),
      migrationAttributes: json('migrationAttributes'),
      migrationSourceForm: json('migrationSourceForm'),
      migrationTargetForm: json('migrationTargetForm'),
      healthCheckApiUrl: blankToNull(this.healthCheckApiUrl()),
      migrationBlobFolder: blankToNull(this.migrationBlobFolder()),
      processingType: blankToNull(this.processingType()),
      migrationEncryptionConfig: json('migrationEncryptionConfig'),
      preMigrationInfo: json('preMigrationInfo'),
      inventorySupported: this.inventorySupported(),
      encryptionApiUrl: blankToNull(this.encryptionApiUrl())
    };

    this.saving.set(true);
    try {
      const response = await this.applications.saveMigrationType(this.app.appId, config);
      this.existingId.set(response.migrationType.id ?? null);
      this.saved.emit(response);
    } catch (error: unknown) {
      this.toast.show(this.messageOf(error, 'Could not save the migration details'), 'critical');
    } finally {
      this.saving.set(false);
    }
  }

  private fill(config: MigrationTypeConfig): void {
    this.existingId.set(config.id ?? null);
    this.lastModified.set(config.modifiedDate ?? config.createdDate ?? null);
    this.name.set(config.name ?? this.appLabel);
    this.description.set(config.description ?? '');
    this.processingType.set(config.processingType ?? '');
    this.inventorySupported.set(!!config.inventorySupported);
    this.migrationTypeUrl.set(config.migrationTypeUrl ?? '');
    this.healthCheckApiUrl.set(config.healthCheckApiUrl ?? '');
    this.encryptionApiUrl.set(config.encryptionApiUrl ?? '');
    this.migrationBlobFolder.set(config.migrationBlobFolder ?? '');
    this.sourceFileImage.set(config.sourceFileImage ?? null);
    this.targetFileImage.set(config.targetFileImage ?? null);
    const text = emptyJsonText();
    for (const field of JSON_FIELDS) {
      const value = config[field.key];
      text[field.key] = value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
    }
    this.jsonText.set(text);
  }

  private fillFromRow(row: Record<string, SqlValue>): void {
    const str = (column: string): string => (row[column] === null || row[column] === undefined ? '' : String(row[column]).trim());
    if (str('name')) this.name.set(str('name'));
    this.description.set(str('description'));
    this.processingType.set(str('processing_type'));
    this.inventorySupported.set(row['is_inventory_supported'] === true);
    this.migrationTypeUrl.set(str('migration_type_url'));
    this.healthCheckApiUrl.set(str('health_check_api_url'));
    this.encryptionApiUrl.set(str('encryption_api_url'));
    this.migrationBlobFolder.set(str('migration_blob_folder'));
    this.sourceFileImage.set(str('source_file_image') || null);
    this.targetFileImage.set(str('target_file_image') || null);
    const text = emptyJsonText();
    for (const field of JSON_FIELDS) {
      const raw = str(field.column);
      if (!raw) continue;
      try {
        text[field.key] = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        text[field.key] = raw; // left as-is so the field's own error explains what is wrong
      }
    }
    this.jsonText.set(text);
  }

  private urlError(value: string): string | null {
    const trimmed = value.trim();
    return trimmed && !URL_PATTERN.test(trimmed) ? 'Must be a full http:// or https:// URL.' : null;
  }

  private messageOf(error: unknown, fallback: string): string {
    const http = error as { status?: number; error?: { message?: string } };
    if (http?.status === 0) return 'Could not reach the server. Check your connection and try again.';
    return http?.error?.message || fallback;
  }
}

function emptyJsonText(): Record<JsonFieldKey, string> {
  return JSON_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {} as Record<JsonFieldKey, string>);
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
