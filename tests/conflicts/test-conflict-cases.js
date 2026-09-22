const { test } = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../fixtures/conflict-cases.json');
const {
  compareDocuments,
  RELATIONSHIPS,
} = require('../../integrations/lark/conflicts/document-comparison');

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
  test(`${item.id}: ${item.description}`, () => {
    const documentA = withUrl(item.document_a, `${item.id.toLowerCase()}-a`);
    const documentB = withUrl(item.document_b, `${item.id.toLowerCase()}-b`);

    assertExpected(compareDocuments(documentA, documentB), item.expected);
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
