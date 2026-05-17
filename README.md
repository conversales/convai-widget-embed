![hero](assets/hero.png)

# Conversales SDK

Build multimodal voice and text experiences with [Conversales](https://conversales.in). This workspace contains client libraries, widgets, shared types, and example apps for web and mobile.

## Available Packages

| Package | Purpose |
| ------- | ------- |
| [Client](packages/client/README.md) | JavaScript/TypeScript client library |
| [React](packages/react/README.md) | React hooks and components |
| [React Native](packages/react-native/README.md) | React Native companion SDK |
| [Types](packages/types/README.md) | Shared generated types |
| [Widget Core](packages/convai-widget-core/) | Core widget library for embedding agents |
| [Widget Embed](packages/convai-widget-embed/) | Pre-bundled embeddable widget |

## Getting Started

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run dev
```

## Development Setup

This project uses [Turbo](https://turborepo.com) and pnpm to manage dependencies.

```bash
# Install pnpm globally
npm install -g pnpm

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test

# Start development mode
pnpm run dev

# If the change needs a note in the changelog / release nodes, create a changeset
pnpm run changeset
```

## Examples

- [Agent Testbench](examples/agent-testbench/README.md)
- [React Native Expo Example](examples/react-native-expo/README.md)

## Support

- [Website](https://conversales.in)
- Review package-specific READMEs under `packages/`
- Review example apps under `examples/`

### Creating a New Package

```bash
pnpm run create --name=my-new-package
```

### Releasing

We're using [Changesets](https://github.com/changesets/changesets) to coordinate changelog entries and release notes and as such, there's no more need to create per-package tags when preparing a release.

Simply merge the latest "Version Packages" PR opened by the Changesets action.

See the [Changesets documentation](https://github.com/changesets/changesets/blob/main/docs/common-questions.md) for answers to common questions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Engineered by Conversales
