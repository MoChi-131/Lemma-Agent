# Knowledge Registry

Lemma reads the published **Validated Metadata** Base and its publication Journal; it never falls back to colleagues' working Registry.

## Required configuration

```dotenv
LARK_VALIDATED_METADATA_URL=https://tenant.larksuite.com/base/...
LARK_VALIDATION_JOURNAL_URL=https://tenant.larksuite.com/base/...
```

Optional: `LARK_WHITELIST_URL` overrides the external-domain whitelist source.

## Retrieval rule

1. `search_knowledge_registry`
2. `retrieve_knowledge_document` for the selected eligible result
3. Use `search_lark_wiki` only as a fallback

A Knowledge Base record is eligible only when complete, `Approved`, and `Internal Official` or `Reference`. Workspace records are not formal knowledge-retrieval sources.

External websites are separate from the Registry. Call `get_approved_web_domains`, restrict search to those domains, then call `check_external_urls` before reading or citing a URL.

## Commands

```powershell
npm.cmd run test:knowledge-registry
npm.cmd run test:base:live
```
