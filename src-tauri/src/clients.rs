//! Registry of accepted API clients.
//!
//! Every caller of the HTTP API is a registered *client* with a stable id and
//! a display name. Clients authenticate with an HS256 credential (see
//! `crate::jwt`) whose `sub` is their id. Revocation and reissue are recorded
//! here, so a credential is only as good as the registry says:
//!
//! - **revoked** clients are rejected outright;
//! - **reissue** bumps `issued_at`, so every credential minted before it
//!   (`iat < issued_at`) is dead, without rotating anybody else's.
//!
//! Two clients are built in and registered on first start: `web-ui` (the
//! browser frontend) and `tui`. Their credentials are written to
//! `clients/<name>.jwt` in the config dir so the Vite dev server and the TUI
//! can pick them up; user-registered clients are shown their credential once
//! and it is never stored.

use std::path::Path;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const WEB_UI: &str = "web-ui";
pub const TUI: &str = "tui";
pub const BUILTIN_NAMES: [&str; 2] = [WEB_UI, TUI];

const MAX_NAME_LEN: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Client {
    pub id: Uuid,
    pub name: String,
    /// Registered automatically (`web-ui`, `tui`); credential kept in a file.
    pub builtin: bool,
    /// Unix seconds.
    pub created_at: i64,
    /// Credentials with `iat` below this are rejected. Bumped by reissue.
    pub issued_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<i64>,
}

impl Client {
    pub fn is_revoked(&self) -> bool {
        self.revoked_at.is_some()
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientRegistry {
    #[serde(default)]
    pub clients: Vec<Client>,
}

/// Current unix time in seconds.
pub fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Trim and validate a client name: 1–64 chars, no control characters.
pub fn validate_name(raw: &str) -> Result<String, String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err("client name must not be empty".into());
    }
    if name.chars().count() > MAX_NAME_LEN {
        return Err(format!(
            "client name must be at most {MAX_NAME_LEN} characters"
        ));
    }
    if name.chars().any(char::is_control) {
        return Err("client name must not contain control characters".into());
    }
    Ok(name.to_string())
}

impl ClientRegistry {
    /// Load from `path`; a missing file is an empty registry.
    pub fn load(path: &Path) -> Result<Self, String> {
        match std::fs::read_to_string(path) {
            Ok(text) => serde_json::from_str(&text)
                .map_err(|e| format!("cannot parse {}: {e}", path.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(format!("cannot read {}: {e}", path.display())),
        }
    }

    /// Persist atomically with owner-only permissions.
    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?;
        crate::auth::write_private_atomic(path, &json)
    }

    pub fn find(&self, id: Uuid) -> Option<&Client> {
        self.clients.iter().find(|c| c.id == id)
    }

    pub fn find_by_name(&self, name: &str) -> Option<&Client> {
        self.clients
            .iter()
            .find(|c| c.name.eq_ignore_ascii_case(name.trim()))
    }

    fn find_mut(&mut self, id: Uuid) -> Result<&mut Client, String> {
        self.clients
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| format!("unknown client {id}"))
    }

    /// Add the built-in clients that are missing. Returns whether anything changed.
    pub fn ensure_builtins(&mut self, now: i64) -> bool {
        let mut changed = false;
        for name in BUILTIN_NAMES {
            if self.find_by_name(name).is_none() {
                self.clients.push(Client {
                    id: Uuid::new_v4(),
                    name: name.to_string(),
                    builtin: true,
                    created_at: now,
                    issued_at: now,
                    revoked_at: None,
                });
                changed = true;
            }
        }
        changed
    }

    /// Register a new (non-built-in) client. Names are unique, case-insensitively.
    pub fn register(&mut self, raw_name: &str, now: i64) -> Result<Client, String> {
        let name = validate_name(raw_name)?;
        if self.find_by_name(&name).is_some() {
            return Err(format!("a client named \"{name}\" already exists"));
        }
        let client = Client {
            id: Uuid::new_v4(),
            name,
            builtin: false,
            created_at: now,
            issued_at: now,
            revoked_at: None,
        };
        self.clients.push(client.clone());
        Ok(client)
    }

