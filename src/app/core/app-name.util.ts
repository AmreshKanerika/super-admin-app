// flip_applications stores machine-friendly names (ADF_TO_FDF, COGNOS_TO_POWERBI_PREMIGRATION).
// Product/tool names don't title-case cleanly with a generic algorithm (POWERBI -> "PowerBI", not
// "Powerbi"; SSIS should stay all-caps), so known catalog entries are mapped explicitly here, with
// a generic fallback for anything added to the catalog later that isn't in this list yet.
const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  ADF_TO_FDF: 'ADF to FDF',
  ADF_TO_FDF_PREMIGRATION: 'ADF to FDF (Premigration)',
  ADMIN_CONSOLE: 'Admin Console',
  AI: 'AI',
  AI_WORKBENCH: 'AI Workbench',
  ALTERYX_TO_FABRIC: 'Alteryx to Fabric',
  ALTERYX_TO_FABRIC_PREMIGRATION: 'Alteryx to Fabric (Premigration)',
  ASK_AI: 'Ask AI',
  AZURE_TO_FABRIC: 'Azure to Fabric',
  AZURE_TO_FABRIC_PREMIGRATION: 'Azure to Fabric (Premigration)',
  COGNOS_TO_POWERBI: 'Cognos to Power BI',
  COGNOS_TO_POWERBI_PREMIGRATION: 'Cognos to Power BI (Premigration)',
  CRYSTAL_REPORTS_TO_POWERBI: 'Crystal Reports to Power BI',
  CRYSTAL_REPORTS_TO_POWERBI_PREMIGRATION: 'Crystal Reports to Power BI (Premigration)',
  DASHBOARD: 'Dashboard',
  DATA: 'Data',
  DATA_SOURCES: 'Data Sources',
  IBM_DATA_STAGE_TO_TALEND: 'IBM DataStage to Talend',
  IBM_DATA_STAGE_TO_TALEND_PREMIGRATION: 'IBM DataStage to Talend (Premigration)',
  INFORMATICA_TO_ALTERYX: 'Informatica to Alteryx',
  INFORMATICA_TO_ALTERYX_PREMIGRATION: 'Informatica to Alteryx (Premigration)',
  INFORMATICA_TO_AZURE: 'Informatica to Azure',
  INFORMATICA_TO_DATABRICKS: 'Informatica to Databricks',
  INFORMATICA_TO_DATABRICKS_PREMIGRATION: 'Informatica to Databricks (Premigration)',
  INFORMATICA_TO_DBT: 'Informatica to dbt',
  INFORMATICA_TO_DBT_PREMIGRATION: 'Informatica to dbt (Premigration)',
  INFORMATICA_TO_FABRIC: 'Informatica to Fabric',
  INFORMATICA_TO_FABRIC_PREMIGRATION: 'Informatica to Fabric (Premigration)',
  INFORMATICA_TO_TALEND: 'Informatica to Talend',
  INFORMATICA_TO_TALEND_PREMIGRATION: 'Informatica to Talend (Premigration)',
  KPI_HANDBOOK: 'KPI Handbook',
  LLM: 'LLM',
  MANAGE_ROLES: 'Manage Roles',
  MANAGE_USERS: 'Manage Users',
  MASTER_DATA: 'Master Data',
  MIGRATION: 'Migration',
  MONITOR: 'Monitor',
  PHI: 'PHI',
  PIPELINES: 'Pipelines',
  SCHEDULES: 'Schedules',
  SETTINGS: 'Settings',
  SQL_SERVICES_TO_FABRIC: 'SQL Services to Fabric',
  SQL_SERVICES_TO_FABRIC_PREMIGRATION: 'SQL Services to Fabric (Premigration)',
  SSAS_TO_FABRIC: 'SSAS to Fabric',
  SSAS_TO_FABRIC_PREMIGRATION: 'SSAS to Fabric (Premigration)',
  SSIS_TO_FABRIC: 'SSIS to Fabric',
  SSIS_TO_FABRIC_PREMIGRATION: 'SSIS to Fabric (Premigration)',
  SSRS_TO_POWERBI: 'SSRS to Power BI',
  SSRS_TO_POWERBI_PREMIGRATION: 'SSRS to Power BI (Premigration)',
  SYSTEM: 'System',
  TABLEAU_TO_POWERBI: 'Tableau to Power BI',
  TABLEAU_TO_POWERBI_PREMIGRATION: 'Tableau to Power BI (Premigration)',
  UI_PATH_TO_POWERAUTOMATE: 'UiPath to Power Automate',
  UI_PATH_TO_POWERAUTOMATE_PREMIGRATION: 'UiPath to Power Automate (Premigration)',
  VALIDATION: 'Validation'
};

const CONNECTOR_WORDS = new Set(['to', 'of', 'and', 'for', 'with']);

/** Falls back to a generic underscore -> Title Case conversion for anything not in the map above. */
function genericTitleCase(rawName: string): string {
  return rawName
    .split('_')
    .map((word) => {
      const lower = word.toLowerCase();
      if (CONNECTOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function formatAppName(rawName: string | null | undefined): string {
  if (!rawName) return '';
  return DISPLAY_NAME_OVERRIDES[rawName] ?? genericTitleCase(rawName);
}
