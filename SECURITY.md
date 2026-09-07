# Security

Report issues with [GitHub private vulnerability reporting](https://github.com/rainhuang0220/wePaper/security/advisories/new) on this repository. Only the latest release is considered.

## Trust boundaries

- **Public:** catalog, PDFs, reading-status changes, comments, replies, likes. There is no visitor login in v1.6.
- **Secret:** `WEPAPER_SYNC_TOKEN` on `/api/v1/sync/*`. Never put it in the frontend, git, or `VITE_*` variables.
- **Hide:** `#wepaper:private` and collection removal keep a paper off the list and 404 the PDF.

Open comment and status writes are validated (length, enums, parameterized SQL, text rendering). They are not authenticated. Treat the live demo as a small personal library, not a hardened multi-tenant service.

PDFs you sync become downloadable by anyone who can open the catalog. Do not publish a collection of publisher PDFs you are not willing to serve publicly.

Do not open an issue that includes a real sync token or a copy of someone else’s publisher PDF.
