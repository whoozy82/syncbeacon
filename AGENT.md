# AGENT.md

This file provides guidance to any AI agent when working with code in this repository.

# References

@README.md
@IMPLEMENTATION.md
@HISTORY.md
@BACKLOG.md

# Interaction Guidelines

## Communication

- Be concise and direct, do not ramble
- Explain non-obvious decisions briefly
- Ask before large refactors or architectural changes
- Don't work on changes that are not requested, but point them out if something arises 
- Never delete files without clarification
- General questions will directly be answered, no CLI commands or file changes

## Workflow

### Nix Configuration Update
This is the common workflow that we will use for changes on nix configuration files:
1. **Pick** Pick from @PROJECT/BACKLOG.md `Currently working on` and if cleared, first entry under `Backlog`
2. **Draft** Draft an action plan for implementation, print out to prompt and to @PROJECT/CHANGE.md
3. **Approval** Ask for approval via click prompt
4. **Synchronize** Before every change, synchronize with origin and resolve conflicts when necessary
5. **Branch** Create new branch
6. **Implement**  Implement the change or fix
7. **Test** Test the new configuration via test scripts under @scripts/
8. **Iterate** Iterate if test fails for maximum 3 times, then stop and explain
9. **Version Bump** Increase the version via `scripts/bump-version.sh major|minor|patch` (updates metadata.json, README badge, HISTORY.md)
10. **Document** Update project documentation (History and Backlog) and update main README.md if necessary
11. **Commit** Stage files, commit change with short commit message
12. **Push** Push to origin
13. **Merge** Merge to main, remove CHANGE.md there, tag via `scripts/bump-version.sh --tag` and delete old branch
14. **Build** Ask if the externsion shall be build on this client via click prompt

### README Changes
Changes on main README.md follow these steps:
1. **Explain** Explain the changes shortly
2. **Update** Update the README.md file
3. **Staging** Add README.md to stage (git)

### Research
When asked to research on a certain topic:
1. Collect relevant information
2. Prepare, structure the information
3. Report the information

## Branching

Create a new branch for every feature / fix. Name branch **[feat/]** or **[fix/]**, etc.
Delete the branch local and remote once merged.

## Commits

- Use conventional commit messages (feat:, fix:, chore:, etc.)
- Keep commits focused (one feature/fix per commit)
- **NO CLAUDE CO AUTHER REFERENCE IN COMMIT MESSAGE!**

## When Stuck

- If something isn't working after 3 attempts, stop and explain the issue
- Don't keep trying random fixes
- Ask for clarification if requirements are unclear

## Code Changes

- Make minimal changes to accomplish the task
- Don't refactor unrelated code unless asked
- Don't add "nice to have" features
- Preserve existing patterns in the codebase
