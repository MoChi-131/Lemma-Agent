# Retrieval Ranking

## Published metadata source

`search_knowledge_registry` and `retrieve_knowledge_document` read **Validated Metadata**, not the working Metadata Registry that colleagues edit. Configure `LARK_VALIDATED_METADATA_URL` and `LARK_VALIDATION_JOURNAL_URL` to the validated table and Journal used by the management agent.

Only a complete, verified publication is available for governed retrieval. During a refresh, use the last published version recorded in Journal. If no verified version is available, report the source as unavailable; do not substitute the working Registry. The web-domain whitelist remains a separate source.


`search_knowledge_registry` ranks internal Lark Registry metadata before any document body is read. It is a discovery step: the top eligible result is then passed to `retrieve_knowledge_document`.

The Registry stores Lark knowledge only. External websites are never Registry records and do not affect Registry ranking. If an answer needs web research, use `get_approved_web_domains` before searching and `check_external_urls` before reading or citing a result.

## Ranking order

The tool compares signals in this order. It does not combine them into one total score.

| Priority | Signal | Rule |
| --- | --- | --- |
| 1 | Retrieval eligibility | `retrieval_eligible=true` ranks before `false`. By default, ineligible records are filtered out. |
| 2 | Exact match | Full-query title match, then full-query tag match, then an exact individual term match. |
| 3 | Authority | `Internal Official` ranks above `Reference`. |
| 4 | Scope | `Knowledge Base` ranks above `Workspace`. |
| 5 | Version | Prefers the higher numeric version when earlier signals tie. |
| 6 | Metadata match score | Uses weighted matches across Registry fields. |

## Exact-match rank

| Score | Meaning |
| ---: | --- |
| 3 | The full query exactly equals the document title. |
| 2 | The full query exactly equals one document tag. |
| 1 | At least one query term exactly equals a tag or standalone title term. |
| 0 | No exact match. |

## Context, authority, and scope

Set `ranking_context` when calling `search_knowledge_registry`.

| Authority Level | `business` | `government` |
| --- | ---: | ---: |
| Internal Official | 3 | 3 |
| Reference | 2 | 2 |
| Unverified or blank | 0 | 0 |

| Scope | Rank |
| --- | ---: |
| Knowledge Base | 2 |
| Workspace | 1 |

Use `business` for normal company products, services, prices, procedures, and internal knowledge. Use `government` for statutory, Housing Authority, government, or official-policy questions. Both contexts rank internal Registry records in the same order. The `government` context tells the agent to use the approved-domain whitelist for current official web evidence; a verified official web result then takes priority in the final answer, outside this Registry ranking.

## Metadata match-score weights

| Field | Points for each matched query term |
| --- | ---: |
| Title | 5 |
| Tags | 4 |
| Primary Domain | 3 |
| Document Type | 3 |
| Scope | 2 |
| Project Name | 2 |
| Workstream | 2 |
| Owner Person | 1 |

For example, the query `冷氣、安裝` gives `冷氣價錢單&安裝PDF` a score of 18 because the terms match its title and tags. If the higher-ranked signals tie, this score places it above other eligible Internal Official Knowledge Base records.

## Returned evidence

Each search result includes:

```json
{
  "match_score": 18,
  "matched_fields": ["title", "tags"],
  "ranking": {
    "exact_match_rank": 1,
    "authority_rank": 3,
    "scope_rank": 2,
    "version_rank": 1
  }
}
```

The ranking explains discovery order. It is not evidence for an answer. The agent must retrieve and cite the selected document before answering factual questions.
