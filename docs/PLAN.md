# Plan

## Objective

Fork the embed package path for a branded conversational widget while avoiding changes to core business logic.

## Working assumption

The upstream embed package is only a thin registration wrapper, while the upstream core package owns rendering, Shadow DOM styling, placement logic, and runtime behavior.

## Strategy

1. Start with a wrapper-first fork.
2. Keep upstream core untouched in phase one.
3. Push brand, alignment, and layout defaults through configuration and wrapper APIs.
4. Add a local demo page before publishing to npm.
5. Only fork selected UI files from core if configuration proves insufficient.

## Phase 1

- Create a local package under the `@conversales` scope.
- Add a bootstrap API for local defaults.
- Define a configuration mapping layer for placement, variant, open state, copy, and style tokens.
- Keep the public API small and stable.

## Phase 2

- Add the upstream widget dependency.
- Register a custom element tag for the branded version.
- Inject project-specific defaults through `override-config` and attributes.
- Verify placement, alignment, compact mode, and expanded mode locally.

## Phase 3

- Add a local browser demo app for manual testing.
- Test the following cases:
  - bottom-right floating widget
  - centered embedded alignment
  - default expanded mode
  - dismissible mode
  - custom colors, radius, and avatar presentation

## Phase 4

- Create the GitHub remote repository.
- Push the initial scaffold.
- Add CI for typecheck and build.
- After local verification, prepare npm publishing metadata.

## Risks

- External page CSS will not fully style the widget internals because the upstream widget renders inside Shadow DOM.
- Major internal layout redesign may require a narrow fork of selected UI components from upstream core.

## Decision rule

If a requested change can be expressed through attributes or config styles, do not fork core.
If a requested change requires changing rendered structure inside the widget, isolate that change in a narrow UI fork later.
