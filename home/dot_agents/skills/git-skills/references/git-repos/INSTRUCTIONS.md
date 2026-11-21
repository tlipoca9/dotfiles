---
name: git-repos
description: Clone git repositories from any host (github.com, git.woa.com, ...) into ./.local/<host>/ for reading. Use whenever a task needs to research, analyze, or cite the source code of a remote repository.
---

Read source from a local clone under the current working directory, never from web-rendered repository pages.

## Layout

```text
./.local/<host>/<path>/
```

`<host>` and `<path>` come from the remote URL, lowercased, with any `.git` suffix dropped. `<path>` keeps every group level:

| Remote | Clone directory |
|---|---|
| `https://github.com/mattpocock/skills.git` | `./.local/github.com/mattpocock/skills/` |
| `git@git.woa.com:group/subgroup/repo.git` | `./.local/git.woa.com/group/subgroup/repo/` |

## Steps

1. **Reuse or clone.** Decide first whether the task targets the default branch or a specific tag/version.

   If `./.local/<host>/<path>` already exists:
   - For the default branch: run `git -C <dir> fetch --depth 1 origin && git -C <dir> reset --hard origin/HEAD`. If `origin/HEAD` is missing or unresolved (for example, the clone previously fetched only a tag), discover the default branch with `git -C <dir> ls-remote --symref origin HEAD` (reads `ref: refs/heads/<branch>\tHEAD`), then run `git -C <dir> fetch --depth 1 origin <branch> && git -C <dir> reset --hard FETCH_HEAD`.
   - For a specific tag: run `git -C <dir> fetch --depth 1 origin tag <tag> && git -C <dir> checkout <tag>`. Find tag names with `git ls-remote --tags origin`.

   Otherwise:

   ```bash
   mkdir -p .local/<host>/<parent-of-path>
   git clone --depth 1 https://<host>/<path>.git .local/<host>/<path>
   ```

   Use the exact URL when one is given. If HTTPS authentication fails, retry with `git@<host>:<path>.git`.
   Done when the directory exists and `git -C <dir> rev-parse HEAD` prints the expected commit.

2. **Keep it out of the host repo.** If the working directory is a git repository, make sure `.local/` is listed in `.git/info/exclude` (append it if missing). Leave the host repo's `.gitignore` untouched.

3. **Read, don't edit.** Treat the clone as reference: search with `rg`/Grep, read with Read. Put experiments in a separate directory outside `.local/`.

4. **Cite.** When reporting findings, cite `<host>/<path>`, paths relative to the clone root, and the commit (`git rev-parse --short HEAD`) or tag, so claims stay traceable.
