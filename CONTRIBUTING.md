# Contributor Guidelines

## Advice for new contributors

Start small. The PRs most likely to be merged are those that make small, easily reviewed changes with clear and specific intentions.

[Guidelines on Pull Requests](#pull-requests).

It’s a good idea to gauge interest in your intended work by finding the current issue for it or creating a new one yourself. Use GitHub issues to share your intentions and get feedback from the users most likely to appreciate your changes.

You're most likely to have your pull request accepted if it addresses an existing GitHub issue marked with the [good-first-issue](https://github.com/NexorTech/Cloak-desktop/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) tag. These issues are specifically tagged because they’re generally features or bug fixes that can be merged cleanly on a single platform, are lower complexity, and are non-contentious.

Of course, we encourage community developers to work on **any** issue filed on our GitHub. However, if you pick up or create an issue without the “good first issue” tag, please leave a comment so the core team can give guidance—especially for UI-heavy features or issues requiring cross-platform integration.

# Development setup

*(sections below remain largely the same except updated project links and naming)*

## Tips

### Node.js

You'll need a [Node.js](https://nodejs.org/) version matching our current version. Check [`.nvmrc` in the `dev` branch](https://github.com/NexorTech/Cloak-desktop/blob/dev/.nvmrc).

If you use other Node versions, you may need a version manager:

* [nvm](https://github.com/nvm-sh/nvm): run `nvm use` in the project directory to use the version specified in `.nvmrc`.
* [asdf](https://asdf-vm.com/): supports `.nvmrc` directly.
* We use [Yarn Classic](https://classic.yarnpkg.com) as our package manager. Install globally:

  ```sh
  npm install --global yarn
  ```

### Python

You'll need a compatible [Python](https://www.python.org) version. Check [`.tool-versions` in the `dev` branch](https://github.com/NexorTech/Cloak-desktop/blob/dev/.tool-versions).

If you use other Python versions, you may need:

* [asdf](https://asdf-vm.com/): run `asdf install` to use the specified version.

> \[!WARNING]
> `setuptools` was removed in Python 3.12; install it manually:
>
> ```sh
> python -m pip install --upgrade pip setuptools
> ```

*(Keep the rest: Linux/macOS/Windows setup, build instructions, troubleshooting, hot reload, running multiple instances — replace “Session” with “Cloak” where relevant.)*

---

## Build and run

Clone and set up the project:

```sh
git clone https://github.com/NexorTech/Cloak-desktop.git
cd Cloak-desktop
npm install --global yarn      # (only if you don’t already have yarn)
yarn install --frozen-lockfile
yarn build-everything
yarn test                      # Optional, but recommended
yarn start-prod                # Start Cloak!
```

This builds the project and runs it in production mode.

---

## Making changes

Before making a pull request, remember to:

* Write tests! (`yarn test`)
* Format and lint code automatically (configured via `prettier` and `eslint`).
* Use **Conventional Commits** in commit messages.
* Pull strings from `messages.json` instead of hardcoding text.
* Rebase on the latest `dev` branch.
* Keep commits logical, clean, and descriptive.
* Follow the pull request template.

---

## Pull requests

* Confirm `yarn ready` passes locally.
* Only modify `_locales/en/messages.json` for new text; run `yarn build:locales-soft`.
* Avoid submitting pure translation changes (use Crowdin instead).
* Provide a clear commit message: what, why, related issue.
* Keep diffs minimal and relevant.

---

## Production builds

Build production binaries:

```sh
yarn build-everything
yarn build-release
```

Artifacts will be in the `release/` folder.
