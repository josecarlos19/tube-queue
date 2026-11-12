const formulaPrefixes = ['=', '+', '-', '@', '\t', '\r'];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^﻿/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',' || character === ';') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function escapeCell(value, { neutralizeFormula = false } = {}) {
  let text = String(value ?? '');
  if (neutralizeFormula && formulaPrefixes.some((prefix) => text.startsWith(prefix))) {
    text = `'${text}`;
  }
  return /[",;\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header, rows, { textColumns = [] } = {}) {
  const lines = [header.map((cell) => escapeCell(cell))];
  for (const row of rows) {
    lines.push(row.map((cell, index) => escapeCell(cell, { neutralizeFormula: textColumns.includes(index) })));
  }
  return `${lines.map((line) => line.join(',')).join('\r\n')}\r\n`;
}
