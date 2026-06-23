/**
 * @/mock/pools — curated value pools for realistic mock data.
 *
 * These are the vocabulary the generators draw from so the console reads like a
 * real mid-size MSP rather than lorem ipsum (BUILD-CONTRACT §7, docs/00 §7,
 * docs/06 §9.5). Hostnames, error codes, ports, UPNs and Salesforce org ids are
 * verbatim from the failure research so they classify believably and render
 * mono in the UI. No competitor names (M7) — Datto/Kaseya vocabulary only.
 *
 * Pure data, no randomness. Generators combine these with the seeded PRNG.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Clients / orgs
// ─────────────────────────────────────────────────────────────────────────────

/** Tenant/client display names. Includes the contract-mandated demo names. */
export const CLIENT_NAMES = [
  "Acme Dental Group",
  "Contoso Health",
  "Northwind Traders",
  "Back The Rack Up",
  "Norwalk FIPS",
  "Spanning Demo Company",
  "Globex Manufacturing",
  "Initech Systems",
  "Umbra Logistics",
  "BAC Financial",
] as const;

/** Short codes used to prefix hostnames / ids per client. */
export const CLIENT_CODES = [
  "ACME",
  "CONTOSO",
  "NWND",
  "BTRU",
  "NOR-FIPS",
  "SPANDEMO",
  "GLBX",
  "INITECH",
  "UMBRA",
  "BAC",
] as const;

/** The MSP organization name + partner-portal id. */
export const ORG_NAME = "Northwind Managed IT";
export const ORG_PARTNER_PORTAL_ID = "DAT-PRT-00481";

