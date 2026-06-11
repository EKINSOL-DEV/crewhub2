//! Slash-command & skill discovery for composer hints (G8, EKI-52).
//!
//! Reads the locations Claude Code itself reads, never executes anything:
//! - `<project>/.claude/commands/*.md` and `<user .claude>/commands/*.md`
//! - `<project>/.claude/skills/*/SKILL.md` and `<user .claude>/skills/*/SKILL.md`
//!
//! Project entries shadow user entries of the same name (first wins).

use crate::engine::types::SlashCommand;
use std::collections::HashSet;
use std::path::Path;

/// `user_claude_dir` is the user-level `.claude` directory (injectable for
/// tests; the provider derives it from its configured root).
pub fn list_slash_commands(
    project_dir: &Path,
    user_claude_dir: Option<&Path>,
) -> Vec<SlashCommand> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<SlashCommand> = Vec::new();
    let mut push = |cmd: SlashCommand| {
        if seen.insert(cmd.name.clone()) {
            out.push(cmd);
        }
    };

    let project_claude = project_dir.join(".claude");
    collect_commands(&project_claude.join("commands"), &mut push);
    collect_skills(&project_claude.join("skills"), &mut push);
    if let Some(user) = user_claude_dir {
        collect_commands(&user.join("commands"), &mut push);
        collect_skills(&user.join("skills"), &mut push);
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn collect_commands(dir: &Path, push: &mut impl FnMut(SlashCommand)) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let Some(name) = path.file_stem().map(|s| s.to_string_lossy().to_string()) else {
            continue;
        };
        push(SlashCommand {
            name,
            description: read_description(&path),
        });
    }
}

fn collect_skills(dir: &Path, push: &mut impl FnMut(SlashCommand)) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let skill_md = entry.path().join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        push(SlashCommand {
            name,
            description: read_description(&skill_md),
        });
    }
}

/// `description:` value from a leading YAML frontmatter block, if any.
fn read_description(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    for line in lines {
        if line.trim() == "---" {
            return None; // frontmatter ended without a description
        }
        if let Some(rest) = line.trim().strip_prefix("description:") {
            let value = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            return (!value.is_empty()).then_some(value);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn write(path: PathBuf, body: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    #[test]
    fn reads_project_commands_skills_and_user_dir_with_shadowing() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("proj");
        let user = dir.path().join("home-claude");

        write(
            project.join(".claude/commands/deploy.md"),
            "---\ndescription: \"Ship it\"\n---\nbody",
        );
        write(project.join(".claude/commands/notes.txt"), "not a command");
        write(
            project.join(".claude/skills/review/SKILL.md"),
            "---\nname: review\ndescription: Review the diff\n---\n",
        );
        // user command, plus one shadowed by the project's "deploy"
        write(user.join("commands/standup.md"), "no frontmatter");
        write(
            user.join("commands/deploy.md"),
            "---\ndescription: user-level deploy\n---\n",
        );

        let cmds = list_slash_commands(&project, Some(&user));
        let names: Vec<&str> = cmds.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["deploy", "review", "standup"]);
        let deploy = cmds.iter().find(|c| c.name == "deploy").unwrap();
        assert_eq!(deploy.description.as_deref(), Some("Ship it")); // project wins
        let standup = cmds.iter().find(|c| c.name == "standup").unwrap();
        assert_eq!(standup.description, None);
    }

    #[test]
    fn missing_dirs_yield_empty_not_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list_slash_commands(&dir.path().join("nowhere"), None).is_empty());
    }
}
