/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import type { Options } from 'acorn';
import { parse } from 'acorn-loose';
import { traverse } from 'estraverse';
import { Node } from 'estree';
import { IParsedNode, ITestSymbols, NodeKind } from '.';

const enum C {
  MemberExpression = 'MemberExpression',
  CallExpression = 'CallExpression',
  TemplateLiteral = 'TemplateLiteral',
  Property = 'Property',
  Literal = 'Literal',
  Identifier = 'Identifier',
}

export const acornOptions: Options = {
  ecmaVersion: 'latest',
  locations: true,
  allowReserved: true,
};

const getStringish = (nameArg: Node | undefined): string | undefined => {
  if (nameArg?.type === C.Literal && typeof nameArg.value === 'string') {
    return nameArg.value;
  }
  if (nameArg?.type === C.TemplateLiteral && nameArg.quasis.length === 1) {
    return nameArg.quasis[0].value.cooked || nameArg.quasis[0].value.raw;
  }
};

export const extractWithAst = (text: string, symbols: ITestSymbols) => {
  const ast = parse(text, acornOptions);

  const interestingName = (name: string) =>
    symbols.suite.includes(name)
      ? NodeKind.Suite
      : symbols.test.includes(name)
      ? NodeKind.Test
      : undefined;
  const stack: { node: Node; r: IParsedNode }[] = [];
  stack.push({ node: undefined, r: { children: [] } } as any);

  traverse(ast as Node, {
    enter(node) {
      if (node.type !== C.CallExpression || node.arguments.length < 2) {
        return;
      }

      let directive: string | undefined;
      let kind: NodeKind | undefined;
      if (node.callee.type === C.Identifier) {
        kind = interestingName(node.callee.name);
      } else if (
        node.callee.type === C.MemberExpression &&
        node.callee.object.type === C.Identifier &&
        node.callee.property.type === C.Identifier
      ) {
        kind = interestingName(node.callee.object.name);
        directive = node.callee.property.name;
      }

      if (kind === undefined) {
        return;
      }

      const name = getStringish(node.arguments[0]);
      if (name === undefined) {
        return;
      }

      const child: IParsedNode = {
        children: [],
        kind,
        startLine: node.loc!.start.line,
        startColumn: node.loc!.start.column + 1,
        endLine: node.loc!.end.line,
        endColumn: node.loc!.end.column + 1,
        name,
      };
      if (directive) {
        child.directive = directive;
      }
      stack[stack.length - 1].r.children.push(child);
      stack.push({ node, r: child });
    },
    leave(node) {
      if (stack[stack.length - 1].node === node) {
        stack.pop();
      }
    },
  });

  return stack[0].r.children;
};
