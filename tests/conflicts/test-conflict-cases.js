const { test } = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../fixtures/conflict-cases.json');
const {
  compareDocuments,
  RELATIONSHIPS,
} = require('../../integrations/lark/conflicts/document-comparison');
const {
  resolveDocumentConflictTool,
} = require('../../tools/lark/conflicts/resolve-document-conflict');

const allowedRelationships = new Set(Object.values(RELATIONSHIPS));

test('ground-truth fixture IDs and expectations are valid', () => {
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  for (const item of cases) {
    assert.match(item.id, /^CON-\d{2}$/);
    assert.ok(allowedRelationships.has(item.expected.relationship));
    assert.ok(Array.isArray(item.expected.conflict_types));
    assert.equal(typeof item.expected.requires_human_review, 'boolean');
  }
});

for (const item of cases) {
  test(`${item.id}: ${item.description}`, async () => {
    const documentA = withUrl(item.document_a, `${item.id.toLowerCase()}-a`);
    const documentB = withUrl(item.document_b, `${item.id.toLowerCase()}-b`);

    if (!item.ai_review) {
      assertExpected(compareDocuments(documentA, documentB), item.expected);
      return;
    }

    const ruleResult = compareDocuments(documentA, documentB);
    assertExpected(ruleResult, item.rule_expected);

    const result = await resolveDocumentConflictTool({
      document_a_url: documentA.url,
      document_b_url: documentB.url,
      use_ai: true,
    }, {
      loadDocument: async (url, id) => ({ ...(url === documentA.url ? documentA : documentB), id }),
      readDecisions: async () => [],
      reviewConflict: async () => item.ai_review,
    });

    assertExpected(result, item.expected);
    assert.equal(result.ai_review.verdict, item.ai_review.verdict);
    assert.equal(result.deterministic_candidate.relationship, item.rule_expected.relationship);
  });
}

function withUrl(document, token) {
  return {
    ...document,
    url: `https://example.larksuite.com/wiki/${token}`,
  };
}

function assertExpected(actual, expected) {
  assert.equal(actual.relationship, expected.relationship);
  assert.deepEqual(actual.conflict_types, expected.conflict_types);
  if (expected.requires_human_review !== undefined) {
    assert.equal(actual.requires_human_review, expected.requires_human_review);
  }
}
