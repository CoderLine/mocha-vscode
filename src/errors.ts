/*---------------------------------------------------------
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

/** Errors with a human-readable message. */
export class HumanError extends Error {}

export class ConfigProcessReadError extends HumanError {
  constructor(output: string) {
    super(`Could not read .mocharc configuration: ${output}`);
  }
}

export class TestProcessExitedError extends HumanError {
  constructor(code: number | null) {
    super(`Test process exited with code ${code}`);
  }
}

export class EvaluationProcessExitedError extends HumanError {
  constructor(code: number | null) {
    super(`Evaluation process exited with code ${code}`);
  }
}
