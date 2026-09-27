# Knowledge Atlas — Development Environment Setup

This file documents the local tooling required to rebuild the Knowledge Atlas development environment after an OS reinstall or SSD replacement.

The repository is the source of truth for the project. External skills, CLIs, MCP configuration, and shell wrappers are local machine state and must be reinstalled.

## 1. Project

Expected repository location:

```text
~/Personal/dev/knowledge-atlas
```

Keep these project files committed to Git:

- `README.md`
- `AGENTS.md`
- `CONTRACT.md`
- `DESIGN.md`
- `SETUP.md`
- `design-plans/`
- package manifests and lockfiles

Do not rely on Antigravity conversation history as a project backup.

---

## 2. Base tools

On a fresh Arch Linux installation, install the basic tooling:

```bash
sudo pacman -S git mise bun
```

Restart the shell after installing system tools:

```bash
exec zsh
```

Verify:

```bash
git --version
mise --version
bun --version
```

---

## 3. Antigravity design/UX skills

The project uses several design-oriented agent skills.

### Taste Skill

Install the `design-taste-frontend` skill globally:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

The global skills installation is normally under:

```text
~/.agents/skills/
```

Verify the skill directory exists:

```bash
ls ~/.agents/skills/
```

---

### Ibelick UI Skills

Repository:

```text
ibelick/ui-skills
```

Start the UI Skills installer:

```bash
npx ui-skills start
```

Install/select the Antigravity-compatible root skill (`ui-skills-root`) using the installer.

The skill should be available under the global agent skills directory:

```text
~/.agents/skills/ui-skills-root
```

Useful workflow:

- `create-design-md` — inspect the existing frontend and create/review `DESIGN.md`
- `improve-ui` — audit an implemented interface and identify concrete UI improvements

---

### Emil Kowalski Skills

Install:

```bash
npx skills@latest add emilkowalski/skills
```

Select the Antigravity/global installation when prompted.

Useful workflow:

- `find-animation-opportunities` — identify places where motion would improve the interface
- `review-animations` — review implemented motion for quality and restraint

---

## 4. OpenDesign

OpenDesign is installed from source on Linux.

Repository:

```text
https://github.com/nexu-io/open-design
```

Clone it outside the project:

```bash
mkdir -p ~/tools
git clone https://github.com/nexu-io/open-design.git ~/tools/open-design
cd ~/tools/open-design
```

### Required versions

OpenDesign currently expects:

```text
Node.js 24
pnpm 10.33.2
```

The repository uses `mise`.

Run:

```bash
mise trust
mise install
```

Before installing dependencies, make sure `mise.toml` contains:

```toml
[tools]
node = "24"
pnpm = "10.33.2"

[env]
ONNXRUNTIME_NODE_INSTALL_CUDA = "skip"
```

The `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` setting avoids the CUDA/ONNX Runtime installation problem encountered on the local NVIDIA/CUDA setup.

Install dependencies:

```bash
mise exec -- pnpm install
```

Build the web package:

```bash
mise exec -- pnpm --filter @open-design/web build
```

Verify:

```bash
mise exec -- node -v
mise exec -- pnpm -v
```

Expected versions are approximately:

```text
Node v24.x
pnpm 10.33.2
```

---

## 5. OpenDesign CLI wrapper

Linux already has a system command named `od` (`/usr/bin/od`), so OpenDesign's CLI needs a higher-priority wrapper.

Create:

```bash
mkdir -p ~/.local/bin

cat > ~/.local/bin/od <<'EOF'
#!/usr/bin/env bash
cd "$HOME/tools/open-design" || exit 127
exec mise exec -- pnpm exec od "$@"
EOF

chmod +x ~/.local/bin/od
```

Add the local bin directory to `PATH`:

```bash
grep -qxF 'export PATH="$HOME/.local/bin:$PATH"' ~/.zshrc || \
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc

export PATH="$HOME/.local/bin:$PATH"
```

Restart the shell:

```bash
exec zsh
```

Verify that the wrapper wins over `/usr/bin/od`:

```bash
type -a od
od --help
```

The first result should be:

```text
~/.local/bin/od
```

---

## 6. OpenDesign MCP for Antigravity

Install the OpenDesign MCP integration:

```bash
od mcp install antigravity
```

OpenDesign's Antigravity MCP configuration is stored in the Antigravity configuration area.

After installation, restart/reload Antigravity if necessary.

---

## 7. Impeccable

The normal installer currently has a known problem in this environment.

Attempting:

```bash
npx impeccable install
```

may fail with:

```text
Could not verify skill bundle: HTTP 404
Nothing was installed
```

The working recovery path is to build the skill bundle from the official repository.

Clone the repository temporarily:

```bash
git clone https://github.com/pbakaus/impeccable.git /tmp/impeccable
cd /tmp/impeccable
```

Install dependencies:

```bash
npm install
```

Make sure Bun is installed:

```bash
bun --version
```

Build:

```bash
npm run build
```

A successful build produces an Antigravity skill bundle and reports generated commands/detection rules.

Copy the Antigravity skills into the local Antigravity skill directory:

