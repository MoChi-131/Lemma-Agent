const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  searchKnowledgeRegistryTool,
} = require('../../tools/lark/knowledge/search-knowledge-registry');

const documents = [
  {
    record_id: 'ac',
    title: 'Panasonic 樂聲冷氣機規格',
    tags: ['冷氣機', '420mm'],
    primary_domain: 'Product',
    document_type: 'Product Spec',
    source_url: 'https://example.larksuite.com/wiki/ac',
    retrieval_eligible: true,
  },
  {
    record_id: 'inspection',
    title: '驗樓服務價錢',
    tags: ['驗樓', '價錢'],
    primary_domain: 'Service',
    source_url: 'https://example.larksuite.com/wiki/inspection',
    retrieval_eligible: true,
  },
  {
    record_id: 'draft',
    title: 'Panasonic draft',
    tags: ['420mm'],
    source_url: 'https://example.larksuite.com/wiki/draft',
    retrieval_eligible: false,
  },
];

const deps = {
  getKnowledgeMetadata: async () => ({ success: true, documents }),
};

test('ranks Registry metadata matches and filters ineligible records by default', async () => {
  const result = await searchKnowledgeRegistryTool({ query: 'Panasonic 420mm' }, deps);

  assert.equal(result.result_count, 1);
  assert.equal(result.results[0].record_id, 'ac');
  assert.deepEqual(result.results[0].matched_fields, ['title', 'tags']);
  assert.equal(result.results[0].retrieval_eligible, true);
});

test('can include ineligible metadata for governance work', async () => {
  const result = await searchKnowledgeRegistryTool({
    query: 'Panasonic',
    retrieval_eligible_only: false,
  }, deps);

  assert.deepEqual(result.results.map(document => document.record_id), ['ac', 'draft']);
});

test('returns an empty result for Wiki fallback when metadata does not match', async () => {
  const result = await searchKnowledgeRegistryTool({ query: '不存在型號' }, deps);
  assert.equal(result.result_count, 0);
  assert.deepEqual(result.results, []);
});
