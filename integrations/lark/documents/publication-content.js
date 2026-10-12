const { isDeepStrictEqual } = require('node:util');

const TEXT_KINDS = {
  2: 'text', 3: 'heading1', 4: 'heading2', 5: 'heading3', 6: 'heading4', 7: 'heading5',
  8: 'heading6', 9: 'heading7', 10: 'heading8', 11: 'heading9',
  12: 'bullet', 13: 'ordered', 14: 'code', 15: 'quote', 17: 'todo',
};

function childIds(block) {
  const children = block.children || block.table?.cells || [];
  if (!Array.isArray(children)) throw new Error('Invalid document child blocks.');
  if (block.table?.cells && block.children && !isDeepStrictEqual(block.table.cells, block.children)) {
    throw new Error('Table cell order differs from its child order.');
  }
  return children;
}

/** Compare readable content and structure, independent of generated IDs/default styles. */
function contentTree(blocks, roots) {
  if (!Array.isArray(blocks) || !Array.isArray(roots) || !roots.length || blocks.length > 1000) {
    throw new Error('Document must contain between 1 and 1000 supported blocks.');
  }
  const byId = new Map(blocks.map(block => [block.block_id, block]));
  if (byId.size !== blocks.length || byId.has(undefined)) throw new Error('Invalid or duplicate block IDs.');
  const seen = new Set();
  function visit(id, depth = 0) {
    const block = byId.get(id);
    if (!block || seen.has(id) || depth > 50) throw new Error('Incomplete or cyclic document blocks.');
    seen.add(id);
    const type = block.block_type;
    const kind = TEXT_KINDS[type];
    const result = { type };
    if (kind) {
      const text = block[kind];
      if (!text || !Array.isArray(text.elements)) throw new Error('Missing document text elements.');
      // Merge adjacent runs so server-side run splitting does not cause false mismatches.
      result.runs = [];
      for (const element of text.elements) {
        if (!element.text_run || typeof element.text_run.content !== 'string') {
          throw new Error('Only ordinary text and Markdown links are supported in this version.');
        }
        const { content, text_element_style: style = {} } = element.text_run;
        const format = {
          bold: !!style.bold, italic: !!style.italic, strikethrough: !!style.strikethrough,
          inline_code: !!style.inline_code, link: style.link?.url || '',
        };
        const previous = result.runs.at(-1);
        if (previous && isDeepStrictEqual(previous.format, format)) previous.content += content;
        else result.runs.push({ content, format });
      }
      if (type === 17) result.done = !!text.style?.done;
      if (type === 14) result.language = text.style?.language || 0;
    } else if (type === 31) {
      const property = block.table?.property;
      if (!Number.isInteger(property?.row_size) || !Number.isInteger(property?.column_size) ||
          property.row_size < 1 || property.column_size < 1 ||
          childIds(block).length !== property.row_size * property.column_size) {
        throw new Error('Incomplete table dimensions or cells.');
      }
      result.rows = property.row_size;
      result.columns = property.column_size;
    } else if (![22, 32].includes(type)) {
      throw new Error(`Unsupported document block type ${type}; images and original attachments are not saved.`);
    }
    if (type === 32 && !childIds(block).length) throw new Error('A table cell must contain a text block, even when empty.');
    result.children = childIds(block).map(child => visit(child, depth + 1));
    return result;
  }
  const tree = roots.map(id => visit(id));
  if (seen.size !== blocks.length) throw new Error('Document contains unconnected blocks.');
  return tree;
}

function prepareConvertedContent(converted) {
  if (converted.block_id_to_image_urls?.length) throw new Error('Image uploads are not supported by this writer.');
  const copy = structuredClone(converted);
  if (!Array.isArray(copy.blocks)) throw new Error('Invalid Markdown conversion response.');
  for (const block of copy.blocks) {
    delete block.parent_id;
    if (block.table) {
      const mergeInfo = block.table.property?.merge_info || block.table.merge_info || [];
      if (!Array.isArray(mergeInfo) || mergeInfo.flat(Infinity).some(cell => cell.row_span > 1 || cell.col_span > 1)) {
        throw new Error('Merged table cells are not supported; use an ordinary table in the reviewed draft.');
      }
      delete block.table.merge_info;
      if (block.table.property) delete block.table.property.merge_info;
    }
  }
  const expected = contentTree(copy.blocks, copy.first_level_block_ids);
  return { converted: { blocks: copy.blocks, first_level_block_ids: copy.first_level_block_ids }, expected };
}

function verifyContent(blocks, documentId, expected) {
  const root = blocks.find(block => block.block_id === documentId && block.block_type === 1);
  if (!root) throw new Error('Read-back is missing the document root.');
  const actual = contentTree(blocks.filter(block => block !== root), childIds(root));
  if (!isDeepStrictEqual(actual, expected)) throw new Error('Read-back content or structure differs from the reviewed draft.');
}

module.exports = { prepareConvertedContent, verifyContent };
