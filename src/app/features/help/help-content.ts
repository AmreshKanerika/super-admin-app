/**
 * The Help section's user guide. Everything a guide shows lives here as data, so updating the
 * documentation never means touching the page template.
 *
 * The guides follow one worked example from start to finish: the organization
 * "Kanerika Software Pvt Ltd" on the plan "Kanerika Enterprise Suite". Screenshots are in
 * src/assets/help; they come from a local run, and people who are not part of the example are
 * shown with sample names.
 */

export interface HelpField {
  name: string;
  hint: string;
}

export interface HelpStep {
  title: string;
  /** One or two sentences: what this step is for. */
  text: string;
  /** Numbered clicks, in order. */
  actions?: string[];
  /** The fields of the form that opens, and what to enter in each. */
  fields?: HelpField[];
  /** What the user sees when the step is done. */
  result?: string;
  image?: string;
  caption?: string;
}

export interface HelpNote {
  tone: 'tip' | 'warning' | 'info';
  text: string;
}

export interface HelpGuide {
  id: string;
  stage: string;
  icon: string;
  title: string;
  summary: string;
  /** Where the flow starts in the console. */
  where: { label: string; path: string };
  audience: 'Super admin' | 'Super admin & Sales';
  steps: HelpStep[];
  notes?: HelpNote[];
}

export interface HelpStage {
  id: string;
  label: string;
  icon: string;
}

export interface HelpFaq {
  group: string;
  q: string;
  a: string;
  guide?: string;
}

const img = (name: string) => `assets/help/${name}.webp`;

/** The organization lifecycle, in the order the guides follow it. */
export const HELP_STAGES: HelpStage[] = [
  { id: 'start', label: 'Get started', icon: 'ti-compass' },
  { id: 'catalog', label: 'Plans & apps', icon: 'ti-apps' },
  { id: 'onboard', label: 'Onboard', icon: 'ti-rocket' },
  { id: 'activate', label: 'Activate', icon: 'ti-world-check' },
  { id: 'manage', label: 'Manage', icon: 'ti-adjustments' },
  { id: 'people', label: 'Roles & users', icon: 'ti-users' },
  { id: 'renew', label: 'Renew & remind', icon: 'ti-bell' },
  { id: 'offboard', label: 'Offboard', icon: 'ti-door-exit' },
  { id: 'govern', label: 'Govern', icon: 'ti-shield-check' }
];