/** Datto regions / pods. */
export const REGIONS = ["us-east", "us-west", "eu-3", "apac-syd"] as const;
/** SaaS pod identifiers surfaced in throttling / degradation incidents. */
export const SAAS_PODS = [
  "des1-saas-p0",
  "des1-saas-p1",
  "eu3-saas-p2",
  "syd1-saas-p0",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Hostnames (mono in UI). Includes the deliberate cosmetic / edge cases.
// ─────────────────────────────────────────────────────────────────────────────

/** BCDR / endpoint hostnames. ACME-TERMINALSRV01 is >15 chars (cosmetic case). */
export const HOSTNAMES = [
  "btru-fs1",
  "btru-erp1",
  "btru-hv2022",
  "btru-dr-ubt",
  "ACME-DC01",
  "ACME-SQL01",
  "ACME-FS1",
  "ACME-TERMINALSRV01",
  "NWND-SQL02",
  "NWND-NAS01",
  "NWND-APP01",
  "CONTOSO-FS1",
  "CONTOSO-EXCH01",
  "CONTOSO-DC02",
  "NOR-FIPS-APP",
  "NOR-FIPS-DB1",
  "GLBX-HV01",
  "GLBX-FILE01",
  "INITECH-DC01",
  "INITECH-WEB01",
  "UMBRA-WMS01",
  "UMBRA-RDS01",
  "BAC-CORE01",
  "BAC-VAULT01",
] as const;

/**
 * A hostname >50 chars trips the libvirt screenshot-hostname cosmetic failure
 * (agent ≥50, agentless ≥42). Kept here so the failure injector has a real one.
 */
export const LONG_HOSTNAME =
  "ACME-DENTAL-DALLAS-TERMINAL-SERVER-PRODUCTION-RDS-07";

/** Endpoint device names (laptops/desktops). */
export const ENDPOINT_NAMES = [
  "ACME-LT-0042",
  "ACME-LT-0117",
  "CONTOSO-WS-204",
  "NWND-LT-088",
  "GLBX-WS-311",
  "INITECH-LT-019",
  "UMBRA-LT-076",
  "BAC-WS-512",
  "DESKTOP-7K2M1",
  "DESKTOP-LAPTOP",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Appliances
// ─────────────────────────────────────────────────────────────────────────────

/** Appliance hardware models (SIRIS S-series + ALTO). */
export const APPLIANCE_MODELS = ["S5-4", "S5-2", "S4-3", "ALTO 3", "NAS-12"] as const;

/** Appliance display names. */
export const APPLIANCE_NAMES = [
  "SIRIS-NYC-01",
  "SIRIS-DAL-01",
  "SIRIS-CHI-02",
  "SIRIS-LAX-01",
  "ALTO-REMOTE-03",
  "SIRIS-EU3-01",
] as const;

/** IRIS appliance image versions (mono). */
export const IMAGE_VERSIONS = ["IRIS 4.7.2", "IRIS 4.6.9", "IRIS 4.7.0"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Agent / software versions (mono). Some gate known-bad-version logic.
// ─────────────────────────────────────────────────────────────────────────────

export const SHADOWSNAP_VERSIONS = ["ShadowSnap 4.6.1", "ShadowSnap 4.5.8"] as const;
export const DWA_VERSIONS = ["Datto Windows Agent 1.0.9", "Datto Windows Agent 1.0.7"] as const;
export const LINUX_AGENT_VERSIONS = ["Datto Linux Agent 1.9", "Datto Linux Agent 1.8"] as const;
/** DEB endpoint agent builds — 3.0.19.1 / 3.0.41 are known-bad in the research. */
export const DEB_AGENT_VERSIONS = ["3.0.41", "3.0.25.0", "3.0.19.1", "3.0.50"] as const;
export const DEB_KNOWN_BAD_VERSIONS = ["3.0.19.1", "3.0.41"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Operating systems
// ─────────────────────────────────────────────────────────────────────────────

export const OS_LIST_WINDOWS = [
  "Windows Server 2022",
  "Windows Server 2019",
  "Windows Server 2016",
  "Windows 11 Pro",
  "Windows 10 Pro",
] as const;
export const OS_LIST_LINUX = [
  "Ubuntu 22.04 LTS",
  "RHEL 8.8",
  "CentOS 7.9",
  "Debian 12",
] as const;
export const OS_LIST_MACOS = ["macOS 14 Sonoma", "macOS 13 Ventura"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Error strings (mono, verbatim). Grouped by domain so generators can pick a
// realistic code for a given failure category. Includes every code called out
// in the contract §7 + docs/06 §9.5.
// ─────────────────────────────────────────────────────────────────────────────

export const ERROR_STRINGS = {
  bsod: [
    "0x0000007B",
    "stop 0x7B",
    "STOP 0x0000007B (INACCESSIBLE_BOOT_DEVICE)",
    "c000021a",
    "STOP Code c000021a {Fatal System Error}",
    "BOOTMGR is missing",
  ],
  vss: [
    "0x80042315",
    "VSS_E_INSUFFICIENT_STORAGE (0x8004231F)",
    "VSS_E_MAXIMUM_NUMBER_OF_VOLUMES_REACHED (0x80042312)",
    "VSS_E_PROVIDER_VETO (0x80042306)",
    "VSS_E_WRITERERROR_TIMEOUT (0x800423F2)",
    "VSS_E_BAD_STATE (0x80042301)",
    "BKP1410 VSS Promised more data than received",
    "BKP1660 VSS snapshot timeout",
  ],
  comms: [
    "Error 401 (unauthorized)",
    "AGT2016 Unable to get agent due to error 401",
    "AGT0900 Agent pairing failed, will re-attempt",
    "AGT0910/AGT0915 Agent pairing permanently failed",
    "BKP1670/1675 Agent communication failure",
    "BKP0013/BAK0013 Cannot connect to the host",
    "Critical Backup Failure: HTTP Could Not Connect to Host",
  ],
  storage: [
    "BKP0615/BAK1615 Insufficient disk space",
    "BKP2618 Not enough space for full backup",
    "Final error (-8 Not enough storage is available to process this command.)",
    "ZFS4150 ZFS snapshot failed",
    "ZFS3985/ZFS3987 Filesystem mount issues",
    "bk005",
  ],
  bmr: ["Bare Metal Restore encountered an error. (Code 9999)", "Code 9999"],
  share: [
    "SNS003/SNS005 Share snapshot failure",
    "SNS006 NAS share snapshot failed",
    "SNS020 Cannot load share",
  ],
  stale: [
    "BKP4000/4010 Backup wasn't taken in over 24 hours",
    "BKP3031 Backup hung and cannot stop",
    "Unable to start backup because agent service is stopped",
  ],
  aad: ["AADSTS500014", "AADSTS90002", "AADSTS500011", "Doesn't Have a Valid License"],
  graphHttp: [
    "429",
    "503",
    "429 Too Many Requests",
    "503 Service Unavailable",
    "ErrorAccessDenied",
    "ErrorInvalidSyncStateData",
    "OneDriveNotProvisioned",
    "423 Locked",
    "FolderEnumerationUnknownError - Access is denied. Check credentials and try again",
    "0x80010135",
    "Request Entity Too Large",
    "Operation Performed with Inactive User",
    "error 14022",
    "404 (Requested entity was not found)",
  ],
  endpoint: ["bk005", "error -255", "Installation failed with code: 404"],
} as const;

/** Flat list of every error string, for matchers/search. */
export const ALL_ERROR_STRINGS = Object.values(ERROR_STRINGS).flat();

// ─────────────────────────────────────────────────────────────────────────────
// Ports & hosts (surfaced in comms / connectivity failures)
// ─────────────────────────────────────────────────────────────────────────────

export const PORTS = [25566, 25568, 3260, 3262, 443] as const;
export const MOTHERSHIP_HOST = "mothership.dtc.datto.com";

// ─────────────────────────────────────────────────────────────────────────────
// SaaS identity (UPNs, Google domains, Salesforce orgs)
// ─────────────────────────────────────────────────────────────────────────────

/** M365 onmicrosoft / vanity domains. */
export const M365_DOMAINS = [
  "acme.onmicrosoft.com",
  "contoso.onmicrosoft.com",
  "northwind.onmicrosoft.com",
  "spanningdemo.com",
  "globex.onmicrosoft.com",
] as const;

/** Google Workspace domains. */
export const GOOGLE_DOMAINS = [
  "acmedental.com",
  "initech.io",
  "umbralogistics.com",
  "spanningdemo.com",
] as const;

/** Local-parts used to synthesize believable UPNs / mailbox owners. */
export const USER_LOCALPARTS = [
  "jdoe",
  "mhayes",
  "admin",
  "rkapoor",
  "lchen",
  "tokafor",
  "swilliams",
  "pnguyen",
  "dgarcia",
  "afarrell",
  "kobrien",
  "bsingh",
] as const;

/** Salesforce org ids (15/18-char style) + slugs. */
export const SF_ORG_IDS = [
  "00D5x000001AbCdEAF",
  "00D5x000004QrStUAG",
  "00D8a000000ZmNoEAK",
] as const;
export const SF_ORG_SLUGS = ["sf-org-prod", "sf-org-sandbox", "sf-org-uat"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────────────────────

export const TAGS = [
  "prod",
  "sql",
  "dc",
  "exchange",
  "file-server",
  "vip-client",
  "windows",
  "linux",
  "macos",
  "m365",
  "google",
  "hyperv",
  "vmware",
  "encrypted",
  "compliance",
  "remote-site",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// People (techs / approvers) for ActionRun + audit attribution
// ─────────────────────────────────────────────────────────────────────────────

export const USER_NAMES = [
  "Jordan Doe",
  "Mara Hayes",
  "Ravi Kapoor",
  "Lena Chen",
  "Tobi Okafor",
  "Sam Williams",
  "Priya Nguyen",
  "Dana Garcia",
] as const;

/** Mock support-ticket reference prefixes used by opens-ticket outcomes. */
export const SUPPORT_TICKET_PREFIX = "DAT-TKT";
export const VENDOR_INCIDENT_PREFIX = "DAT-INC";