    /// Revoke: every credential of this client stops working. Idempotent.
    pub fn revoke(&mut self, id: Uuid, now: i64) -> Result<Client, String> {
        let client = self.find_mut(id)?;
        if client.revoked_at.is_none() {
            client.revoked_at = Some(now);
        }
        Ok(client.clone())
    }

    /// Reissue: un-revoke and bump `issued_at` so that every credential minted
    /// before this call is rejected. The bump is strictly increasing even when
    /// two reissues land in the same second — otherwise a credential issued a
    /// moment earlier would satisfy `iat >= issued_at` and survive.
    pub fn reissue(&mut self, id: Uuid, now: i64) -> Result<Client, String> {
        let client = self.find_mut(id)?;
        client.issued_at = now.max(client.issued_at + 1);
        client.revoked_at = None;
        Ok(client.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_builtins_adds_web_ui_and_tui_once() {
        let mut reg = ClientRegistry::default();
        assert!(reg.ensure_builtins(100));
        assert_eq!(reg.clients.len(), 2);
        assert!(reg.clients.iter().all(|c| c.builtin));
        assert!(reg.find_by_name("web-ui").is_some());
        assert!(
            reg.find_by_name("TUI").is_some(),
            "lookup is case-insensitive"
        );
        assert!(!reg.ensure_builtins(200), "second call is a no-op");
        assert_eq!(reg.clients.len(), 2);
    }

    #[test]
    fn register_validates_and_dedupes_names() {
        let mut reg = ClientRegistry::default();
        reg.ensure_builtins(1);
        let c = reg.register("  ci-script ", 5).unwrap();
        assert_eq!(c.name, "ci-script");
        assert!(!c.builtin);
        assert_eq!((c.created_at, c.issued_at, c.revoked_at), (5, 5, None));

        assert!(reg.register("CI-SCRIPT", 6).is_err(), "duplicate, any case");
        assert!(
            reg.register("web-ui", 6).is_err(),
            "cannot shadow a built-in"
        );
        assert!(reg.register("   ", 6).is_err());
        assert!(reg.register("bad\nname", 6).is_err());
        assert!(reg.register(&"x".repeat(65), 6).is_err());
        assert!(reg.register(&"x".repeat(64), 6).is_ok());
    }

    #[test]
    fn revoke_is_idempotent_and_reissue_clears_it() {
        let mut reg = ClientRegistry::default();
        let c = reg.register("a", 10).unwrap();
        let r1 = reg.revoke(c.id, 20).unwrap();
        assert_eq!(r1.revoked_at, Some(20));
        let r2 = reg.revoke(c.id, 30).unwrap();
        assert_eq!(r2.revoked_at, Some(20), "first revocation time is kept");

        let re = reg.reissue(c.id, 40).unwrap();
        assert_eq!(re.revoked_at, None);
        assert_eq!(re.issued_at, 40);
    }

    #[test]
    fn reissue_is_strictly_increasing_within_the_same_second() {
        let mut reg = ClientRegistry::default();
        let c = reg.register("a", 100).unwrap();
        let first = reg.reissue(c.id, 100).unwrap();
        assert_eq!(
            first.issued_at, 101,
            "same-second reissue still invalidates"
        );
        let second = reg.reissue(c.id, 100).unwrap();
        assert_eq!(second.issued_at, 102);
        let later = reg.reissue(c.id, 500).unwrap();
        assert_eq!(later.issued_at, 500);
    }

    #[test]
    fn unknown_ids_are_errors() {
        let mut reg = ClientRegistry::default();
        let id = Uuid::new_v4();
        assert!(reg.revoke(id, 1).is_err());
        assert!(reg.reissue(id, 1).is_err());
        assert!(reg.find(id).is_none());
    }

    #[test]
    fn save_and_load_roundtrip_and_missing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("clients.json");
        assert_eq!(
            ClientRegistry::load(&path).unwrap(),
            ClientRegistry::default()
        );

        let mut reg = ClientRegistry::default();
        reg.ensure_builtins(7);
        let c = reg.register("script", 8).unwrap();
        reg.revoke(c.id, 9).unwrap();
        reg.save(&path).unwrap();

        let loaded = ClientRegistry::load(&path).unwrap();
        assert_eq!(loaded, reg);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn corrupt_registry_load_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clients.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert!(ClientRegistry::load(&path).is_err());
    }
}
