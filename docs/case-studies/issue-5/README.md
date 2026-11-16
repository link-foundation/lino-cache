# Scoped package publication

## Requirements and verification

- Package metadata and lockfile identify `@link-foundation/lino-cache`.
- Imports, examples, type declaration examples, npm links, and release scripts
  use the scoped package. GitHub repository URLs retain the repository name.
- `publishConfig.access` is `public`, matching the Changesets configuration.
- A patch changeset prepares the next automated release.
- The existing tests import the package by its scoped name, exercising the
  public exports instead of bypassing package resolution with a source path.
- `npm run publish:preflight` runs `npm publish --dry-run`; the lint job runs
  this check on pull requests and main.

## Publication blocker

On 2026-11-16, the publish preflight succeeded for
`@link-foundation/lino-cache@0.2.0` with public access.
An actual `npm publish --access public` attempt failed with:

```text
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in to https://registry.npmjs.org/
```

`npm whoami` also returned `ENEEDAUTH`. No npm authentication token or GitHub
Actions OIDC credentials are available in the development environment, and the
repository has no Actions secrets configured. `npm view
@link-foundation/lino-cache version` returned `E404`.

The first publication and successful registry lookup remain blocked on npm
publishing credentials for the scope. Once those credentials are available,
run `npm run publish:preflight`, `npm publish --access public`, and
`npm view @link-foundation/lino-cache version`. Keep the pull request unmerged
until the registry acceptance criterion is verified. The dry run verifies
packaging; it does not authenticate or establish that npm will accept an actual
publication.
