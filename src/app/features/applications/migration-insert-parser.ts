/**
 * Reads a single-row Postgres `INSERT INTO ... (cols) VALUES (vals);` statement, the form the
 * existing migration_types rows are kept in, into a column -> value map.
 *
 * Supports what those statements use: '...' strings with '' escapes, NULL, true/false, numbers,
 * and a trailing ::type cast on any value (e.g. '{...}'::jsonb). Anything else is rejected with a
 * message rather than guessed at.
 */
export type SqlValue = string | number | boolean | null;

export function parseInsertStatement(sql: string): Record<string, SqlValue> {
  const text = sql.trim();
  const valuesMatch = /\)\s*values\s*\(/i.exec(text);
  if (!/^insert\s+into\s/i.test(text) || !valuesMatch) {
    throw new Error('Paste a single INSERT INTO … (columns) VALUES (…) statement.');
  }

  const columnsStart = text.indexOf('(');
  if (columnsStart < 0 || columnsStart > valuesMatch.index) throw new Error('Could not find the column list.');
  const columns = text
    .slice(columnsStart + 1, valuesMatch.index)
    .split(',')
    .map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase())
    .filter(Boolean);

  const values = parseValues(text, valuesMatch.index + valuesMatch[0].length);
  if (values.length !== columns.length) {
    throw new Error(`The statement has ${columns.length} columns but ${values.length} values.`);
  }
  const row: Record<string, SqlValue> = {};
  columns.forEach((column, index) => (row[column] = values[index]));
  return row;
}

function parseValues(text: string, start: number): SqlValue[] {
  const values: SqlValue[] = [];
  let i = start;
  const skipSpace = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };

  for (;;) {
    skipSpace();
    let value: SqlValue;
    if (text[i] === "'") {
      let out = '';
      i++;
      for (;;) {
        if (i >= text.length) throw new Error('A quoted value is never closed.');
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += text[i++];
      }
      value = out;
    } else {
      const token = /^[^,)\s]+/.exec(text.slice(i))?.[0] ?? '';
      if (!token) throw new Error(`Unexpected character near position ${i}.`);
      i += token.length;
      const bare = token.replace(/::[\w\s]+$/, '');
      if (/^null$/i.test(bare)) value = null;
      else if (/^true$/i.test(bare)) value = true;
      else if (/^false$/i.test(bare)) value = false;
      else if (/^-?\d+(\.\d+)?$/.test(bare)) value = Number(bare);
      else throw new Error(`Unsupported value "${token}".`);
    }
    skipSpace();
    // Casts such as ::jsonb carry no information we need; the column decides the type.
    while (text.startsWith('::', i)) {
      i += 2;
      const cast = /^[\w]+(\s*\[\])?/.exec(text.slice(i))?.[0] ?? '';
      i += cast.length;
      skipSpace();
    }
    values.push(value);
    if (text[i] === ',') {
      i++;
      continue;
    }
    if (text[i] === ')') return values;
    throw new Error(`Expected "," or ")" near position ${i}.`);
  }
}
