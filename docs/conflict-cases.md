# Conflict Ground-Truth Cases

These synthetic cases provide a repeatable acceptance set for Duplicate and Conflict classification. Each case uses multi-sentence content shaped like a real knowledge document. Expected labels are maintained in `tests/fixtures/conflict-cases.json` and reviewed before changing thresholds or extraction rules.

| ID | Scenario | Expected relationship | Conflict type | Human review |
| --- | --- | --- | --- | --- |
| CON-01 | Same facts with spacing and punctuation differences | Same | — | No |
| CON-02 | Different titles with substantially repeated content | Possible Duplicate | — | Yes |
| CON-03 | Same service with different prices | Possible Conflict | Price | Yes |
| CON-04 | Same SOP with different required steps | Possible Conflict | Process | Yes |
| CON-05 | Compatible information about the same topic | Complementary | — | No |
| CON-06 | Unrelated subjects | Different Topic | — | No |
| CON-07 | Same event with different deadlines | Possible Conflict | Date | Yes |
| CON-08 | Different services with different prices | Possible Conflict pending human review | Price | Yes |
| CON-09 | Price difference with insufficient conditions | Possible Conflict pending human review | Price | Yes |
| CON-10 | Same support channel with different contact details | Possible Conflict | Contact Info | Yes |
| CON-11 | Same event with different date, price and contact details | Possible Conflict | Price, Date, Contact Info | Yes |
| CON-12 | Highly repeated article with one additional example | Possible Duplicate | — | Yes |

Invalid URL and isolated document-read failures remain covered in `tests/conflicts/test-resolve-document-conflict.js` because they test transport behavior rather than content classification.
