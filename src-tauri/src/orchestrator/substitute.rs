//! `{{name}}` substitution — ONE syntax shared by prompt scaffolds, prompt
//! templates and sequence steps (D-M4-8). Missing variables are a typed
//! error, never a silent empty string. `previous_output` is just a reserved
//! variable name supplied by the sequence executor (T6).

/// Reserved variable name carrying the prior sequence step's result text.
pub const PREVIOUS_OUTPUT_VAR: &str = "previous_output";

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SubstituteError {
    #[error("unknown variable {{{{{0}}}}}")]
    UnknownVariable(String),
}

/// Replace every `{{name}}` in `template` from `vars`. Text without
/// well-formed `{{…}}` slots passes through verbatim (a lone `{{` with no
/// closing braces is literal text, matching the TS `renderTemplate`).
pub fn substitute(template: &str, vars: &[(&str, &str)]) -> Result<String, SubstituteError> {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        match after.find("}}") {
            Some(end) => {
                let name = after[..end].trim();
                let value = vars
                    .iter()
                    .find(|(k, _)| *k == name)
                    .map(|(_, v)| *v)
                    .ok_or_else(|| SubstituteError::UnknownVariable(name.to_string()))?;
                out.push_str(&rest[..start]);
                out.push_str(value);
                rest = &after[end + 2..];
            }
            None => break, // unterminated — remainder is literal
        }
    }
    out.push_str(rest);
    Ok(out)
}

/// Variable names referenced by a template, in order of first appearance —
/// used to validate sequence steps / template `variables_json` coverage.
pub fn referenced_variables(template: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find("{{") {
        let after = &rest[start + 2..];
        match after.find("}}") {
            Some(end) => {
                let name = after[..end].trim().to_string();
                if !name.is_empty() && !names.contains(&name) {
                    names.push(name);
                }
                rest = &after[end + 2..];
            }
            None => break,
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitutes_in_order() {
        let out = substitute(
            "Hi {{name}}, focus on {{topic}} — {{name}} again",
            &[("name", "alice"), ("topic", "tests")],
        )
        .unwrap();
        assert_eq!(out, "Hi alice, focus on tests — alice again");
    }

    #[test]
    fn missing_variable_is_a_typed_error_never_empty() {
        let err = substitute("run {{x}}", &[]).unwrap_err();
        assert_eq!(err, SubstituteError::UnknownVariable("x".into()));
        assert_eq!(err.to_string(), "unknown variable {{x}}");
    }

    #[test]
    fn whitespace_inside_braces_is_tolerated() {
        assert_eq!(substitute("{{ a }}", &[("a", "1")]).unwrap(), "1");
    }

    #[test]
    fn unterminated_braces_are_literal() {
        assert_eq!(substitute("a {{ b", &[]).unwrap(), "a {{ b");
        assert_eq!(substitute("}} loose", &[]).unwrap(), "}} loose");
    }

    #[test]
    fn no_variables_passthrough() {
        assert_eq!(substitute("plain text", &[]).unwrap(), "plain text");
    }

    /// The Rust↔TS contract (T8, D-M4-8): both `substitute` and the TS
    /// `renderTemplate` run against the SAME fixture file — drift = red.
    #[test]
    fn substitution_contract_fixture_holds() {
        let raw = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("fixtures/substitution-contract.json"),
        )
        .unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let cases = v["cases"].as_array().unwrap();
        assert!(cases.len() >= 8, "contract must stay meaningful");
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let template = case["template"].as_str().unwrap();
            let vars: Vec<(String, String)> = case["vars"]
                .as_object()
                .unwrap()
                .iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string()))
                .collect();
            let vars_ref: Vec<(&str, &str)> =
                vars.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
            let result = substitute(template, &vars_ref);
            match (case.get("expected"), case.get("error")) {
                (Some(expected), _) => {
                    assert_eq!(
                        result.as_deref().ok(),
                        expected.as_str(),
                        "case failed: {name}"
                    );
                }
                (None, Some(error)) => {
                    assert_eq!(
                        result.unwrap_err().to_string(),
                        error.as_str().unwrap(),
                        "case failed: {name}"
                    );
                }
                _ => panic!("contract case {name} needs expected or error"),
            }
        }
    }

    #[test]
    fn lists_referenced_variables_unique_in_order() {
        assert_eq!(
            referenced_variables("{{b}} {{a}} {{b}} {{ previous_output }}"),
            vec!["b", "a", "previous_output"]
        );
        assert!(referenced_variables("none").is_empty());
    }
}
