# AGENT.md

This file provides guidance any AI agent when working with code in this repository.

# References

@README.md
@PROJECT.md

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
1. **Pick** Pick the first item from @PROJECT.md under `Upcoming features, fixes and tasks`
2. **Draft** Draft an action plan for implementation, print out to prompt and to CHANGE.md
3. **Approval** Ask for approval via click prompt
4. **Synchronize** Before every change, synchronize with origin and resolve conflicts when necessary
5. **Branch** Create new branch
6. **Implement**  Implement the change or fix
7. **Test** Test the new configuration via nix eval
8. **Iterate** Iterate if test fails for maximum 3 times, stop and explain if not successful after 3 iterations!
9. **Document** Update project documentation (History and Planned Changes) and update main README.md if necessary
10. **Commit** Stage files, commit change with short commit message
11. **Push** Push to origin
12. **Build** Ask if nixos rebuild switch has to run via click prompt
13. **Merge** Merge to main, remove CHANGE.md there and delete old branch
14. **Next** Ask to proceed with the next upcoming feature / fix / task, if yes, pick it up

### README Changes
Changes on main README.md follow these steps:
1. **Explain** Explain the changes shortly
2. **Update** Update the README.md file
3. **Staging** Add README.md to stage (git)

### Nix Evaluation
When the task is to evaluate the configuration:
1. **Evaluate** Evaluate with nix eval
2. **Provide the result** Provide the output of nix eval
3. **Propose fixes** Propose fixes if there are findings
4. **Update Documentation** Update Evaluation status in @PROJECT.md

### Flake.lock Sanity Check
In case of a flake.lock sanity check:
1. **Evaluate** with nix run github:DeterminateSystems/flake-checker
2. **Provide the result** in shell
3. **Propose fixes**

### Research
When asked to research on a certain topic:
1. Collect relevant information
2. Prepare, structure the information
3. Report the information

**Only read through the nix files where needed**

## Branching

Create a new branch for every feature / fix. Name branch **[feat/]** or **[fix/]**, etc.
Delete the branch local and remote once merged.

## Commits

- Use conventional commit messages (feat:, fix:, chore:, etc.)
- Keep commits focused (one feature/fix per commit)
- **NO CLAUDE CO AUTHER REFERENCE IN COMMIT MESSAGE!**

## When Stuck

- If something isn't working after 2-3 attempts, stop and explain the issue
- Don't keep trying random fixes
- Ask for clarification if requirements are unclear

## Code Changes

- Make minimal changes to accomplish the task
- Don't refactor unrelated code unless asked
- Don't add "nice to have" features
- Preserve existing patterns in the codebase
