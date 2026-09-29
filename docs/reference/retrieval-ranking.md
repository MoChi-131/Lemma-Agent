# Retrieval Ranking

`search_knowledge_registry` ranks Registry metadata before any document body is read. It is a discovery step: the top eligible result is then passed to `retrieve_knowledge_document`.

## Ranking order

The tool compares signals in this order. It does not combine them into one total score.

| Priority | Signal | Rule |
| --- | --- | --- |
| 1 | Retrieval eligibility | `retrieval_eligible=true` ranks before `false`. By default, ineligible records are filtered out. |
| 2 | Exact match | Full-query title match, then full-query tag match, then an exact individual term match. |
| 3 | Authority | Uses the question's ranking context. |
| 4 | Scope | Prefers the scope appropriate to that context. |
| 5 | Version | Prefers the higher numeric version when earlier signals tie. |
| 6 | Metadata match score | Uses weighted matches across Registry fields. |

## Exact-match rank

| Score | Meaning |
| ---: | --- |
| 3 | The full query exactly equals the document title. |
| 2 | The full query exactly equals one document tag. |
| 1 | At least one query term exactly equals a tag or standalone title term. |
| 0 | No exact match. |

## Authority and scope

Set `ranking_context` when calling `search_knowledge_registry`.

| Authority Level | `business` | `government` |
| --- | ---: | ---: |
| External Official | 1 | 3 |
| Internal Official | 3 | 2 |
| Reference | 2 | 1 |
| Unverified or blank | 0 | 0 |

| Scope | `business` | `government` |
| --- | ---: | ---: |
| Knowledge Base | 2 | 1 |
| External Reference | 1 | 2 |
| Workspace | Not eligible | Not eligible |

Use `business` for normal company products, services, prices, procedures, and internal knowledge. Use `government` for statutory, Housing Authority, government, or official-policy questions. Government context gives an approved `External Official` source priority over internal sources.

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
