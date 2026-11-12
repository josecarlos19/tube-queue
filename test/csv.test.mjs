import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../server/services/csv.mjs';

test('parses quoted cells, escaped quotes, semicolons, CRLF and a BOM', () => {
  assert.deepEqual(parseCsv('﻿channel,title\r\n"@a","Say ""hi"", ok"\n@b;Beta\n'), [
    ['channel', 'title'],
    ['@a', 'Say "hi", ok'],
    ['@b', 'Beta']
  ]);
  assert.deepEqual(parseCsv('@last'), [['@last']]);
});

test('quotes special characters and neutralizes formulas only in text columns', () => {
  const text = toCsv(['channel', 'title'], [['@handle', '=HYPERLINK("x")'], ['UC1', 'A, B']], { textColumns: [1] });
  assert.equal(text, 'channel,title\r\n@handle,"\'=HYPERLINK(""x"")"\r\nUC1,"A, B"\r\n');
  assert.deepEqual(parseCsv(text).slice(1), [['@handle', '\'=HYPERLINK("x")'], ['UC1', 'A, B']]);
});