export const HELP_GUIDES: HelpGuide[] = [
  // ---------------------------------------------------------------------------------------------
  {
    id: 'console-tour',
    stage: 'start',
    icon: 'ti-layout-dashboard',
    title: 'Find your way around the console',
    summary:
      'The FLIP Platform console is where Kanerika runs every customer organization. These guides follow one example from start to finish: Kanerika Software Pvt Ltd, from building its plan and onboarding it, through roles, users, usage and renewals, to offboarding it.',
    where: { label: 'Overview', path: '/overview' },
    audience: 'Super admin & Sales',
    steps: [
      {
        title: 'Customer Insights',
        text: 'The first page after sign-in. It shows how the customer base is doing and what needs attention next.',
        actions: [
          'Click Overview in the left menu.',
          'Pick a date range (for example Last 6 months) and what it applies to: onboarding date, subscription start or subscription end.',
          'Read the tiles under "Your business at a glance": total, paid and trial organizations, active subscriptions, renewals due in 30 days, expired, unsubscribed and reactivated.',
          'Click any tile to see the organizations behind the number.',
          'Use "Renewals & follow-ups" for the next best action: renewals due, trials to follow up, and organizations to win back.',
          'Click Export report to download the numbers.'
        ],
        image: img('overview'),
        caption: 'Customer Insights — metrics, filters and the follow-up list.'
      },
      {
        title: 'Organizations list',
        text: 'Every customer, with its web address, plans, status and onboarding date.',
        actions: [
          'Click Organizations in the left menu.',
          'Type a name or domain in the search box — for example "Kanerika".',
          'Narrow the list with the status and plan filters, or the quick chips: expiring in 7 days, expiring in 30 days, paid only, and ready for URL activation.',
          'Click a row to open that organization.',
          'Click Onboard organization to add a new customer, or Export CSV to download the list.'
        ],
        image: img('organizations'),
        caption: 'Searching for Kanerika.'
      },
      {
        title: 'Menu, environment badge and your account',
        text: 'The left menu is grouped into Workspace, Operations and Support.',
        actions: [
          'The badge under "Platform console" shows the environment you are in (LOCAL, DEV or SIT). There is no badge in production.',
          'Click your name at the bottom of the menu to see your role and to sign out. Click anywhere else, or press Esc, to close it.',
          'Click the ☰ button at the top to collapse or expand the menu.'
        ]
      }
    ],
    notes: [
      {
        tone: 'info',
        text: 'Sales users see Overview, Organizations (including each organization\'s Processing insights), Notifications and Help. Applications, Subscription Plans, Offboarding, Audit log and Console users are for Super admins only.'
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'plans',
    stage: 'catalog',
    icon: 'ti-clipboard-list',
    title: 'Create a subscription plan',
    summary:
      'A plan decides which applications an organization gets and how much it may use them. In the example we build "Kanerika Enterprise Suite", which switches on every application and caps Admin Console usage.',
    where: { label: 'Subscription Plans', path: '/plans' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Open Subscription Plans',
        text: 'Every plan is listed as a card: type (Default or Custom), status, key, primary application, number of applications and organizations, and billing mode.',
        actions: [
          'Click Subscription Plans in the left menu.',
          'Search by name, or filter by type. Switch between card and list view with the buttons on the right.',
          'Click Create custom plan.'
        ],
        image: img('plans')
      },
      {
        title: 'Step 1 · Details',
        text: 'Name the plan and say how it is billed.',
        fields: [
          { name: 'Display name', hint: 'The name everyone sees on subscriptions and usage screens — "Kanerika Enterprise Suite".' },
          { name: 'Plan key', hint: 'Filled in for you from the display name (KANERIKA_ENTERPRISE_SUITE). It is the permanent ID of the plan and cannot be changed later.' },
          { name: 'Description', hint: 'Who the plan is for and what it includes.' },
          { name: 'Billing mode', hint: 'How the plan is billed, for example Prepaid.' }
        ],
        actions: ['Fill in the fields.', 'Click Next.'],
        image: img('plan-step1')
      },
      {
        title: 'Step 2 · Applications',
        text: 'Choose which applications the plan includes.',
        actions: [
          'Set each application to Enabled, Disabled or Hidden. To switch everything on at once, click Enabled next to "Set all visible".',
          'Enabling a sub-application turns its parent on automatically. Use Expand all to see sub-applications.',
          'Choose the Primary application — the accelerator the plan is billed against (Admin Console in the example).',
          'Click Next.'
        ],
        result: 'The counter shows how many top-level applications are enabled — "11 of 11 enabled" in the example, 64 applications in total.',
        image: img('plan-step2')
      },
      {
        title: 'Step 3 · Limits & scopes',
        text: 'Every enabled application starts with unlimited design-time and runtime use. Cap only what the plan should limit.',
        actions: [
          'Find the application — for example Admin Console.',
          'Click "Set a limit" under Design-time and type the number (500). Do the same under Runtime (200).',
          'Click × next to a number to make it unlimited again.',
          'Click Next.'
        ],
        fields: [
          { name: 'Design-time', hint: 'How much the organization can build or configure in the application.' },
          { name: 'Runtime', hint: 'How much the organization can run. Leave both as ∞ for no limit.' }
        ],
        image: img('plan-step3')
      },
      {
        title: 'Step 4 · Review and create',
        text: 'Check the plan before saving it.',
        actions: ['Check the name, key, billing mode, number of applications and every limit.', 'Click Back to change anything, or Create plan to save.'],
        result: 'The plan page opens with the message "Plan \'Kanerika Enterprise Suite\' created".',
        image: img('plan-step4')
      },
      {
        title: 'Manage the plan',
        text: 'The plan page shows its details, every application with its allowances, and the organizations using it.',
        actions: [
          'Assign to organization — give an existing organization this plan.',
          'Edit — change applications and limits.',
          'Clone — start a new plan from this one.',
          'Archive or Reactivate — stop or resume offering the plan.',
          'Delete — only possible while no organization uses the plan.'
        ],
        image: img('plan-detail')
      }
    ],
    notes: [
      { tone: 'tip', text: 'Build the plan before onboarding. The onboarding wizard can also create one on the spot with "+ New plan".' },
      { tone: 'info', text: 'A plan keeps a row for every application in the catalog. Disabled applications are not part of the plan; Enabled and Hidden ones are.' }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'applications',
    stage: 'catalog',
    icon: 'ti-apps',
    title: 'Add a new application and its migration details',
    summary:
      'New applications go into the catalog first. A migration application also needs its migration details, and then it is added to plans. In the example we add "Talend to Databricks" under Migration and put it on Kanerika Enterprise Suite.',
    where: { label: 'Applications', path: '/applications' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Open the catalog',
        text: 'The catalog is a tree of applications and their sub-applications, with their machine names, scopes and how many organizations and plans use each one.',
        actions: [
          'Click Applications in the left menu.',
          'Search by name, or use Expand all to see the whole tree.',
          'Row buttons, left to right: add a sub-application, choose subscription plans, migration details (migration apps only), edit, delete.',
          'Click New application.'
        ],
        image: img('applications')
      },
      {
        title: 'Step 1 · New application',
        text: 'Describe the application and where it sits in the catalog.',
        fields: [
          { name: 'Display name', hint: 'What everyone sees — "Talend to Databricks".' },
          { name: 'Machine name', hint: 'Filled in from the display name (TALEND_TO_DATABRICKS): capital letters, digits and underscores. It cannot be changed later.' },
          { name: 'Parent application', hint: 'Optional. Pick "Migration" for a migration accelerator, or leave it at top level.' },
          { name: 'Scopes', hint: 'The permissions roles can grant: ALL, or individual ones such as VIEW, ADD and EDIT.' }
        ],
        actions: ['Fill in the fields.', 'Click Create application.'],
        result: '"\'Talend to Databricks\' added to the catalog". For a migration application, step 2 opens straight away.',
        image: img('app-new')
      },
      {
        title: 'Step 2 · Migration details',
        text: 'What the migration needs in order to run. Saving writes the master migration_types table only; organizations get their copy when the application reaches their plan.',
        fields: [
          { name: 'Name and Description', hint: 'How the migration appears to organizations.' },
          { name: 'Processing type', hint: 'Where it runs — AZURE_FUNCTIONS or API.' },
          { name: 'Inventory', hint: 'Tick "Supports inventory" if the migration can scan the source first.' },
          { name: 'Source image / Target image', hint: 'Logos shown on the migration card: PNG, JPG or SVG, under 1.4 MB.' },
          { name: 'Endpoints & storage', hint: 'Migration type URL (optional), Health check API URL, Encryption API URL (optional) and the Blob folder the files go to.' },
          { name: 'Configuration (JSON)', hint: 'Migration screen settings, additional questions, source and target forms, target defaults and storage settings. Leave blank where not needed.' }
        ],
        actions: ['Fill in the fields, or use "Fill from SQL INSERT" (next step).', 'Click Save and continue — or Skip for now to add the details later.'],
        result: '"Migration details saved (id 20)". The ID is assigned automatically.',
        image: img('migration-filled')
      },
      {
        title: 'Or fill it from a SQL INSERT',
        text: 'If the migration already exists as SQL, paste it instead of typing.',
        actions: [
          'Click Fill from SQL INSERT.',
          'Paste an INSERT INTO … migration_types (…) VALUES (…) statement.',
          'Click Fill form. Each column goes into its field; the id is ignored because a new one is assigned on save.',
          'Check the fields, then click Save and continue.'
        ],
        image: img('migration-import')
      },
      {
        title: 'Step 3 · Add it to subscription plans',
        text: 'Choose which plans include the new application.',
        actions: ['Open the "Add to plans" tab.', 'Search for the plan — "Kanerika" — and tick Kanerika Enterprise Suite.', 'Click Add to 1 plan.'],
        result:
          '"Added to 1 plan · 0 organizations affected". Organizations already on the plan get the application at once, and its migration details are copied into their schemas. Their existing roles do not change.',
        image: img('app-plans-add')
      },
      {
        title: 'Find it in the catalog',
        text: 'The new application appears under its parent, with the number of plans and organizations that use it.',
        actions: [
          'To change its plans later, click the clipboard button on its row. "On plans" lists the plans that include it — tick any and choose Remove from plans.',
          'To delete it, click the bin and type its machine name. Deleting is refused while any plan, organization limit or role still uses it.'
        ],
        image: img('applications-search')
      }
    ],
    notes: [
      { tone: 'tip', text: 'A migration application with an orange arrows button still needs its migration details. Click it to finish.' },
      {
        tone: 'info',
        text: 'IDs are handled for you: the master row gets the highest ID used in any schema plus one, and each organization schema gives its copy its own next ID. Copies are matched by name.'
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'onboard',
    stage: 'onboard',
    icon: 'ti-rocket',
    title: 'Onboard a new organization',
    summary:
      'The onboarding wizard creates the organization, its first admin and one subscription for each plan it bought. In the example we onboard Kanerika Software Pvt Ltd with Priya Sharma as its admin.',
    where: { label: 'Organizations → Onboard organization', path: '/onboarding/new' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Step 1 · Organization',
        text: 'Who the customer is and where their workspace will live.',
        actions: ['Click Organizations, then Onboard organization.', 'Fill in the fields.', 'Click Next.'],
        fields: [
          { name: 'Organization name', hint: '"Kanerika Software Pvt Ltd". It must be unique.' },
          { name: 'Web address', hint: 'The prefix of their workspace URL — "kanerikademo" becomes https://kanerikademo.sit.flipnow.cloud. Use Edit URL to change the domain.' },
          { name: 'Tier', hint: 'Paid or Trial.' },
          { name: 'Email domain', hint: 'Optional. Groups the organization with the company\'s other domains (kanerika.example.test).' },
          { name: 'External tenant id', hint: 'Optional. The customer\'s Azure AD tenant, if they sign in with Microsoft.' },
          { name: 'Provision a dedicated database schema', hint: 'Tick for its own schema. Leave unticked to use the shared trial schema.' },
          { name: 'Provision the data integration app', hint: 'Tick if the organization needs a data integration app. It is created when the URL is activated.' }
        ],
        image: img('onboard-1')
      },
      {
        title: 'Step 2 · Admin user',
        text: 'The organization\'s first admin — the "Original admin", who can never be removed.',
        fields: [
          { name: 'First name / Last name', hint: '"Priya" "Sharma".' },
          { name: 'Email (used as username)', hint: '"priya.sharma@example.test". This is how they sign in.' }
        ],
        actions: ['Fill in the fields.', 'Click Next.'],
        result: 'This person receives the Admin role of every subscription added in the next step.',
        image: img('onboard-2')
      },
      {
        title: 'Step 3 · Subscriptions',
        text: 'Add one subscription for each plan the customer bought.',
        fields: [
          { name: 'Plan', hint: 'Pick "KANERIKA_ENTERPRISE_SUITE". Use "+ New plan" to build one without leaving the wizard.' },
          { name: 'Start date / End date', hint: 'The subscription period — one year by default.' },
          { name: 'Organization run limit', hint: 'Optional. Leave blank for unlimited.' },
          { name: 'Also provision this subscription\'s developer role', hint: 'Tick to create a Developer role next to Admin.' }
        ],
        actions: ['Fill in the fields.', 'Click "+ Add another subscription" for more plans.', 'Click Next.'],
        image: img('onboard-3')
      },
      {
        title: 'Step 4 · Review',
        text: 'Everything the wizard will create, on one screen.',
        actions: ['Check the organization, web address, tier, schema, admin user and subscriptions.', 'Click Back to change anything, or Start provisioning.'],
        image: img('onboard-4')
      },
      {
        title: 'Step 5 · Provisioning',
        text: 'The wizard creates everything and reports the result.',
        actions: [
          'Wait for the steps to finish.',
          'Note the login URL and username. Click Copy to clipboard or Download as .txt to keep them.',
          'Read any warning that needs follow-up.',
          'Click View organization.'
        ],
        result: '"Kanerika Software Pvt Ltd is ready." Nothing exists in DNS or Keycloak yet — the admin\'s password is created when you activate the URL.',
        image: img('onboard-5-done')
      }
    ],
    notes: [
      { tone: 'warning', text: 'Onboarding only reserves the web address. A reservation that is never activated is released automatically after 15 days.' },
      { tone: 'info', text: 'A warning such as "Dedicated schema table creation failed and needs a manual retry" means the organization exists but DevOps must finish that step.' }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'activate',
    stage: 'activate',
    icon: 'ti-world-check',
    title: 'Activate the organization\'s URL',
    summary:
      'Activation brings the organization online: it creates (or adopts) the DNS record, creates the sign-in realm and the data integration app, and creates the admin\'s sign-in.',
    where: { label: 'Organization → Overview', path: '/organizations' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Check the workspace address',
        text: 'A new organization shows "Not activated" and what activation will create.',
        actions: [
          'Open the organization from the Organizations list.',
          'On the Overview tab, find the Workspace address card.',
          'If DevOps has already created the DNS record, tick "DNS record already created by DevOps" so activation adopts it instead of creating another.'
        ],
        image: img('org-overview-inactive')
      },
      {
        title: 'Activate',
        text: 'Confirm the activation.',
        actions: ['Click Activate URL.', 'Read the confirmation, then click Activate domain.'],
        image: img('activate-confirm')
      },
      {
        title: 'Share the admin\'s sign-in',
        text: 'The address is live and the admin can sign in.',
        actions: [
          'Check the status: Live, with DNS record, sign-in realm and data schema ticked.',
          'In "Administrator sign-in created", copy the username and temporary password (click the eye to reveal it). They are shown only once.',
          'Share them with the admin, then click "Saved, hide".'
        ],
        result: 'The admin signs in at the workspace URL and chooses their own password.',
        image: img('activate-done')
      }
    ],
    notes: [
      { tone: 'warning', text: 'Users can be added only after activation, because their logins live in the sign-in realm that activation creates.' },
      { tone: 'info', text: 'Deactivate URL takes a live address offline again. A DNS record adopted from DevOps is never deleted by the console.' }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'org-details',
    stage: 'manage',
    icon: 'ti-building',
    title: 'Edit an organization, change or extend its plan',
    summary: 'The organization header holds the everyday actions: Edit, Change plan, Extend subscription and more.',
    where: { label: 'Organizations → an organization', path: '/organizations' },
    audience: 'Super admin',
    steps: [
      {
        title: 'The organization page',
        text: 'Eight tabs cover everything about one organization: Overview, Subscriptions, Usage & resets, Apps & limits, Users & roles, Processing insights, Notifications and Activity.',
        actions: ['Open the organization.', 'The Overview tab shows the workspace address, administrator, plan, tier, expiry and creation date.'],
        image: img('org-overview')
      },
      {
        title: 'Edit organization',
        text: 'Change the name or tier.',
        actions: ['Click Edit.', 'Change the fields.', 'Click Save changes.'],
        fields: [
          { name: 'Organization name', hint: 'The new name. It must be unique.' },
          { name: 'Tier', hint: 'Paid or Trial.' }
        ],
        result: 'The web address and infrastructure cannot be changed here — they were set at onboarding.',
        image: img('org-edit')
      },
      {
        title: 'Change plan',
        text: 'Move the organization to another plan, now or when the current one ends.',
        actions: ['Click Change plan.', 'Fill in the fields.', 'Click Apply.'],
        fields: [
          { name: 'New plan', hint: 'The plan to move to.' },
          {
            name: 'When should this take effect?',
            hint: '"Switch now" (remaining usage is forfeited) or "Keep the current plan running until it expires, then switch automatically".'
          },
          { name: 'Reason', hint: 'Why — for example "Customer upgrading at renewal". It is kept in the audit log.' }
        ],
        image: img('org-change-plan')
      },
      {
        title: 'Extend subscription',
        text: 'Add 90 days to the current subscription.',
        actions: ['Click Extend subscription.', 'Check the old and new end dates.', 'Enter a reason.', 'Click Extend by 90 days.'],
        result: '"Subscription extended by 90 days". Pending reminders for the old date are cancelled.',
        image: img('org-extend')
      },
      {
        title: 'More actions',
        text: 'The ⋯ button holds the less frequent actions.',
        actions: [
          'Suspend access — pause the active subscription. Reactivate appears in the header while it is suspended.',
          'Offboard organization — opens the Offboarding page for this organization.'
        ],
        image: img('org-more-menu')
      }
    ],
    notes: [
      { tone: 'info', text: 'Every change here is recorded with its reason on the Activity tab and in the Audit log.' },
      { tone: 'info', text: 'Organizations bought through Azure Marketplace are managed there and are read-only in the console.' }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'subscriptions',
    stage: 'manage',
    icon: 'ti-receipt',
    title: 'Manage subscriptions',
    summary: 'The Subscriptions tab lists every plan the organization holds, with its status and dates.',
    where: { label: 'Organization → Subscriptions', path: '/organizations' },
    audience: 'Super admin & Sales',
    steps: [
      {
        title: 'Subscription actions',
        text: 'Each row is one subscription. After the extension in the example, Kanerika Enterprise Suite runs from Sep 30, 2026 to Dec 29, 2027.',
        actions: [
          'Open the Subscriptions tab.',
          'Extend — move the end date out.',
          'Shorten — bring the end date forward.',
          'Suspend — pause access without ending the subscription.',
          'Deactivate — end the subscription.',
          'Add subscription — give the organization another plan through the wizard.'
        ],
        image: img('org-subscriptions')
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'limits',
    stage: 'manage',
    icon: 'ti-adjustments',
    title: 'Set application access and limits',
    summary: 'Apps & limits controls, for one organization, which applications are visible and how much each may be used — on top of what its plan allows.',
    where: { label: 'Organization → Apps & limits', path: '/organizations' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Review access and allowances',
        text: 'Every application with its access state and its design-time and runtime allowance.',
        actions: [
          'Open the Apps & limits tab.',
          'Filter with the chips: All, Enabled, Disabled, Hidden and Modified.',
          'Search for an application, or use Expand all.',
          'Use "Set all visible" to change the access of every listed application at once.'
        ],
        image: img('org-limits')
      },
      {
        title: 'Change a limit',
        text: 'In the example we cap AI Workbench design-time use at 100.',
        actions: [
          'Find AI Workbench.',
          'Under Design-time, click "Set a limit" and type 100.',
          'A bar appears at the bottom: "1 unsaved change". Change more rows if needed.',
          'Click Save all changes (or Discard all).'
        ],
        fields: [
          { name: 'Access', hint: 'Enabled — can be used. Disabled — switched off. Hidden — not shown to the organization.' },
          { name: 'Design-time / Runtime', hint: 'A number caps use; ∞ means unlimited. Click × to make it unlimited again.' }
        ],
        image: img('org-limits-edit')
      },
      {
        title: 'Confirm with a reason',
        text: 'The dialog shows each change as before → after.',
        actions: ['Check the changes.', 'Enter a reason — "Cap AI Workbench design-time use for the pilot".', 'Click Save changes.'],
        result: '"Application limits updated".',
        image: img('org-limits-save')
      }
    ],
    notes: [{ tone: 'info', text: 'New applications appear here as Hidden. An application must be on one of the organization\'s plans before it can be enabled.' }]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'usage',
    stage: 'manage',
    icon: 'ti-gauge',
    title: 'Check usage and reset counters',
    summary: 'Usage & resets shows how much of each allowance an organization has used, and resets application counters — for example at the start of a billing period.',
    where: { label: 'Organization → Usage & resets', path: '/organizations' },
    audience: 'Super admin',
    steps: [
      {
        title: '1 · Choose a plan',
        text: 'Usage is counted per plan.',
        actions: ['Open the Usage & resets tab.', 'Click the plan — KANERIKA_ENTERPRISE_SUITE.'],
        image: img('org-usage-plans')
      },
      {
        title: '2 and 3 · Review usage and select applications',
        text: 'Step 2 shows the plan\'s pooled allowance (total, used, remaining). Step 3 lists every application with its own design-time and runtime counters.',
        actions: [
          'Choose the Reset type: Design time, Runtime or Both.',
          'Tick the applications to reset — only applications with a finite limit can be ticked (Admin Console and AI Workbench in the example). Select all ticks every eligible application.',
          'Click Reset selected apps.'
        ],
        image: img('org-usage')
      },
      {
        title: 'Confirm the reset',
        text: 'The dialog lists every counter that will be reset, before → after.',
        actions: ['Check the counters.', 'Enter a reason — "Start of the new billing month".', 'Click Reset selected apps.'],
        result: '"Selected finite usage counters reset successfully". Used becomes 0; unlimited counters and the plan allowance are not touched.',
        image: img('org-usage-reset')
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'processing',
    stage: 'manage',
    icon: 'ti-chart-bar',
    title: 'See what an organization processed',
    summary:
      'Processing insights shows, for one organization and one period, how many files it processed, how many PDF pages were extracted and how many files wait for manual review — read straight from the organization\'s own data.',
    where: { label: 'Organization → Processing insights', path: '/organizations' },
    audience: 'Super admin & Sales',
    steps: [
      {
        title: 'Open Processing insights',
        text: 'The tab sits right after Users & roles. It opens on the latest month in which the organization processed anything.',
        actions: ['Open the organization from the Organizations list.', 'Click the Processing insights tab.']
      },
      {
        title: 'Choose the period',
        text: 'Everything is chosen from one Period dropdown at the top right.',
        fields: [
          { name: 'Latest month', hint: 'The default: the most recent month with activity (its name is shown in the dropdown).' },
          { name: 'This month / Last month', hint: 'A single calendar month.' },
          { name: 'Last 3 months / This year', hint: 'A range; the numbers add up across it.' },
          { name: 'Months with activity', hint: 'Jump straight to any month in which files were processed.' },
          { name: 'Custom range…', hint: 'Shows From and To month pickers — choose both and click Apply. Up to 36 months.' }
        ],
        actions: ['Open the Period dropdown and pick an option.', 'Click the refresh button beside it to reload the numbers.'],
        image: img('processing-custom'),
        caption: 'Custom range chosen: From and To month pickers with Apply, beside the Period dropdown.'
      },
      {
        title: 'Read the headline numbers',
        text: 'Three big numbers for the chosen period.',
        fields: [
          { name: 'Files processed', hint: 'PDF, XLSX, XLS, CSV and ZIP files whose status is completed. Skipped jobs are not counted.' },
          { name: 'PDF pages processed', hint: 'The total number of PDF pages extracted, including PDFs that arrived inside a ZIP.' },
          { name: 'Manual review required', hint: 'Files waiting for a person to check them — this happens to PDFs whose extraction needs a review.' }
        ],
        image: img('processing-insights'),
        caption: 'KSPL, latest month: the three headline numbers and one tile per source file type.'
      },
      {
        title: 'Files processed by source type',
        text: 'One big number for each source file type — the type of file the organization uploaded, not the file that was produced from it.',
        actions: [
          'Read the PDF, XLSX, XLS, CSV and ZIP tiles. A grey number means none were processed in the period.',
          'ZIP counts the files processed from ZIP uploads, not the ZIP upload itself.',
          'A tile also shows how many of its files are in manual review, when there are any.'
        ],
        result: 'When nothing was processed in the period, the tab says so and offers to show the latest month with activity.'
      }
    ],
    notes: [
      {
        tone: 'info',
        text: 'The numbers come from the organization\'s own schema (import_monitor_view and processing_metrics). If a schema is shared with other organizations, the tab says so, because their files are counted too.'
      },
      { tone: 'tip', text: 'A file belongs to the month it finished in. Files still running, failed or skipped are not counted.' }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'roles',
    stage: 'people',
    icon: 'ti-shield-lock',
    title: 'Create custom roles',
    summary:
      'Roles decide what people can open and do. Every subscription comes with built-in Admin and Developer roles; custom roles grant exactly the applications a group needs. In the example we create "Migration Analyst" and "Report Viewer".',
    where: { label: 'Organization → Users & roles → Roles', path: '/organizations' },
    audience: 'Super admin',
    steps: [
      {
        title: 'See the built-in roles',
        text: 'Onboarding created Admin and Developer for Kanerika Enterprise Suite. They carry a lock: they can be given to users, but not changed or deleted.',
        actions: ['Open the Users & roles tab.', 'Click Roles at the top left.', 'Click Create role.'],
        image: img('org-roles-default')
      },
      {
        title: 'Fill in the role',
        text: 'Name the role and choose its applications.',
        fields: [
          { name: 'Role name', hint: '"Migration Analyst".' },
          { name: 'Description', hint: 'Optional. "Runs Talend and Informatica migrations to Databricks and reviews their results".' },
          {
            name: 'App permissions',
            hint: 'Search for an application and tick it to grant all of it, or pick individual scopes. Only applications on the organization\'s plans can be chosen.'
          }
        ],
        actions: [
          'Search "Talend to Databricks" and tick it, then search "Informatica to Databricks" and tick it. Their parents (Migration, Pipelines) turn on automatically.',
          'The chips at the top and the "4 apps · 4 scopes" counter show what is selected. "Selected only" hides everything else.',
          'Click Create role.'
        ],
        result: '"Role \'Migration Analyst\' created". Repeat for "Report Viewer" with Dashboard and KPI Handbook.',
        image: img('role-editor')
      },
      {
        title: 'The finished roles',
        text: 'Each card shows the role\'s applications, scopes and number of users.',
        actions: ['Click the pencil on a custom role to change it.', 'Click the bin to delete it. Its users lose only that role.'],
        image: img('org-roles')
      }
    ],
    notes: [{ tone: 'tip', text: 'Ticking a sub-application turns its parent on; turning a parent off turns its children off; switching off every child turns the parent off too.' }]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'users',
    stage: 'people',
    icon: 'ti-users',
    title: 'Add, edit and remove users',
    summary:
      'Super admins can manage an organization\'s users directly: create logins with roles, change names and roles, and remove people. In the example Kanerika gets a second Admin, a Developer, a Migration Analyst and a Report Viewer.',
    where: { label: 'Organization → Users & roles', path: '/organizations' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Open Users',
        text: 'Right after onboarding the list holds only the Original admin, Priya Sharma.',
        actions: ['Open the Users & roles tab.', 'Click Add user.'],
        image: img('org-users-before')
      },
      {
        title: 'Fill in the new user',
        text: 'The form has two parts: the person and their roles.',
        fields: [
          { name: 'Email address', hint: '"vikram.singh@example.test". It is also their username.' },
          { name: 'First name / Last name', hint: '"Vikram" "Singh".' },
          { name: 'Roles', hint: 'Click one or more role cards — "Migration Analyst". Built-in roles show which plan they belong to.' },
          { name: 'Email the sign-in details', hint: 'Turn on to email the username and temporary password straight away. You can also copy them afterwards.' }
        ],
        actions: ['Fill in the fields.', 'Click Create user.'],
        image: img('user-add')
      },
      {
        title: 'Need a role that doesn\'t exist yet? Create it here',
        text: 'You don\'t have to leave the form for the Roles tab. The role editor opens on top, and everything you typed stays as it is.',
        actions: ['Under Roles, click the dashed "Create a new role" card at the end of the list.'],
        image: img('user-add-create-role'),
        caption: 'The "Create a new role" card sits after the existing roles.'
      },
      {
        title: 'Fill in the new role',
        text: 'The role editor opens on top of the user form — the same form as on the Roles tab.',
        actions: [
          'Enter the role name and an optional description.',
          'Choose its app permissions: tick an app for all of it, or pick individual scopes.',
          'Click Create role.',
          'Finish the user and click Create user (or Save changes when editing a user).'
        ],
        result:
          'The editor closes and the new role appears in the list, already selected for this user. Press Esc to close only the role editor — the user form stays open.',
        image: img('role-from-user')
      },
      {
        title: 'Hand over the credentials',
        text: 'The login is created with a temporary password and the roles are granted.',
        actions: [
          'Copy the details, or click Send by email.',
          'Click Done. The password is not shown again.',
          'Repeat for the other users: Rahul Verma (Admin), Anita Rao (Developer), Neha Gupta (Report Viewer).'
        ],
        result: 'The user signs in at https://kanerikademo.sit.flipnow.cloud and chooses their own password.',
        image: img('user-created')
      },
      {
        title: 'Edit a user',
        text: 'Change a name or roles. In the example Neha Gupta also gets Migration Analyst.',
        actions: [
          'Click Edit on the user\'s row.',
          'Change the first or last name, or click role cards to add or remove roles.',
          'Check the strip that lists added and removed roles.',
          'Click Save changes.'
        ],
        result: 'The email cannot be changed — remove the user and add the new address instead.',
        image: img('user-edit')
      },
      {
        title: 'Remove a user',
        text: 'Remove takes away the person\'s roles here and deletes their login for this organization.',
        actions: ['Click Remove on the user\'s row.', 'Read the confirmation, then click Remove user.'],
        result: 'If they belong to other organizations, their account moves to one of those; otherwise it is deleted.',
        image: img('user-remove')
      },
      {
        title: 'The finished list',
        text: 'Kanerika now has two Admins, a Developer, a Migration Analyst, and a Report Viewer who is also a Migration Analyst.',
        actions: ['Search by name, email or role.', 'Priya Sharma\'s Remove button is locked because she is the Original admin.'],
        image: img('org-users')
      }
    ],
    notes: [
      { tone: 'warning', text: 'The Original admin can never be removed or lose the Admin role. Admins added later can be removed, as long as another Admin remains.' },
      { tone: 'info', text: 'If the email already has a FLIP account in another organization, that person is added here with the chosen roles instead of getting a second account.' }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'notifications',
    stage: 'renew',
    icon: 'ti-bell',
    title: 'Send and schedule expiry reminders',
    summary: 'Reminders keep customers aware of upcoming expiry — automatically on a schedule, or on demand.',
    where: { label: 'Notifications', path: '/notifications' },
    audience: 'Super admin & Sales',
    steps: [
      {
        title: 'Expiring soon',
        text: 'Organizations whose subscriptions have expired or expire soon, with their admin\'s email.',
        actions: ['Click Notifications in the left menu.', 'Tick the organizations to remind, or Select all.', 'Click Send reminder (n).'],
        image: img('notifications-select')
      },
      {
        title: 'Settings — automatic reminders',
        text: 'Decide when reminders go out on their own.',
        fields: [
          { name: 'Automatic reminders', hint: 'Turn on to email admins automatically as expiry approaches.' },
          { name: 'When to send', hint: 'Pick any of: 30 days before, 15 days before, 7 days before, 1 day before, On expiry.' },
          { name: 'Also notify', hint: 'Addresses copied on every reminder, for example the account team.' }
        ],
        actions: ['Open the Settings tab.', 'Choose the options.', 'Click Save settings.'],
        image: img('notifications-settings')
      },
      {
        title: 'History',
        text: 'Every reminder sent: when, organization, subject, recipient, timing and status.',
        actions: ['Open the History tab.'],
        image: img('notifications-history')
      },
      {
        title: 'From the organization',
        text: 'The organization\'s Notifications tab lists what was sent to it.',
        actions: ['Open the organization, then the Notifications tab.', 'Send reminder now emails the admin immediately — there is no confirmation step.'],
        image: img('org-notifications')
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'offboard',
    stage: 'offboard',
    icon: 'ti-door-exit',
    title: 'Offboard an organization',
    summary: 'Offboarding ends a customer in two stages: first expire their access (reversible), then — only if the data must be destroyed — delete permanently.',
    where: { label: 'Offboarding', path: '/offboarding' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Find the organization',
        text: 'Offboarding lists organizations with their domain and status.',
        actions: [
          'Click Offboarding in the left menu (or ⋯ → Offboard organization on its page).',
          'Search "Kanerika". Sort and filter with Latest first and the All / Active / Expired chips.',
          'Click Offboard on the row.'
        ],
        image: img('offboarding')
      },
      {
        title: 'Check what will be affected',
        text: 'The dialog counts active users and open subscriptions. Click View to list them.',
        fields: [
          { name: 'Reason', hint: 'Why — "Contract ended — customer asked to close the workspace".' },
          { name: 'Type the organization name', hint: 'Type "Kanerika Software Pvt Ltd" exactly to unlock the button.' }
        ],
        actions: ['Fill in both fields.', 'Click Expire access.'],
        result: '"Organization expired — access is blocked, no data was deleted". Every user\'s login is blocked at once.',
        image: img('offboard-confirm')
      },
      {
        title: 'Reactivate or delete',
        text: 'The row now reads "Expired · access blocked", with the date and reason.',
        actions: ['Click Reactivate to restore access.', 'Click Delete permanently only when the data must be destroyed.'],
        image: img('offboard-expired')
      },
      {
        title: 'Delete permanently',
        text: 'Archives the organization\'s record and permanently deletes its data, database, sign-in realm and web address.',
        actions: ['Click Delete permanently.', 'Type the organization name.', 'Click Permanently delete. This cannot be undone.'],
        image: img('offboard-purge-dialog')
      }
    ],
    notes: [{ tone: 'warning', text: 'Use Expire access by default. Delete permanently only when the customer has asked for their data to be destroyed.' }]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'audit',
    stage: 'govern',
    icon: 'ti-history',
    title: 'Review the audit log',
    summary: 'Every action a console user takes is recorded permanently: who did what, to what, and whether it worked.',
    where: { label: 'Audit log', path: '/audit-log' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Search the audit log',
        text: 'Columns: When, Actor, Action, Target and Result.',
        actions: [
          'Click Audit log in the left menu.',
          'Search by actor, action or target — "Kanerika" shows every step of the example.',
          'Filter by result (All, Success only, Failure only) and by date range.',
          'Click Export CSV to download the filtered list.'
        ],
        image: img('audit-log')
      },
      {
        title: 'One organization\'s activity',
        text: 'The organization\'s Activity tab shows the same record for that organization only.',
        actions: ['Open the organization, then the Activity tab.'],
        image: img('org-activity')
      }
    ]
  },

  // ---------------------------------------------------------------------------------------------
  {
    id: 'console-users',
    stage: 'govern',
    icon: 'ti-users-group',
    title: 'Manage console users',
    summary: 'Console users are the Kanerika people who can sign in to this console, as Super admin or Sales.',
    where: { label: 'Console users', path: '/console-users' },
    audience: 'Super admin',
    steps: [
      {
        title: 'Open Console users',
        text: 'Each console user\'s email, name, role and status. Your own account is protected.',
        actions: ['Click Console users in the left menu.', 'Click Add console user.'],
        image: img('console-users')
      },
      {
        title: 'Add a console user',
        text: 'If the person already has a Kanerika login it is reused; otherwise a new one is created.',
        fields: [
          { name: 'Email', hint: '"sneha.kulkarni@example.test".' },
          { name: 'First name / Last name', hint: '"Sneha" "Kulkarni".' },
          {
            name: 'Role',
            hint: 'Sales — organizations, subscriptions, notifications and Customer Insights. Super admin — full access, including plans, limits and provisioning.'
          }
        ],
        actions: ['Fill in the fields.', 'Click Add user.'],
        image: img('console-add')
      },
      {
        title: 'Share the login',
        text: 'For a new login the temporary password is shown once.',
        actions: ['Click Copy to clipboard and share it securely.', 'Click Done.'],
        result: 'They choose their own password at first sign-in.',
        image: img('console-created')
      },
      {
        title: 'Edit',
        text: 'Change the name, email or role.',
        actions: ['Click Edit on the row.', 'Change the fields — changing the email also updates their login.', 'Click Save changes.'],
        image: img('console-edit')
      },
      {
        title: 'Remove access',
        text: 'Stops them signing in to this console.',
        actions: ['Click Remove access on the row.', 'Confirm with Remove access.'],
        result: 'Their Kanerika login is kept, so other applications are unaffected. You can add them back at any time.',
        image: img('console-remove')
      }
    ]
  }
];

export const HELP_FAQ: HelpFaq[] = [
  // Getting started
  {
    group: 'Getting started',
    q: 'In what order should I set up a new customer?',
    a: 'Make sure the plan exists (Subscription Plans), onboard the organization, activate its URL, then create any custom roles and add users. Reminders and usage tracking then run on their own.',
    guide: 'onboard'
  },
  {
    group: 'Getting started',
    q: 'What can a Sales console user do?',
    a: 'Sales users see Customer Insights, Organizations and Notifications, can view an organization\'s users and roles, and can add subscriptions to existing organizations. Plans, applications, offboarding, the audit log and console users are for Super admins.',
    guide: 'console-users'
  },
  {
    group: 'Getting started',
    q: 'How do I know which environment I am in?',
    a: 'Look under "Platform console" in the left menu: a badge shows LOCAL, DEV or SIT. Production has no badge.',
    guide: 'console-tour'
  },

  // Plans & applications
  {
    group: 'Plans & applications',
    q: 'What is the difference between Enabled, Disabled and Hidden?',
    a: 'Enabled — the organization can use the application. Disabled — switched off, and not part of the plan. Hidden — part of the plan but not shown to the organization.',
    guide: 'limits'
  },
  {
    group: 'Plans & applications',
    q: 'What do design-time and runtime limits mean?',
    a: 'Design-time is how much an organization can build or configure in an application; runtime is how much it can run. ∞ means unlimited. Plans set the default; Apps & limits can change it for one organization.',
    guide: 'plans'
  },
  {
    group: 'Plans & applications',
    q: 'Does adding an application to a plan change anyone\'s roles?',
    a: 'No. Organizations on the plan become entitled to it straight away, but no existing user gets access until it is added to one of their roles. New subscriptions get it in their default Admin and Developer roles.',
    guide: 'applications'
  },
  {
    group: 'Plans & applications',
    q: 'When are migration details copied into an organization\'s schema?',
    a: 'Saving them writes the master table only. They are copied when the application is added to a plan the organization is on, and when an organization is given a plan that includes it. Existing copies are never overwritten.',
    guide: 'applications'
  },
  {
    group: 'Plans & applications',
    q: 'The result says "schema not provisioned yet". What should I do?',
    a: 'That organization has no data schema with a migration_types table yet, so nothing could be copied. Nothing else is affected. Once DevOps finishes the schema, the copy happens the next time the organization is given the plan.',
    guide: 'applications'
  },
  {
    group: 'Plans & applications',
    q: 'Why can\'t I delete a plan or an application?',
    a: 'Something still uses it. A plan can be deleted only when no organization is on it. An application can be deleted only when no plan, organization limit or role refers to it. Hover the disabled button to see why.',
    guide: 'plans'
  },

  // Onboarding & activation
  {
    group: 'Onboarding & activation',
    q: 'I onboarded an organization. Why doesn\'t its web address work?',
    a: 'Onboarding only reserves the address. Open the organization and click Activate URL on the Overview tab. A reservation that is never activated is released after 15 days.',
    guide: 'activate'
  },
  {
    group: 'Onboarding & activation',
    q: 'When should I tick "DNS record already created by DevOps"?',
    a: 'When DevOps has already created the organization\'s DNS record. Activation then adopts that record instead of creating a second one, and deactivating the URL later will not delete it.',
    guide: 'activate'
  },
  {
    group: 'Onboarding & activation',
    q: 'Provisioning finished with a warning. Is the organization usable?',
    a: 'Yes — the organization, admin and subscriptions exist. The warning names the step that needs a manual retry (for example the dedicated schema tables). Share it with DevOps, then continue with activation.',
    guide: 'onboard'
  },
  {
    group: 'Onboarding & activation',
    q: 'Where is the admin\'s password?',
    a: 'It is created when you activate the URL and shown once, in "Administrator sign-in created" on the Overview tab. Copy it before clicking "Saved, hide".',
    guide: 'activate'
  },

  // Roles & users
  {
    group: 'Roles & users',
    q: 'Why does Add user say the sign-in realm isn\'t created yet?',
    a: 'Organization logins live in the sign-in realm that URL activation creates. Activate the URL first, then add users.',
    guide: 'users'
  },
  {
    group: 'Roles & users',
    q: 'Who is the "Original admin" and why can\'t I remove them?',
    a: 'The first Admin, created at onboarding. They can never be removed or lose Admin, so the organization always has an owner. Admins added later can be removed as long as another Admin remains.',
    guide: 'users'
  },
  {
    group: 'Roles & users',
    q: 'Why can\'t I edit or delete Admin and Developer?',
    a: 'They are built-in roles created for each subscription. They can be given to users but not changed or deleted. Create a custom role for anything different.',
    guide: 'roles'
  },
  {
    group: 'Roles & users',
    q: 'Why do I see more than one Admin role?',
    a: 'Each subscription has its own built-in roles. The plan name on each role card shows which subscription it belongs to.',
    guide: 'roles'
  },
  {
    group: 'Roles & users',
    q: 'Do I have to go to the Roles tab to create a role for a new user?',
    a: 'No. In Add user or Edit user, click "Create a new role" at the end of the role list. The role editor opens on top of the form, and the role you create is selected for that user straight away.',
    guide: 'users'
  },
  {
    group: 'Roles & users',
    q: 'Can a user have several roles?',
    a: 'Yes. Click as many role cards as needed when adding or editing a user — in the example Neha Gupta is both Report Viewer and Migration Analyst.',
    guide: 'users'
  },
  {
    group: 'Roles & users',
    q: 'A user lost their temporary password. What now?',
    a: 'Passwords are never stored, so the console cannot show it again. For anyone other than the Original admin, remove the user and add them again to create a new temporary password.',
    guide: 'users'
  },

  // Usage & reminders
  {
    group: 'Usage & reminders',
    q: 'What exactly does a usage reset do?',
    a: 'For the ticked applications, the chosen counters (design time, runtime or both) go back to 0 used and the full limit remaining. Unlimited counters and the plan\'s pooled allowance are not touched. Every reset is recorded with its reason.',
    guide: 'usage'
  },
  {
    group: 'Usage & reminders',
    q: 'Why can\'t I tick some applications in Usage & resets?',
    a: 'Only applications with a finite limit have something to reset. Unlimited applications are shown for information only.',
    guide: 'usage'
  },
  {
    group: 'Usage & reminders',
    q: 'When are expiry reminders sent?',
    a: 'Automatically at the times chosen in Notifications → Settings, to the organization\'s admin plus the "Also notify" addresses. You can also send one by hand from Expiring soon, or from the organization\'s Notifications tab — which sends immediately.',
    guide: 'notifications'
  },
  {
    group: 'Usage & reminders',
    q: 'Change plan: switch now or at expiry?',
    a: '"Switch now" moves the organization immediately and forfeits what is left on the current plan. "At expiry" keeps the current plan until its end date and then switches automatically.',
    guide: 'org-details'
  },

  // Processing insights
  {
    group: 'Processing insights',
    q: 'What counts as a processed file?',
    a: 'A PDF, XLSX, XLS, CSV or ZIP file whose status is COMPLETED and that was not a skipped job. Files still running, failed or skipped are not counted, and other file types are not shown.',
    guide: 'processing'
  },
  {
    group: 'Processing insights',
    q: 'Why does ZIP show more files than the ZIPs we uploaded?',
    a: 'ZIP counts the files processed from ZIP uploads. A ZIP with ten files inside counts as ten; the ZIP upload itself is not counted separately.',
    guide: 'processing'
  },
  {
    group: 'Processing insights',
    q: 'Where do the PDF page numbers come from?',
    a: 'From processing_metrics — the page count recorded for every PDF that was extracted, including PDFs inside a ZIP and PDFs now in manual review.',
    guide: 'processing'
  },
  {
    group: 'Processing insights',
    q: 'Which month does a file belong to?',
    a: 'The month it finished in. If it has no finish time yet, its start time is used.',
    guide: 'processing'
  },
  {
    group: 'Processing insights',
    q: 'Why does the tab say the schema is shared?',
    a: 'The numbers are read from the organization\'s data schema. When another organization uses the same schema, their files are in the same tables, so they are counted too.',
    guide: 'processing'
  },

  // Offboarding
  {
    group: 'Offboarding',
    q: 'What is the difference between Expire access and Delete permanently?',
    a: 'Expire access blocks every user\'s login but keeps all data, and can be undone with Reactivate. Delete permanently archives the organization record and destroys its data, database, sign-in realm and web address — it cannot be undone.',
    guide: 'offboard'
  },
  {
    group: 'Offboarding',
    q: 'Can I bring back an offboarded organization?',
    a: 'Yes, if it was only expired: click Reactivate on the Offboarding page. After Delete permanently it cannot be restored.',
    guide: 'offboard'
  },

  // Audit
  {
    group: 'Audit',
    q: 'Where can I see who changed something?',
    a: 'The Audit log records every console action with the actor, target, result and reason, and can be exported to CSV. Each organization\'s Activity tab shows the same record for that organization.',
    guide: 'audit'
  }
];
