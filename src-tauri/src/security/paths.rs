use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Read,
    ReadWrite,
}

#[derive(Debug, Error)]
pub enum PathPolicyError {
    #[error("path is outside all allowed roots: {0}")]
    OutsideRoots(PathBuf),
    #[error("write access denied for read-only root: {0}")]
    ReadOnly(PathBuf),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Default)]
pub struct PathPolicy {
    roots: Vec<(PathBuf, Access)>,
}

impl PathPolicy {
    pub fn allow(&mut self, root: impl Into<PathBuf>, access: Access) -> &mut Self {
        let root = root.into();
        let canon = root.canonicalize().unwrap_or(root);
        self.roots.push((canon, access));
        self
    }

    /// Canonicalizes `candidate` (resolving symlinks and `..`) and checks containment.
    pub fn validate(&self, candidate: &Path, wanted: Access) -> Result<PathBuf, PathPolicyError> {
        // Canonicalize the file itself if it exists, else its parent + file name,
        // so that paths about to be created can be validated too.
        let canon = match candidate.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                let parent = candidate
                    .parent()
                    .ok_or_else(|| PathPolicyError::OutsideRoots(candidate.into()))?;
                let canon_parent = parent
                    .canonicalize()
                    .map_err(|_| PathPolicyError::OutsideRoots(candidate.into()))?;
                let name = candidate
                    .file_name()
                    .ok_or_else(|| PathPolicyError::OutsideRoots(candidate.into()))?;
                canon_parent.join(name)
            }
        };
        let mut best: Option<Access> = None;
        for (root, access) in &self.roots {
            if canon.starts_with(root) {
                best = Some(*access);
                if *access == Access::ReadWrite {
                    break;
                }
            }
        }
        match best {
            None => Err(PathPolicyError::OutsideRoots(canon)),
            Some(Access::Read) if wanted == Access::ReadWrite => {
                Err(PathPolicyError::ReadOnly(canon))
            }
            Some(_) => Ok(canon),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp() -> PathBuf {
        tempfile::tempdir().unwrap().keep()
    }

    #[test]
    fn allows_file_inside_root() {
        let root = tmp();
        fs::write(root.join("a.txt"), "x").unwrap();
        let mut p = PathPolicy::default();
        p.allow(&root, Access::Read);
        assert!(p.validate(&root.join("a.txt"), Access::Read).is_ok());
    }

    #[test]
    fn rejects_dotdot_traversal() {
        let root = tmp();
        fs::create_dir(root.join("sub")).unwrap();
        let mut p = PathPolicy::default();
        p.allow(root.join("sub"), Access::Read);
        fs::write(root.join("secret.txt"), "x").unwrap();
        let escape = root.join("sub").join("..").join("secret.txt");
        assert!(matches!(
            p.validate(&escape, Access::Read),
            Err(PathPolicyError::OutsideRoots(_))
        ));
    }

    #[test]
    fn rejects_symlink_escape() {
        let root = tmp();
        let outside = tmp();
        fs::write(outside.join("target.txt"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.join("target.txt"), root.join("link.txt")).unwrap();
        let mut p = PathPolicy::default();
        p.allow(&root, Access::Read);
        assert!(matches!(
            p.validate(&root.join("link.txt"), Access::Read),
            Err(PathPolicyError::OutsideRoots(_))
        ));
    }

    #[test]
    fn write_denied_on_readonly_root() {
        let root = tmp();
        fs::write(root.join("a.txt"), "x").unwrap();
        let mut p = PathPolicy::default();
        p.allow(&root, Access::Read);
        assert!(matches!(
            p.validate(&root.join("a.txt"), Access::ReadWrite),
            Err(PathPolicyError::ReadOnly(_))
        ));
    }

    #[test]
    fn nonexistent_file_validated_via_existing_parent() {
        let root = tmp();
        let mut p = PathPolicy::default();
        p.allow(&root, Access::ReadWrite);
        assert!(p
            .validate(&root.join("new-file.txt"), Access::ReadWrite)
            .is_ok());
    }
}
