/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import type * as vscode from 'vscode';
import { CompiledFileTests } from '../../runner';

/** Minimal mock that satisfies the subset of vscode.TestItem used by CompiledFileTests. */
function mockTestItem(id: string, childItems: vscode.TestItem[] = []): vscode.TestItem {
  const childMap = new Map<string, vscode.TestItem>();
  for (const child of childItems) {
    childMap.set(child.id, child);
  }
  return {
    id,
    label: id,
    children: {
      get: (key: string) => childMap.get(key),
      size: childMap.size,
    },
  } as unknown as vscode.TestItem;
}

describe('CompiledFileTests', () => {
  const FILE = '/project/out/test.js';

  function buildTree() {
    const cft = new CompiledFileTests();

    const test1 = mockTestItem('test1');
    const test2 = mockTestItem('test2');
    const innerSuite = mockTestItem('innerSuite', [mockTestItem('deep')]);
    const suite = mockTestItem('suite', [test1, test2, innerSuite]);
    const fileItem = mockTestItem('file', [suite]);

    cft.push(FILE, fileItem);
    return { cft, fileItem, suite, test1, test2, innerSuite };
  }

  describe('lookup', () => {
    it('returns the exact item for a fully matching path', () => {
      const { cft, test1 } = buildTree();
      expect(cft.lookup(FILE, ['suite', 'test1'])).to.equal(test1);
    });

    it('returns a nested item through multiple levels', () => {
      const { cft, innerSuite } = buildTree();
      const deep = innerSuite.children.get('deep');
      expect(cft.lookup(FILE, ['suite', 'innerSuite', 'deep'])).to.equal(deep);
    });

    it('returns undefined when no path segment matches at all', () => {
      const { cft } = buildTree();
      expect(cft.lookup(FILE, ['nonExistent'])).to.be.undefined;
    });

    it('falls back to the deepest matched ancestor for an unresolvable tail', () => {
      const { cft, suite } = buildTree();
      expect(cft.lookup(FILE, ['suite', 'dynamicTest'])).to.equal(suite);
    });

    it('falls back to the deepest match when multiple trailing segments are missing', () => {
      const { cft, suite } = buildTree();
      expect(cft.lookup(FILE, ['suite', 'dynamic', 'nested'])).to.equal(suite);
    });

    it('falls back several levels deep when the leaf is missing', () => {
      const { cft, innerSuite } = buildTree();
      expect(cft.lookup(FILE, ['suite', 'innerSuite', 'missingLeaf'])).to.equal(innerSuite);
    });

    it('returns the suite when a hook path is encountered', () => {
      const { cft, suite } = buildTree();
      expect(cft.lookup(FILE, ['suite', '"before all" hook'])).to.equal(suite);
    });

    it('returns the suite for "after each" hooks', () => {
      const { cft, suite } = buildTree();
      expect(cft.lookup(FILE, ['suite', '"after each" hook for test1'])).to.equal(suite);
    });

    it('looks up across all files when no file hint is provided', () => {
      const { cft, test2 } = buildTree();
      expect(cft.lookup(undefined, ['suite', 'test2'])).to.equal(test2);
    });

    it('returns undefined when the file hint does not match any registered file', () => {
      const { cft } = buildTree();
      expect(cft.lookup('/other/file.js', ['suite', 'test1'])).to.be.undefined;
    });

    it('returns the file-level item when path is empty', () => {
      const { cft, fileItem } = buildTree();
      expect(cft.lookup(FILE, [])).to.equal(fileItem);
    });
  });
});