```bash
mkdir -p ~/.gemini/config/skills
cp -r dist/antigravity/.agent/skills/* ~/.gemini/config/skills/
```

Verify:

```bash
ls ~/.gemini/config/skills/
```

Note: the npm CLI package version and the generated skill-bundle version may differ. The generated bundle is the important part for the Antigravity installation.

---

## 8. Current design workflow

The intended workflow for Knowledge Atlas is:

1. Read `AGENTS.md`, `CONTRACT.md`, `README.md`, and `DESIGN.md`.
2. Use Ibelick's `create-design-md` against the existing frontend when `DESIGN.md` needs to be created or refreshed.
3. Design one screen first rather than attempting the entire application at once.
4. Use OpenDesign to create/inspect the visual direction and implementation reference.
5. Implement the screen in Antigravity while respecting the project contract.
6. Run Ibelick's `improve-ui` audit.
7. Apply the concrete UI findings.
8. Use Emil's `find-animation-opportunities`.
9. Implement only useful, intentional motion.
10. Run `review-animations`.
11. Use Impeccable later as a final visual critique/cleanup pass.

The visual direction established for Knowledge Atlas is:

- warm off-white/light background
- editorial serif display headings
- restrained sans-serif UI/body text
- generous whitespace
- quiet navigation
- strong central visual focus
- subtle rounded geometry
- organic/glowing visual elements where appropriate
- muted, premium palette
- minimal buttons and controls
- no generic SaaS card wall
- no default purple AI gradients
- no decorative elements without a purpose
- motion should feel intentional rather than constant

---

## 9. Git recovery and rollback

The project itself should always be recoverable from Git.

Before allowing an agent to make substantial changes:

```bash
git status
```

Inspect changes:

```bash
git diff
```

Discard uncommitted working-tree changes when necessary:

```bash
git restore .
```

If a bad change was committed:

```bash
git log --oneline
git revert <commit>
```

Do not use destructive Git commands blindly when there are changes that need to be preserved.

For major design/implementation work, commit coherent checkpoints so an entire agent run does not become one giant archaeological excavation.

---

## 10. Removing tooling

These tools are intentionally independent of the Knowledge Atlas source tree.

### Taste

Remove its installed skill directory if no longer needed:

```bash
rm -rf ~/.agents/skills/design-taste-frontend
```

### Ibelick

Remove:

```bash
rm -rf ~/.agents/skills/ui-skills-root
```

### Emil

Inspect first:

```bash
find ~/.agents/skills -maxdepth 1 -type d -iname '*emil*'
```

Remove the relevant skill directory after confirming it.

### Impeccable

Remove the installed Impeccable skill directory from:

```text
~/.gemini/config/skills/
```

Inspect before deleting.

### OpenDesign

Remove the source checkout:

```bash
rm -rf ~/tools/open-design
```

Remove the wrapper:

```bash
rm -f ~/.local/bin/od
```

Then remove the OpenDesign `PATH` line from `~/.zshrc`.

If OpenDesign MCP was installed, remove its Antigravity configuration entry using the current OpenDesign MCP configuration/uninstallation instructions.

Do not delete the Knowledge Atlas repository when removing external tooling.

---

## 11. Full SSD-wipe recovery checklist

After reinstalling the OS:

### A. Restore the project

```bash
mkdir -p ~/Personal/dev
cd ~/Personal/dev
git clone <KNOWLEDGE_ATLAS_GIT_URL> knowledge-atlas
cd knowledge-atlas
```

Restore/check:

```bash
git status
```

### B. Install base tools

```bash
sudo pacman -S git mise bun
exec zsh
```

### C. Restore design skills

Install:

- Taste `design-taste-frontend`
- Ibelick `ui-skills-root`
- Emil Kowalski skills
- Impeccable

### D. Restore OpenDesign

Clone to:

```text
~/tools/open-design
```

Then:

```bash
cd ~/tools/open-design
mise trust
mise install
mise exec -- pnpm install
mise exec -- pnpm --filter @open-design/web build
```

Recreate the `~/.local/bin/od` wrapper.

### E. Restore MCP

```bash
od mcp install antigravity
```

### F. Verify

```bash
type -a od
od --help
mise exec -- node -v
mise exec -- pnpm -v
ls ~/.agents/skills/
ls ~/.gemini/config/skills/
```

Then open Knowledge Atlas in Antigravity and verify that the expected skills/MCP integrations are available.

---

## 12. Backup principle

The important distinction is:

**Git backs up the project, not the entire development environment.**

The following should be committed to the repository:

- project source code
- contracts
- agent instructions
- design system documentation
- design plans
- setup/recovery instructions
- dependency lockfiles

The following are machine-local and must be reproducible:

- `~/.agents/skills/`
- `~/.gemini/config/skills/`
- `~/.gemini/antigravity/mcp_config.json`
- `~/.local/bin/od`
- `~/.zshrc` changes
- `~/tools/open-design`

This document exists so those local components can be rebuilt without relying on memory, because apparently computers still expect humans to remember what they installed six months ago.
