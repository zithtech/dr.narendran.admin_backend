import {ESLint, type Linter} from 'eslint';
import {beforeAll, describe, expect, it} from 'vitest';

import realConfig from '../../eslint.config.js';

/**
 * Regression test for the no-string-built-SQL lint rule.
 *
 * This rule is a SECURITY CONTROL, not a style preference - it is the
 * mechanical enforcement of "every value is a $1 parameter". A subtly wrong
 * esquery selector silently matches nothing, and a rule that matches nothing
 * looks exactly like a codebase with no violations. That failure mode is
 * invisible in CI, so it gets a test.
 *
 * The rule options are read out of the real eslint.config.ts rather than
 * duplicated here, so this cannot drift away from what actually runs.
 */

let lint: (code: string) => Promise<number[]>;

beforeAll(() => {
  const configs = realConfig as unknown as Linter.Config[];

  const ruleEntry = configs
    .map(entry => entry.rules?.['no-restricted-syntax'])
    .find(rule => rule !== undefined);

  expect(
    ruleEntry,
    'no-restricted-syntax is missing from eslint.config.ts - the SQL injection guard is gone',
  ).toBeDefined();

  const eslint = new ESLint({
    /* Ignore the project config and apply only the rule under test, so this
       asserts the selector's behaviour rather than the whole ruleset. The rule
       is purely syntactic, so plain JS exercises it identically to TS. */
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.js'],
        rules: {'no-restricted-syntax': ruleEntry},
      },
    ],
  });

  lint = async (code: string) => {
    const [result] = await eslint.lintText(code, {filePath: 'probe.js'});
    return (result?.messages ?? []).map(message => message.line);
  };
});

describe('SQL injection lint rule', () => {
  it('ALLOWS interpolating a SCREAMING_SNAKE_CASE column constant', async () => {
    const lines = await lint(
      'query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);',
    );
    expect(lines).toEqual([]);
  });

  it('ALLOWS a template literal with no interpolation at all', async () => {
    const lines = await lint('query(`SELECT 1 FROM users`);');
    expect(lines).toEqual([]);
  });

  it('ALLOWS an ordinary parameterised string', async () => {
    const lines = await lint(
      "query('SELECT * FROM users WHERE id = $1', [id]);",
    );
    expect(lines).toEqual([]);
  });

  it.each([
    ['a bare variable', 'query(`SELECT * FROM users WHERE email = ${email}`);'],
    [
      'a quoted variable',
      "query(`SELECT * FROM users WHERE email = '${email}'`);",
    ],
    [
      'user-controlled member access',
      'query(`SELECT * FROM users ORDER BY ${req.query.sort}`);',
    ],
    ['a computed expression', "query(`SELECT * FROM u WHERE x = ${a + 'b'}`);"],
    ['a function call', 'query(`SELECT * FROM u WHERE x = ${escape(v)}`);'],
    [
      'a lowercase local (not provably constant)',
      'query(`SELECT ${cols} FROM users`);',
    ],
    ['queryOne as well as query', 'queryOne(`SELECT ${x} FROM users`);'],
    [
      'the transaction client method form',
      'tx.query(`SELECT * FROM users WHERE id = ${id}`);',
    ],
  ])('REJECTS %s', async (_label, code) => {
    const lines = await lint(code);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('flags every offending interpolation, not just the first', async () => {
    const lines = await lint(
      'query(`SELECT * FROM users WHERE a = ${a} AND b = ${b}`);',
    );
    expect(lines).toHaveLength(2);
  });
});
